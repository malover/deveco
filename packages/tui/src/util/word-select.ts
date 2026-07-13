// iTerm2 default "characters considered part of a word": /-+\~_.
const WORD_CHAR = /[\p{L}\p{N}_/.\-+~\\]/u

const ZERO_WIDTH_RE = /[\u200b-\u200f\u2028-\u202f\u2060-\u206f\ufe00-\ufe0f]/g

export function charClass(c: string): 0 | 1 | 2 {
  if (c === " " || c === "") return 0
  if (WORD_CHAR.test(c)) return 1
  return 2
}

export function wordBounds(
  text: string,
  charIndex: number,
): { start: number; end: number } | null {
  if (charIndex < 0 || charIndex >= text.length) return null
  if (charIndex > 0 && text.charCodeAt(charIndex) >= 0xdc00 && text.charCodeAt(charIndex) <= 0xdfff) {
    charIndex--
  }
  const cls = charClass(text[charIndex]!)

  let start = charIndex
  while (start > 0) {
    const prev = text[start - 1]!
    if (prev === "\n") break
    if (prev.charCodeAt(0) >= 0xd800 && prev.charCodeAt(0) <= 0xdbff) break
    if (charClass(prev) !== cls) break
    start--
  }

  let end = charIndex
  while (end < text.length - 1) {
    const next = text[end + 1]!
    if (next === "\n") break
    if (charClass(next) !== cls) break
    end++
    if (end < text.length - 1 && text.charCodeAt(end) >= 0xdc00 && text.charCodeAt(end) <= 0xdfff) end++
  }

  return { start, end }
}

type SelectableRenderable = {
  plainText?: string
  content?: string
  scrollY?: number
  x?: number
  y?: number
}

type SelectionAPI = {
  startSelection(renderable: unknown, x: number, y: number): void
  updateSelection(renderable: unknown, x: number, y: number): void
  clearSelection(): void
}

function getTextAndSource(target: unknown): { text: string; source: SelectableRenderable } | null {
  if (!target || typeof target !== "object") return null
  const r = target as SelectableRenderable

  if (typeof r.plainText === "string") return { text: r.plainText, source: r }
  if (typeof r.content === "string") return { text: r.content, source: r }

  const parent = (target as { parent?: unknown }).parent
  if (parent) return getTextAndSource(parent)

  return null
}

function displayWidth(line: string, from: number, to: number): number {
  return Bun.stringWidth(line.slice(from, to))
}

function colToCharIndex(line: string, col: number): number {
  let w = 0
  for (let i = 0; i < line.length; i++) {
    if (w >= col) return i
    w += displayWidth(line, i, i + 1)
  }
  return line.length
}

function charIndexToCol(line: string, charIndex: number): number {
  return displayWidth(line, 0, Math.min(charIndex, line.length))
}

function charIndexToPosition(
  lines: string[],
  charIndex: number,
  scrollY: number,
): { col: number; row: number } {
  let offset = 0
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const lineLen = lines[lineIdx]!.length
    if (charIndex <= offset + lineLen) {
      return {
        col: charIndexToCol(lines[lineIdx]!, charIndex - offset),
        row: lineIdx - scrollY,
      }
    }
    offset += lineLen + 1
  }
  const lastLine = lines[lines.length - 1]!
  return { col: charIndexToCol(lastLine, lastLine.length), row: lines.length - 1 - scrollY }
}

export function selectWordAt(
  renderer: SelectionAPI,
  target: unknown,
  x: number,
  y: number,
): boolean {
  const result = getTextAndSource(target)
  if (!result || result.text.length === 0) return false

  const rawText = result.text
  const text = ZERO_WIDTH_RE.test(rawText) ? rawText.replace(ZERO_WIDTH_RE, "") : rawText
  if (text.length === 0) return false

  const scrollY = result.source.scrollY ?? 0
  const renderableX = result.source.x ?? 0
  const renderableY = result.source.y ?? 0

  const localX = x - renderableX
  const localY = y - renderableY
  const visualRow = localY + scrollY

  const lines = text.split("\n")
  if (visualRow < 0 || visualRow >= lines.length) return false

  let charIndex = 0
  for (let i = 0; i < visualRow; i++) {
    charIndex += lines[i]!.length + 1
  }
  charIndex += colToCharIndex(lines[visualRow]!, localX)

  if (charIndex >= text.length) charIndex = text.length - 1
  if (charIndex < 0) return false

  const bounds = wordBounds(text, charIndex)
  if (!bounds) return false

  const startPos = charIndexToPosition(lines, bounds.start, scrollY)

  let endLineOffset = 0
  let endRow = 0
  let endCol = 0
  for (let i = 0; i < lines.length; i++) {
    if (bounds.end <= endLineOffset + lines[i]!.length) {
      endCol = charIndexToCol(lines[i]!, bounds.end - endLineOffset + 1)
      endRow = i - scrollY
      break
    }
    endLineOffset += lines[i]!.length + 1
  }

  if (startPos.row < 0 && endRow < 0) return false
  if (startPos.row < 0) {
    startPos.col = 0
    startPos.row = 0
  }

  renderer.startSelection(result.source, startPos.col + renderableX, startPos.row + renderableY)
  renderer.updateSelection(result.source, endCol + renderableX, endRow + renderableY)

  return true
}
