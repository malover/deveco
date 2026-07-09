const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" })

function terminalWidth(text: string) {
  return Bun.stringWidth(text)
}

function graphemes(text: string) {
  return Array.from(segmenter.segment(text), (part) => part.segment)
}

function wrapLongToken(token: string, width: number, lineCount: number, column: number) {
  let lines = lineCount
  let col = column

  for (const char of graphemes(token)) {
    const charWidth = terminalWidth(char)
    if (charWidth === 0) continue

    if (col > 0 && col + charWidth > width) {
      lines++
      col = 0
    }

    if (charWidth > width) {
      lines += Math.max(0, Math.ceil(charWidth / width) - 1)
      col = charWidth % width || width
      continue
    }

    col += charWidth
  }

  return { lines, col }
}

function countWrappedLine(text: string, width: number) {
  if (!text) return 1

  let lines = 1
  let col = 0
  const tokens = text.match(/\s+|\S+/gu) ?? []

  for (const token of tokens) {
    const tokenWidth = terminalWidth(token)
    if (tokenWidth === 0) continue

    if (/^\s+$/u.test(token)) {
      const wrapped = wrapLongToken(token, width, lines, col)
      lines = wrapped.lines
      col = wrapped.col
      continue
    }

    if (tokenWidth <= width) {
      if (col > 0 && col + tokenWidth > width) {
        lines++
        col = 0
      }
      col += tokenWidth
      continue
    }

    if (col > 0) {
      lines++
      col = 0
    }

    const wrapped = wrapLongToken(token, width, lines, col)
    lines = wrapped.lines
    col = wrapped.col
  }

  return lines
}

export function countWrappedTerminalLines(text: string, width: number) {
  const wrapWidth = Math.max(1, Math.floor(width))
  const logicalLines = text.split(/\r\n|\r|\n/)
  return Math.max(
    1,
    logicalLines.reduce((count, line) => count + countWrappedLine(line, wrapWidth), 0),
  )
}
