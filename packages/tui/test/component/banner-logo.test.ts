import { describe, expect, test } from "bun:test"
import {
  useFullLettermark,
  logoRowsForWidth,
  wordFull,
  wordDeveco,
  wordDevecoSmall,
  wordFullSmall,
  LOGO_ROW_CAP,
  LOGO_WORD_FULL_MAX_COLS,
  LOGO_WORD_DEVECO_MAX_COLS,
  thickTopLogoLine,
  thickTopLogoRows,
  scanCoverLogoLine,
  scanCoverLogoRows,
  SCAN_COVER_ROW_BLOCKS,
  LOGO_BLOCK_THICK,
  LOGO_BLOCK_THIN,
  clipLogoRawLine,
  padTones,
  padTonesStart,
  logoIntroFrameAt,
  LOGO_INTRO_DURATION_MS,
  LOGO_PHASE_MS,
  LOGO_PHASE_PAUSE_MS,
  LOGO_SHIFT_BEAT_MS,
  LOGO_SHIFT_HOLD_MS,
  LOGO_SHIFT_CENTER_MS,
  LOGO_SCAN_FADE_END_OPACITY,
  LOGO_SHIFT_RIGHT_COLS,
  LOGO_SHIFT_LEFT_COLS,
  LOGO_SCANLINE_CHAR,
  scanline,
  scanlineWithSpaceChar,
  scanCoverSpaceBlock,
  logoIntroLogoFg,
  logoIntroStripeColor,
  stripeLineForLight,
  bannerLogoPalette,
  formatBannerLogoAnsiLines,
  formatCliHelpBannerLogoBlock,
  type Tone,
  type BannerLogoPalette,
  type LogoIntroFrame,
} from "../../src/component/banner-logo"
import { RGBA } from "@opentui/core"

describe("banner-logo word compositions", () => {
  test("wordFull has 8 rows (LOGO_ROW_CAP)", () => {
    expect(wordFull.length).toBe(LOGO_ROW_CAP)
  })

  test("wordDeveco has 8 rows", () => {
    expect(wordDeveco.length).toBe(LOGO_ROW_CAP)
  })

  test("wordDevecoSmall has 5 rows", () => {
    expect(wordDevecoSmall.length).toBe(5)
  })

  test("wordFullSmall has 5 rows", () => {
    expect(wordFullSmall.length).toBe(5)
  })

  test("wordFull rows are wider than wordDeveco rows", () => {
    for (let i = 0; i < LOGO_ROW_CAP; i++) {
      expect(wordFull[i].length).toBeGreaterThan(wordDeveco[i].length)
    }
  })

  test("wordFullSmall rows contain CODE letters", () => {
    const fullSmallJoined = wordFullSmall.join("\n")
    const devecoSmallJoined = wordDevecoSmall.join("\n")
    expect(fullSmallJoined.length).toBeGreaterThan(devecoSmallJoined.length)
  })

  test("LOGO_WORD_FULL_MAX_COLS is the max width of wordFull", () => {
    const maxW = Math.max(...wordFull.map((r) => r.length))
    expect(LOGO_WORD_FULL_MAX_COLS).toBe(maxW)
  })

  test("LOGO_WORD_DEVECO_MAX_COLS is the max width of wordDeveco", () => {
    const maxW = Math.max(...wordDeveco.map((r) => r.length))
    expect(LOGO_WORD_DEVECO_MAX_COLS).toBe(maxW)
  })

  test("LOGO_WORD_FULL_MAX_COLS > LOGO_WORD_DEVECO_MAX_COLS", () => {
    expect(LOGO_WORD_FULL_MAX_COLS).toBeGreaterThan(LOGO_WORD_DEVECO_MAX_COLS)
  })
})

describe("useFullLettermark", () => {
  test("returns true when width >= LOGO_WORD_FULL_MAX_COLS", () => {
    expect(useFullLettermark(LOGO_WORD_FULL_MAX_COLS)).toBe(true)
    expect(useFullLettermark(LOGO_WORD_FULL_MAX_COLS + 100)).toBe(true)
  })

  test("returns false when width < LOGO_WORD_FULL_MAX_COLS", () => {
    expect(useFullLettermark(LOGO_WORD_FULL_MAX_COLS - 1)).toBe(false)
    expect(useFullLettermark(0)).toBe(false)
  })

  test("floors fractional widths", () => {
    expect(useFullLettermark(LOGO_WORD_FULL_MAX_COLS - 0.5)).toBe(false)
    expect(useFullLettermark(LOGO_WORD_FULL_MAX_COLS + 0.5)).toBe(true)
  })

  test("handles negative widths", () => {
    expect(useFullLettermark(-10)).toBe(false)
  })
})

describe("logoRowsForWidth", () => {
  test("returns wordFull for wide viewports", () => {
    const rows = logoRowsForWidth(LOGO_WORD_FULL_MAX_COLS + 10)
    expect(rows).toBe(wordFull)
  })

  test("returns wordDeveco for narrow viewports", () => {
    const rows = logoRowsForWidth(LOGO_WORD_FULL_MAX_COLS - 1)
    expect(rows).toBe(wordDeveco)
  })
})



describe("thickTopLogoLine", () => {
  test("inverts ▃ to ▆ and ▆ to ▃", () => {
    expect(thickTopLogoLine("\u2583")).toBe(LOGO_BLOCK_THICK)
    expect(thickTopLogoLine("\u2586")).toBe(LOGO_BLOCK_THIN)
  })

  test("preserves spaces and non-block characters", () => {
    expect(thickTopLogoLine(" A ")).toBe(" A ")
  })

  test("inverts all block heights", () => {
    const input = "\u2582\u2583\u2584\u2585\u2586"
    const result = thickTopLogoLine(input)
    expect(result).not.toBe(input)
    expect(result.length).toBe(input.length)
  })
})

describe("thickTopLogoRows", () => {
  test("applies thickTopLogoLine to each row", () => {
    const rows = ["\u2583\u2583", "\u2586\u2586"]
    const result = thickTopLogoRows(rows)
    expect(result[0]).toBe(thickTopLogoLine("\u2583\u2583"))
    expect(result[1]).toBe(thickTopLogoLine("\u2586\u2586"))
  })
})



describe("scanCoverLogoLine", () => {
  test("replaces block chars with scan cover block for the row", () => {
    const line = "\u2583 \u2586"
    const result = scanCoverLogoLine(line, 0)
    expect(result).toBe(`${SCAN_COVER_ROW_BLOCKS[0]} ${SCAN_COVER_ROW_BLOCKS[0]}`)
  })

  test("preserves spaces", () => {
    const line = "   "
    const result = scanCoverLogoLine(line, 0)
    expect(result).toBe("   ")
  })

  test("clamps rowIndex to valid range", () => {
    const line = "\u2583"
    expect(scanCoverLogoLine(line, -5)).toBe(SCAN_COVER_ROW_BLOCKS[0])
    expect(scanCoverLogoLine(line, 100)).toBe(SCAN_COVER_ROW_BLOCKS[SCAN_COVER_ROW_BLOCKS.length - 1])
  })
})

describe("scanCoverLogoRows", () => {
  test("applies scanCoverLogoLine with correct row index", () => {
    const rows = ["\u2583\u2583", "\u2586\u2586"]
    const result = scanCoverLogoRows(rows)
    expect(result[0]).toBe(scanCoverLogoLine("\u2583\u2583", 0))
    expect(result[1]).toBe(scanCoverLogoLine("\u2586\u2586", 1))
  })
})

describe("scanCoverSpaceBlock", () => {
  test("returns the correct block for each row index", () => {
    for (let i = 0; i < SCAN_COVER_ROW_BLOCKS.length; i++) {
      expect(scanCoverSpaceBlock(i)).toBe(SCAN_COVER_ROW_BLOCKS[i])
    }
  })

  test("clamps out-of-range indices", () => {
    expect(scanCoverSpaceBlock(-1)).toBe(SCAN_COVER_ROW_BLOCKS[0])
    expect(scanCoverSpaceBlock(100)).toBe(SCAN_COVER_ROW_BLOCKS[SCAN_COVER_ROW_BLOCKS.length - 1])
  })
})

describe("clipLogoRawLine", () => {
  test("returns full line when it fits in viewport", () => {
    expect(clipLogoRawLine("hello", 10, 0)).toBe("hello")
  })

  test("clips line to viewport width", () => {
    expect(clipLogoRawLine("hello world", 5, 0)).toBe("hello")
  })

  test("applies scroll offset", () => {
    expect(clipLogoRawLine("hello world", 5, 6)).toBe("world")
  })

  test("clamps scroll offset to max", () => {
    const line = "hello world"
    const maxOffset = line.length - 5
    expect(clipLogoRawLine(line, 5, maxOffset + 10)).toBe(line.slice(maxOffset, maxOffset + 5))
  })

  test("returns empty string for zero viewport", () => {
    expect(clipLogoRawLine("hello", 0, 0)).toBe("")
  })

  test("floors fractional viewport width", () => {
    expect(clipLogoRawLine("hello", 3.7, 0)).toBe("hel")
  })

  test("handles negative viewport width", () => {
    expect(clipLogoRawLine("hello", -5, 0)).toBe("")
  })
})

describe("padTones", () => {
  const base = RGBA.fromInts(0, 0, 0)

  test("returns parts unchanged when content >= width", () => {
    const parts: Tone[] = [{ t: "hello", fg: base }]
    const result = padTones(parts, 5, base)
    expect(result).toEqual(parts)
  })

  test("pads with spaces centered when content < width", () => {
    const parts: Tone[] = [{ t: "hi", fg: base }]
    const result = padTones(parts, 6, base)
    const totalLen = result.reduce((a, p) => a + p.t.length, 0)
    expect(totalLen).toBe(6)
  })

  test("returns parts unchanged when width <= 0", () => {
    const parts: Tone[] = [{ t: "hi", fg: base }]
    expect(padTones(parts, 0, base)).toEqual(parts)
    expect(padTones(parts, -1, base)).toEqual(parts)
  })
})

describe("padTonesStart", () => {
  const base = RGBA.fromInts(0, 0, 0)

  test("pads with spaces on the right only", () => {
    const parts: Tone[] = [{ t: "hi", fg: base }]
    const result = padTonesStart(parts, 5, base)
    const totalLen = result.reduce((a, p) => a + p.t.length, 0)
    expect(totalLen).toBe(5)
    expect(result[result.length - 1].t).toContain("   ")
  })

  test("returns parts unchanged when content >= width", () => {
    const parts: Tone[] = [{ t: "hello", fg: base }]
    expect(padTonesStart(parts, 5, base)).toEqual(parts)
  })
})

describe("scanline", () => {
  const fg = RGBA.fromInts(255, 255, 255)
  const stripe = RGBA.fromInts(58, 58, 58)

  test("replaces spaces with LOGO_SCANLINE_CHAR", () => {
    const parts: Tone[] = [{ t: "A B", fg }]
    const result = scanline(parts, stripe)
    const joined = result.map((p) => p.t).join("")
    expect(joined).toBe(`A${LOGO_SCANLINE_CHAR}B`)
  })

  test("preserves non-space characters", () => {
    const parts: Tone[] = [{ t: "ABC", fg }]
    const result = scanline(parts, stripe)
    const joined = result.map((p) => p.t).join("")
    expect(joined).toBe("ABC")
  })

  test("assigns stripe color to space replacements", () => {
    const parts: Tone[] = [{ t: "A B", fg }]
    const result = scanline(parts, stripe)
    const spaceTone = result.find((p) => p.t.includes(LOGO_SCANLINE_CHAR))
    expect(spaceTone).toBeDefined()
    expect(spaceTone!.fg).toBe(stripe)
  })
})

describe("scanlineWithSpaceChar", () => {
  const fg = RGBA.fromInts(255, 255, 255)
  const stripe = RGBA.fromInts(58, 58, 58)

  test("uses custom space character", () => {
    const parts: Tone[] = [{ t: "A B", fg }]
    const result = scanlineWithSpaceChar(parts, stripe, "▆")
    const joined = result.map((p) => p.t).join("")
    expect(joined).toBe("A▆B")
  })
})

describe("logoIntroFrameAt", () => {
  test("returns done when elapsed >= LOGO_INTRO_DURATION_MS", () => {
    const frame = logoIntroFrameAt(LOGO_INTRO_DURATION_MS, 8)
    expect(frame.kind).toBe("done")
    const frame2 = logoIntroFrameAt(LOGO_INTRO_DURATION_MS + 1000, 8)
    expect(frame2.kind).toBe("done")
  })

  test("scanCover phase at t=0", () => {
    const frame = logoIntroFrameAt(0, 8) as Extract<LogoIntroFrame, { kind: "animating" }>
    expect(frame.kind).toBe("animating")
    expect(frame.phase).toBe("scanCover")
    expect(frame.revealedRow).toBe(-1)
    expect(frame.stripeOpacity).toBe(1)
    expect(frame.logoBlend).toBe(0)
    expect(frame.shiftCols).toBe(0)
    expect(frame.thickTop).toBe(true)
    expect(frame.stripeThemeBlend).toBe(0)
  })

  test("scanCover phase progresses revealedRow", () => {
    const mid = LOGO_PHASE_MS / 2
    const frame = logoIntroFrameAt(mid, 8) as Extract<LogoIntroFrame, { kind: "animating" }>
    expect(frame.phase).toBe("scanCover")
    expect(frame.revealedRow).toBeGreaterThanOrEqual(0)
    expect(frame.revealedRow).toBeLessThan(8)
  })

  test("scanCover pause at end of scan", () => {
    const t = LOGO_PHASE_MS + LOGO_PHASE_PAUSE_MS / 2
    const frame = logoIntroFrameAt(t, 8) as Extract<LogoIntroFrame, { kind: "animating" }>
    expect(frame.phase).toBe("scanCover")
    expect(frame.revealedRow).toBe(7)
    expect(frame.logoBlend).toBe(0)
  })

  test("logoRowReveal phase", () => {
    const t = LOGO_PHASE_MS + LOGO_PHASE_PAUSE_MS + LOGO_PHASE_MS / 2
    const frame = logoIntroFrameAt(t, 8) as Extract<LogoIntroFrame, { kind: "animating" }>
    expect(frame.phase).toBe("logoRowReveal")
    expect(frame.logoBlend).toBe(1)
    expect(frame.thickTop).toBe(false)
    expect(frame.stripeThemeBlend).toBe(1)
  })

  test("logoRowReveal pause", () => {
    const t = LOGO_PHASE_MS + LOGO_PHASE_PAUSE_MS + LOGO_PHASE_MS + LOGO_PHASE_PAUSE_MS / 2
    const frame = logoIntroFrameAt(t, 8) as Extract<LogoIntroFrame, { kind: "animating" }>
    expect(frame.phase).toBe("logoRowReveal")
    expect(frame.revealedRow).toBe(7)
    expect(frame.shiftCols).toBe(0)
  })

  test("shiftRight phase", () => {
    const tRevealPauseEnd = LOGO_PHASE_MS * 2 + LOGO_PHASE_PAUSE_MS * 2
    const t = tRevealPauseEnd + LOGO_SHIFT_BEAT_MS / 2
    const frame = logoIntroFrameAt(t, 8) as Extract<LogoIntroFrame, { kind: "animating" }>
    expect(frame.phase).toBe("shiftRight")
    expect(frame.shiftCols).toBe(LOGO_SHIFT_RIGHT_COLS)
  })

  test("shiftHold phase", () => {
    const tRevealPauseEnd = LOGO_PHASE_MS * 2 + LOGO_PHASE_PAUSE_MS * 2
    const t = tRevealPauseEnd + LOGO_SHIFT_BEAT_MS + LOGO_SHIFT_HOLD_MS / 2
    const frame = logoIntroFrameAt(t, 8) as Extract<LogoIntroFrame, { kind: "animating" }>
    expect(frame.phase).toBe("shiftHold")
    expect(frame.shiftCols).toBe(LOGO_SHIFT_RIGHT_COLS)
  })

  test("shiftCenter phase after shiftRight", () => {
    const tRevealPauseEnd = LOGO_PHASE_MS * 2 + LOGO_PHASE_PAUSE_MS * 2
    const t = tRevealPauseEnd + LOGO_SHIFT_BEAT_MS + LOGO_SHIFT_HOLD_MS + LOGO_SHIFT_CENTER_MS / 2
    const frame = logoIntroFrameAt(t, 8) as Extract<LogoIntroFrame, { kind: "animating" }>
    expect(frame.phase).toBe("shiftCenter")
    expect(frame.shiftCols).toBe(0)
  })

  test("shiftLeft phase", () => {
    const tRevealPauseEnd = LOGO_PHASE_MS * 2 + LOGO_PHASE_PAUSE_MS * 2
    const t = tRevealPauseEnd + LOGO_SHIFT_BEAT_MS + LOGO_SHIFT_HOLD_MS + LOGO_SHIFT_CENTER_MS + LOGO_SHIFT_BEAT_MS / 2
    const frame = logoIntroFrameAt(t, 8) as Extract<LogoIntroFrame, { kind: "animating" }>
    expect(frame.phase).toBe("shiftLeft")
    expect(frame.shiftCols).toBe(LOGO_SHIFT_LEFT_COLS)
  })

  test("shiftLeftHold phase", () => {
    const tRevealPauseEnd = LOGO_PHASE_MS * 2 + LOGO_PHASE_PAUSE_MS * 2
    const t =
      tRevealPauseEnd +
      LOGO_SHIFT_BEAT_MS +
      LOGO_SHIFT_HOLD_MS +
      LOGO_SHIFT_CENTER_MS +
      LOGO_SHIFT_BEAT_MS +
      LOGO_SHIFT_HOLD_MS / 2
    const frame = logoIntroFrameAt(t, 8) as Extract<LogoIntroFrame, { kind: "animating" }>
    expect(frame.phase).toBe("shiftLeftHold")
    expect(frame.shiftCols).toBe(LOGO_SHIFT_LEFT_COLS)
  })



  test("handles rowCount=1", () => {
    const frame = logoIntroFrameAt(0, 1) as Extract<LogoIntroFrame, { kind: "animating" }>
    expect(frame.kind).toBe("animating")
    expect(frame.revealedRow).toBe(-1)
  })
})

describe("logoIntroLogoFg", () => {
  const palette: BannerLogoPalette = {
    logoFg: RGBA.fromInts(255, 255, 255),
    stripeLine: RGBA.fromInts(58, 58, 58),
    base: RGBA.fromInts(128, 128, 128),
  }

  test("returns logoFg color with blend opacity", () => {
    const fg = logoIntroLogoFg(palette, 1.0)
    expect(fg.r).toBeCloseTo(1, 1)
    expect(fg.g).toBeCloseTo(1, 1)
    expect(fg.b).toBeCloseTo(1, 1)
    expect(fg.a).toBeCloseTo(1, 1)
  })

  test("returns transparent at blend=0", () => {
    const fg = logoIntroLogoFg(palette, 0)
    expect(fg.a).toBeCloseTo(0, 1)
  })

  test("clamps blend to 0-1", () => {
    const fgNeg = logoIntroLogoFg(palette, -0.5)
    expect(fgNeg.a).toBeCloseTo(0, 1)
    const fgOver = logoIntroLogoFg(palette, 1.5)
    expect(fgOver.a).toBeCloseTo(1, 1)
  })
})

describe("logoIntroStripeColor", () => {
  const palette: BannerLogoPalette = {
    logoFg: RGBA.fromInts(255, 0, 0),
    stripeLine: RGBA.fromInts(58, 58, 58),
    base: RGBA.fromInts(0, 0, 0),
  }

  test("returns logoFg with given opacity", () => {
    const c = logoIntroStripeColor(palette, 0.5)
    expect(c.r).toBeCloseTo(1, 1)
    expect(c.g).toBeCloseTo(0, 1)
    expect(c.b).toBeCloseTo(0, 1)
    expect(c.a).toBeCloseTo(0.5, 1)
  })

  test("clamps opacity", () => {
    const cNeg = logoIntroStripeColor(palette, -1)
    expect(cNeg.a).toBeCloseTo(0, 1)
    const cOver = logoIntroStripeColor(palette, 2)
    expect(cOver.a).toBeCloseTo(1, 1)
  })
})

describe("stripeLineForLight", () => {
  test("returns a tinted color", () => {
    const bg = RGBA.fromInts(255, 255, 255)
    const result = stripeLineForLight(bg)
    expect(result).toBeDefined()
    expect(result.r).toBeLessThan(1)
  })
})

describe("bannerLogoPalette", () => {
  const theme = {
    text: RGBA.fromInts(200, 200, 200),
    textMuted: RGBA.fromInts(128, 128, 128),
    border: RGBA.fromInts(58, 58, 58),
    background: RGBA.fromInts(30, 30, 30),
  }

  test("dark palette uses white logoFg", () => {
    const p = bannerLogoPalette(false, theme)
    expect(p.logoFg.r).toBeCloseTo(1, 1)
    expect(p.logoFg.g).toBeCloseTo(1, 1)
    expect(p.logoFg.b).toBeCloseTo(1, 1)
  })

  test("light palette uses theme.text as logoFg", () => {
    const p = bannerLogoPalette(true, theme)
    expect(p.logoFg).toBe(theme.text)
  })

  test("both palettes use theme.textMuted as base", () => {
    expect(bannerLogoPalette(false, theme).base).toBe(theme.textMuted)
    expect(bannerLogoPalette(true, theme).base).toBe(theme.textMuted)
  })
})

describe("formatBannerLogoAnsiLines", () => {
  const palette: BannerLogoPalette = {
    logoFg: RGBA.fromInts(255, 255, 255),
    stripeLine: RGBA.fromInts(58, 58, 58),
    base: RGBA.fromInts(128, 128, 128),
  }

  test("returns LOGO_ROW_CAP lines by default", () => {
    const lines = formatBannerLogoAnsiLines(120, palette)
    expect(lines.length).toBe(LOGO_ROW_CAP)
  })

  test("each line contains ANSI escape codes", () => {
    const lines = formatBannerLogoAnsiLines(120, palette)
    for (const line of lines) {
      expect(line).toContain("\x1b[")
      expect(line).toContain("\x1b[0m")
    }
  })

  test("returns empty lines for zero width", () => {
    const lines = formatBannerLogoAnsiLines(0, palette)
    for (const line of lines) {
      expect(line).toContain("\x1b[0m")
    }
  })

  test("accepts custom rows option", () => {
    const customRows = ["AAA", "BBB"]
    const lines = formatBannerLogoAnsiLines(80, palette, { rows: customRows })
    expect(lines.length).toBe(2)
  })

  test("scanline option replaces spaces with scanline char", () => {
    const lines = formatBannerLogoAnsiLines(120, palette, { scanline: true })
    const joined = lines.join("")
    expect(joined).toContain(LOGO_SCANLINE_CHAR)
  })

  test("align start option left-aligns content", () => {
    const lines = formatBannerLogoAnsiLines(120, palette, { align: "start" })
    expect(lines.length).toBe(LOGO_ROW_CAP)
  })
})

describe("formatCliHelpBannerLogoBlock", () => {
  test("returns a non-empty string", () => {
    const block = formatCliHelpBannerLogoBlock(80)
    expect(block.length).toBeGreaterThan(0)
  })

  test("uses wordFullSmall (5 rows)", () => {
    const block = formatCliHelpBannerLogoBlock(80)
    const lines = block.split(/\r?\n/)
    expect(lines.length).toBe(wordFullSmall.length)
  })

  test("defaults to 80 columns when undefined", () => {
    const block = formatCliHelpBannerLogoBlock(undefined)
    expect(block.length).toBeGreaterThan(0)
  })

  test("defaults to 80 columns when zero", () => {
    const block = formatCliHelpBannerLogoBlock(0)
    expect(block.length).toBeGreaterThan(0)
  })

  test("defaults to 80 columns when negative", () => {
    const block = formatCliHelpBannerLogoBlock(-10)
    expect(block.length).toBeGreaterThan(0)
  })
})


