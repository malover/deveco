import { describe, expect, test } from "bun:test"
import { countWrappedTerminalLines } from "../../src/util/text-wrap"

describe("countWrappedTerminalLines", () => {
  test("counts explicit newlines", () => {
    expect(countWrappedTerminalLines("first\nsecond", 80)).toBe(2)
    expect(countWrappedTerminalLines("first\n\nthird", 80)).toBe(3)
  })

  test("uses terminal display width for Chinese text", () => {
    expect(countWrappedTerminalLines("中文中文中文", 10)).toBe(2)
    expect(countWrappedTerminalLines("中文中文中", 10)).toBe(1)
  })

  test("wraps English at word boundaries", () => {
    expect(countWrappedTerminalLines("hello world", 10)).toBe(2)
    expect(countWrappedTerminalLines("hello you", 10)).toBe(1)
  })

  test("hard-wraps English tokens longer than the available width", () => {
    expect(countWrappedTerminalLines("abcdefghijk", 10)).toBe(2)
  })
})
