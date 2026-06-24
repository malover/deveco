import { describe, expect, test } from "bun:test"
import { logo, go, marks } from "../src/logo"

describe("logo data", () => {
  test("logo.left is a non-empty array of strings", () => {
    expect(Array.isArray(logo.left)).toBe(true)
    expect(logo.left.length).toBeGreaterThan(0)
    for (const row of logo.left) {
      expect(typeof row).toBe("string")
    }
  })

  test("logo.right is a non-empty array of strings", () => {
    expect(Array.isArray(logo.right)).toBe(true)
    expect(logo.right.length).toBeGreaterThan(0)
    for (const row of logo.right) {
      expect(typeof row).toBe("string")
    }
  })

  test("logo.left and logo.right have the same row count", () => {
    expect(logo.left.length).toBe(logo.right.length)
  })

  test("logo.charMap maps ░ ▒ █ to ▮", () => {
    expect(logo.charMap["░"]).toBe("▮")
    expect(logo.charMap["▒"]).toBe("▮")
    expect(logo.charMap["█"]).toBe("▮")
  })

  test("logo.charOpacity assigns increasing opacity ░ < ▒ < █", () => {
    expect(logo.charOpacity["░"]).toBeLessThan(logo.charOpacity["▒"])
    expect(logo.charOpacity["▒"]).toBeLessThan(logo.charOpacity["█"])
    expect(logo.charOpacity["█"]).toBe(1.0)
  })

  test("logo.left uses only ░ ▒ █ and spaces in the glyph area", () => {
    const glyphChars = new Set(["░", "▒", "█", " "])
    for (const row of logo.left) {
      for (const ch of row) {
        expect(glyphChars.has(ch)).toBe(true)
      }
    }
  })
})

describe("go (compact logo)", () => {
  test("go.left is a subset of logo.left (first 4 rows)", () => {
    expect(go.left.length).toBe(4)
    for (let i = 0; i < go.left.length; i++) {
      expect(go.left[i]).toBe(logo.left[i])
    }
  })

  test("go.right is a subset of logo.right (first 4 rows)", () => {
    expect(go.right.length).toBe(4)
    for (let i = 0; i < go.right.length; i++) {
      expect(go.right[i]).toBe(logo.right[i])
    }
  })

  test("go.charMap matches logo.charMap", () => {
    expect(go.charMap).toEqual(logo.charMap)
  })

  test("go.charOpacity matches logo.charOpacity", () => {
    expect(go.charOpacity).toEqual(logo.charOpacity)
  })
})

describe("marks", () => {
  test("marks is a null byte string", () => {
    expect(marks).toBe("\x00")
  })
})
