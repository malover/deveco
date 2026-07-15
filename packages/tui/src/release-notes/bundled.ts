import path from "path"
import { fileURLToPath } from "url"
import { type ReleaseMeta, compareTags, normalizeVersion, parseSemver } from "./shared"

const HEADER_RE = /^## (v?\d\S+)(?:\s+\((\d{4}-\d{2}-\d{2})\))?/

export interface ParsedSection {
  tag: string
  createdAt: string
  prerelease: boolean
  body: string
}

function flushSection(current: { tag: string; createdAt: string; bodyLines: string[] }): ParsedSection {
  return {
    tag: current.tag,
    createdAt: current.createdAt,
    prerelease: parseSemver(current.tag)?.pre !== undefined,
    body: current.bodyLines.join("\n").trim(),
  }
}

export function parseSections(raw: string): ParsedSection[] {
  const lines = raw.split("\n")
  const sections: ParsedSection[] = []
  let current: { tag: string; createdAt: string; bodyLines: string[] } | undefined

  for (const line of lines) {
    const match = line.match(HEADER_RE)
    if (match) {
      if (current) sections.push(flushSection(current))
      current = { tag: match[1], createdAt: match[2] ?? "", bodyLines: [] }
    } else if (current) {
      current.bodyLines.push(line)
    }
  }

  if (current) sections.push(flushSection(current))
  return sections
}

async function resolveChangelogPath(): Promise<string | null> {
  const execDir = path.dirname(process.execPath)
  const prodPath = path.join(execDir, "..", "CHANGELOG.md")
  if (await Bun.file(prodPath).exists()) return prodPath

  const thisDir = path.dirname(fileURLToPath(import.meta.url))
  const devPath = path.resolve(thisDir, "..", "..", "..", "..", "CHANGELOG.md")
  if (await Bun.file(devPath).exists()) return devPath

  return null
}

interface ChangelogData {
  releases: ReleaseMeta[]
  getBody: (tag: string) => string | null
}

let cached: Promise<ChangelogData | null> | null = null

export function loadChangelog(): Promise<ChangelogData | null> {
  if (cached) return cached
  cached = (async () => {
    const filePath = await resolveChangelogPath()
    if (!filePath) return null

    const raw = await Bun.file(filePath).text()
    const sections = parseSections(raw)

    const bodyByTag = new Map<string, string>()
    for (const s of sections) {
      bodyByTag.set(normalizeVersion(s.tag) ?? s.tag, s.body)
    }

    const releases: ReleaseMeta[] = sections
      .map<ReleaseMeta>((s) => ({
        tag: s.tag,
        createdAt: s.createdAt,
        prerelease: s.prerelease,
      }))
      .sort((a, b) => compareTags(a.tag, b.tag))

    return {
      releases,
      getBody: (tag: string) => {
        const key = normalizeVersion(tag) ?? tag
        return bodyByTag.get(key) ?? null
      },
    }
  })()
  return cached
}
