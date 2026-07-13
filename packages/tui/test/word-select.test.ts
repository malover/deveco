import { describe, expect, test } from "bun:test"
import { charClass, selectWordAt, wordBounds } from "../src/util/word-select"

describe("charClass", () => {
  test("space is class 0", () => {
    expect(charClass(" ")).toBe(0)
  })

  test("empty string is class 0", () => {
    expect(charClass("")).toBe(0)
  })

  test("letters are class 1", () => {
    expect(charClass("a")).toBe(1)
    expect(charClass("Z")).toBe(1)
  })

  test("digits are class 1", () => {
    expect(charClass("0")).toBe(1)
    expect(charClass("9")).toBe(1)
  })

  test("iTerm2 word-part punctuation is class 1", () => {
    expect(charClass("/")).toBe(1)
    expect(charClass("-")).toBe(1)
    expect(charClass("+")).toBe(1)
    expect(charClass("~")).toBe(1)
    expect(charClass("_")).toBe(1)
    expect(charClass(".")).toBe(1)
    expect(charClass("\\")).toBe(1)
  })

  test("other punctuation is class 2", () => {
    expect(charClass("(")).toBe(2)
    expect(charClass(")")).toBe(2)
    expect(charClass("=")).toBe(2)
    expect(charClass(">")).toBe(2)
    expect(charClass(",")).toBe(2)
    expect(charClass(";")).toBe(2)
  })

  test("unicode letters are class 1", () => {
    expect(charClass("中")).toBe(1)
    expect(charClass("é")).toBe(1)
  })
})

describe("wordBounds", () => {
  test("returns null for out-of-range index", () => {
    expect(wordBounds("hello", -1)).toBeNull()
    expect(wordBounds("hello", 10)).toBeNull()
  })

  test("returns null for empty text", () => {
    expect(wordBounds("", 0)).toBeNull()
  })

  test("selects a simple word", () => {
    expect(wordBounds("hello world", 2)).toEqual({ start: 0, end: 4 })
  })

  test("selects the second word", () => {
    expect(wordBounds("hello world", 7)).toEqual({ start: 6, end: 10 })
  })

  test("selects spaces as a run", () => {
    expect(wordBounds("a  b", 1)).toEqual({ start: 1, end: 2 })
  })

  test("selects punctuation run", () => {
    expect(wordBounds("foo => bar", 5)).toEqual({ start: 4, end: 5 })
  })

  test("selects path-like strings as one word", () => {
    expect(wordBounds("/usr/bin/bash", 5)).toEqual({ start: 0, end: 12 })
  })

  test("selects snake_case as one word", () => {
    expect(wordBounds("my_variable = 1", 3)).toEqual({ start: 0, end: 10 })
  })

  test("handles click at string start", () => {
    expect(wordBounds("hello", 0)).toEqual({ start: 0, end: 4 })
  })

  test("handles click at string end", () => {
    expect(wordBounds("hello", 4)).toEqual({ start: 0, end: 4 })
  })

  test("handles multiline text — stays on one line", () => {
    expect(wordBounds("line1\nline2", 7)).toEqual({ start: 6, end: 10 })
  })

  test("newline is a boundary", () => {
    expect(wordBounds("abc\ndef", 3)).toEqual({ start: 3, end: 3 })
  })
})

describe("selectWordAt", () => {
  const mockRenderer = () => ({
    startSelection: (_r: unknown, _x: number, _y: number) => {},
    updateSelection: (_r: unknown, _x: number, _y: number) => {},
    clearSelection: () => {},
  })

  function createTrackingRenderer() {
    const calls: { method: string; args: unknown[] }[] = []
    const renderer = {
      startSelection: (r: unknown, x: number, y: number) => {
        calls.push({ method: "startSelection", args: [r, x, y] })
      },
      updateSelection: (r: unknown, x: number, y: number) => {
        calls.push({ method: "updateSelection", args: [r, x, y] })
      },
      clearSelection: () => {},
    }
    return { renderer, calls }
  }

  test("returns false for null target", () => {
    const renderer = mockRenderer()
    expect(selectWordAt(renderer, null, 0, 0)).toBe(false)
  })

  test("returns false for undefined target", () => {
    const renderer = mockRenderer()
    expect(selectWordAt(renderer, undefined, 0, 0)).toBe(false)
  })

  test("returns false for empty text", () => {
    const renderer = mockRenderer()
    const target = { plainText: "" }
    expect(selectWordAt(renderer, target, 0, 0)).toBe(false)
  })

  test("returns false for out-of-range row", () => {
    const renderer = mockRenderer()
    const target = { plainText: "hello" }
    expect(selectWordAt(renderer, target, 0, 5)).toBe(false)
  })

  test("returns true and calls renderer for a simple word", () => {
    const { renderer, calls } = createTrackingRenderer()
    const target = { plainText: "hello world" }

    const result = selectWordAt(renderer, target, 2, 0)
    expect(result).toBe(true)
    expect(calls).toHaveLength(2)
    expect(calls[0]!.method).toBe("startSelection")
    expect(calls[0]!.args[1]).toBe(0)
    expect(calls[0]!.args[2]).toBe(0)
    expect(calls[1]!.method).toBe("updateSelection")
    expect(calls[1]!.args[1]).toBe(5) // exclusive end: one past 'o' in "hello"
    expect(calls[1]!.args[2]).toBe(0)
  })

  test("handles scrollY > 0", () => {
    const { renderer, calls } = createTrackingRenderer()
    const target = { plainText: "line1\nline2\nline3", scrollY: 1 }

    // y=0 with scrollY=1 means visualRow=1, which is "line2"
    const result = selectWordAt(renderer, target, 2, 0)
    expect(result).toBe(true)
    expect(calls[0]!.args[2]).toBe(0) // row is viewport-relative (lineIdx - scrollY = 1 - 1 = 0)
    expect(calls[1]!.args[2]).toBe(0)
  })

  test("walks up to parent renderable when target has no text", () => {
    const { renderer, calls } = createTrackingRenderer()
    const parent = { plainText: "line1\nline2\nline3", scrollY: 1 }
    const child = { parent }

    // y=0 with parent scrollY=1 means visualRow=1, which is "line2"
    const result = selectWordAt(renderer, child, 2, 0)
    expect(result).toBe(true)
    expect(calls).toHaveLength(2)
    // Verify scrollY was read from the parent (row is viewport-relative: lineIdx - scrollY = 1 - 1 = 0)
    expect(calls[0]!.args[2]).toBe(0)
    expect(calls[1]!.args[2]).toBe(0)
    // Verify the parent renderable (not the child) was passed to selection calls
    expect(calls[0]!.args[0]).toBe(parent)
    expect(calls[1]!.args[0]).toBe(parent)
  })

  test("converts global screen coordinates to local and back", () => {
    const { renderer, calls } = createTrackingRenderer()
    // Renderable at screen position (10, 5)
    const target = { plainText: "hello world", x: 10, y: 5 }

    // Global click at (13, 5) → local (3, 0) → char 'l' in "hello"
    const result = selectWordAt(renderer, target, 13, 5)
    expect(result).toBe(true)
    expect(calls).toHaveLength(2)
    // startSelection: col 0 + renderable 10 = 10, row 0 + renderable 5 = 5
    expect(calls[0]!.args[1]).toBe(10)
    expect(calls[0]!.args[2]).toBe(5)
    // updateSelection: "hello" end col = 5 (exclusive: one past 'o'), + renderable 10 = 15
    expect(calls[1]!.args[1]).toBe(15)
    expect(calls[1]!.args[2]).toBe(5)
  })

  test("selects full ASCII word including last character", () => {
    const { renderer, calls } = createTrackingRenderer()
    // "Hello! How can I help you today?"
    // H(0)e(1)l(2)l(3)o(4)!(5) (6)H(7)o(8)w(9) (10)c(11)a(12)n(13) (14)I(15)
    // "can" is at indices 11-13, display cols 11-13
    const target = { plainText: "Hello! How can I help you today?", x: 0, y: 0 }

    // Click on 'a' in "can" (col 12) → select "can" (cols 11-13)
    const result = selectWordAt(renderer, target, 12, 0)
    expect(result).toBe(true)
    expect(calls).toHaveLength(2)
    expect(calls[0]!.args[1]).toBe(11) // start of "can"
    expect(calls[1]!.args[1]).toBe(14) // exclusive end of "can" (col after 'n')
  })

  test("handles wide characters (CJK) — selects whole Chinese word", () => {
    const { renderer, calls } = createTrackingRenderer()
    // "你好" = 2 chars, each 2 display columns (cols 0-1 and 2-3)
    // "！" = 1 char, 2 display columns (col 4-5), class 2 (boundary)
    const target = { plainText: "你好！世界", x: 0, y: 0 }

    // Click on "好" at display col 2 → should select "你好" (cols 0-3)
    const result = selectWordAt(renderer, target, 2, 0)
    expect(result).toBe(true)
    expect(calls).toHaveLength(2)
    // startSelection: col 0 (start of "你好")
    expect(calls[0]!.args[1]).toBe(0)
    // updateSelection: col 4 (exclusive: one past "好" at cols 2-3)
    expect(calls[1]!.args[1]).toBe(4)
  })

  test("clicking first CJK char also selects the whole word", () => {
    const { renderer, calls } = createTrackingRenderer()
    const target = { plainText: "你好！世界", x: 0, y: 0 }

    // Click on "你" at display col 0 → should select "你好"
    const result = selectWordAt(renderer, target, 0, 0)
    expect(result).toBe(true)
    expect(calls).toHaveLength(2)
    expect(calls[0]!.args[1]).toBe(0)
    expect(calls[1]!.args[1]).toBe(4)
  })

  test("strips zero-width characters before mapping", () => {
    const { renderer, calls } = createTrackingRenderer()
    // U+FE0E (variation selector) + space + "AI-generated"
    const target = { plainText: "︎ AI-generated", x: 0, y: 0 }

    // Click on 'A' at display col 1 (after the space; FE0E has 0 width)
    const result = selectWordAt(renderer, target, 1, 0)
    expect(result).toBe(true)
    expect(calls).toHaveLength(2)
    // Should select "AI-generated" (cols 1-12 after stripping FE0E)
    expect(calls[0]!.args[1]).toBe(1) // start col of 'A'
    expect(calls[1]!.args[1]).toBe(13) // exclusive end col after 'd'
  })
})
