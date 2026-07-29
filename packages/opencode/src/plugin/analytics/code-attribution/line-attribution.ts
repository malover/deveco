import { diffArrays } from "diff"
import type { AiCodeAttributionEvent } from "../types"

export const ATTRIBUTION_SOURCE = {
  AI: "DevEcoAI",
  BASELINE: "Baseline",
  HUMAN: "KnownHuman",
  UNKNOWN: "Unknown",
} as const

export type AttributionSource = (typeof ATTRIBUTION_SOURCE)[keyof typeof ATTRIBUTION_SOURCE]

export interface AttributedFile {
  content: string
  sources: AttributionSource[]
}

function splitLines(content: string): string[] {
  if (!content) return []
  const lines = content.split("\n")
  if (lines.at(-1) === "") lines.pop()
  return lines.map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line))
}

function normalizedLine(line: string): string {
  return line
    .trim()
    .replace(/\s*([=,;:{}()[\]])\s*/g, "$1")
    .replace(/\s+/g, " ")
}

function quotedSegments(line: string): string[] {
  const result: string[] = []
  for (let index = 0; index < line.length; index++) {
    const quote = line[index]
    if (quote !== '"' && quote !== "'" && quote !== "`") continue
    let segment = quote
    for (index++; index < line.length; index++) {
      const character = line[index] ?? ""
      segment += character
      if (character === "\\") {
        const escaped = line[++index]
        if (escaped) segment += escaped
        continue
      }
      if (character === quote) break
    }
    result.push(segment)
  }
  return result
}

function formattingKey(line: string): string | undefined {
  const normalized = normalizedLine(line)
  if (!normalized) return undefined
  return `${normalized}\0${JSON.stringify(quotedSegments(line))}`
}

export function createAttributedFile(
  content: string,
  source: AttributionSource = ATTRIBUTION_SOURCE.UNKNOWN,
): AttributedFile {
  return {
    content,
    sources: splitLines(content).map(() => source),
  }
}

interface RemovedLine {
  line: string
  source: AttributionSource
  used: boolean
}

interface RemovedLineQueue {
  values: RemovedLine[]
  cursor: number
}

interface RemovedLineIndex {
  exact: Map<string, RemovedLineQueue>
  formatted: Map<string, RemovedLineQueue>
}

function removedLines(
  previousLines: string[],
  previousSources: AttributionSource[],
  nextLines: string[],
): RemovedLine[] {
  const changes = diffArrays(previousLines, nextLines)
  const result: RemovedLine[] = []
  let previousIndex = 0
  for (const change of changes) {
    if (change.added) continue
    if (change.removed) {
      for (let index = 0; index < change.value.length; index++) {
        result.push({
          line: change.value[index] ?? "",
          source: previousSources[previousIndex + index] ?? ATTRIBUTION_SOURCE.UNKNOWN,
          used: false,
        })
      }
    }
    previousIndex += change.value.length
  }
  return result
}

function addToIndex(index: Map<string, RemovedLineQueue>, key: string, value: RemovedLine): void {
  const queue = index.get(key)
  if (queue) {
    queue.values.push(value)
    return
  }
  index.set(key, { values: [value], cursor: 0 })
}

function indexRemovedLines(removed: RemovedLine[]): RemovedLineIndex {
  const index: RemovedLineIndex = { exact: new Map(), formatted: new Map() }
  for (const value of removed) {
    addToIndex(index.exact, value.line, value)
    const key = formattingKey(value.line)
    if (key) addToIndex(index.formatted, key, value)
  }
  return index
}

function takeAvailable(index: Map<string, RemovedLineQueue>, key: string): RemovedLine | undefined {
  const queue = index.get(key)
  if (!queue) return undefined
  while (queue.cursor < queue.values.length) {
    const candidate = queue.values[queue.cursor++]
    if (candidate && !candidate.used) return candidate
  }
  return undefined
}

function preservedSource(line: string, removed: RemovedLineIndex): AttributionSource | undefined {
  const exact = takeAvailable(removed.exact, line)
  if (exact) {
    exact.used = true
    return exact.source
  }

  const key = formattingKey(line)
  if (!key) return undefined
  const formatted = takeAvailable(removed.formatted, key)
  if (!formatted) return undefined
  formatted.used = true
  return formatted.source
}

export function attributeContent(previous: AttributedFile, content: string, source: AttributionSource): AttributedFile {
  if (previous.content === content) return previous
  const previousLines = splitLines(previous.content)
  const nextLines = splitLines(content)
  const previousSources =
    previous.sources.length === previousLines.length
      ? previous.sources
      : previousLines.map(() => ATTRIBUTION_SOURCE.UNKNOWN)
  const removed = indexRemovedLines(removedLines(previousLines, previousSources, nextLines))
  const sources: AttributionSource[] = []
  let previousIndex = 0

  for (const change of diffArrays(previousLines, nextLines)) {
    if (change.removed) {
      previousIndex += change.value.length
      continue
    }
    if (change.added) {
      for (const line of change.value) sources.push(preservedSource(line, removed) ?? source)
      continue
    }
    sources.push(...previousSources.slice(previousIndex, previousIndex + change.value.length))
    previousIndex += change.value.length
  }

  return { content, sources }
}

export function countAddedLines(
  parentContent: string,
  committed: AttributedFile,
): Omit<AiCodeAttributionEvent, "projectId"> {
  const parentLines = splitLines(parentContent)
  const committedLines = splitLines(committed.content)
  let committedIndex = 0
  let aiGeneratedLines = 0
  let humanGeneratedLines = 0
  let unknownGeneratedLines = 0

  for (const change of diffArrays(parentLines, committedLines)) {
    if (change.removed) continue
    if (!change.added) {
      committedIndex += change.value.length
      continue
    }

    for (let index = 0; index < change.value.length; index++) {
      const line = change.value[index] ?? ""
      const source = committed.sources[committedIndex + index] ?? ATTRIBUTION_SOURCE.UNKNOWN
      if (!line.trim()) continue
      if (source === ATTRIBUTION_SOURCE.AI) aiGeneratedLines++
      if (source === ATTRIBUTION_SOURCE.HUMAN) humanGeneratedLines++
      if (source === ATTRIBUTION_SOURCE.UNKNOWN) unknownGeneratedLines++
    }
    committedIndex += change.value.length
  }

  return {
    aiGeneratedLines,
    humanGeneratedLines,
    unknownGeneratedLines,
    totalGeneratedLines: aiGeneratedLines + humanGeneratedLines + unknownGeneratedLines,
  }
}
