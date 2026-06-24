import { describe, expect, test } from "bun:test"
import { splashMeta, SPLASH_TITLE_LIMIT, SPLASH_TITLE_FALLBACK } from "../../src/cli/cmd/run/splash"

describe("splashMeta", () => {
  test("returns title and session_id", () => {
    const result = splashMeta({ title: "My Session", session_id: "ses_123" })
    expect(result.title).toBe("My Session")
    expect(result.session_id).toBe("ses_123")
  })

  test("uses fallback when title is undefined", () => {
    const result = splashMeta({ title: undefined, session_id: "ses_456" })
    expect(result.title).toBe(SPLASH_TITLE_FALLBACK)
  })

  test("uses fallback when title is empty string", () => {
    const result = splashMeta({ title: "", session_id: "ses_789" })
    expect(result.title).toBe(SPLASH_TITLE_FALLBACK)
  })

  test("uses fallback when title is whitespace only", () => {
    const result = splashMeta({ title: "   \t\n  ", session_id: "ses_abc" })
    expect(result.title).toBe(SPLASH_TITLE_FALLBACK)
  })

  test("normalizes internal whitespace", () => {
    const result = splashMeta({ title: "  hello   world  ", session_id: "ses_def" })
    expect(result.title).toBe("hello world")
  })

  test("collapses multiple spaces into one", () => {
    const result = splashMeta({ title: "a    b    c", session_id: "ses_ghi" })
    expect(result.title).toBe("a b c")
  })

  test("truncates long titles", () => {
    const longTitle = "a".repeat(100)
    const result = splashMeta({ title: longTitle, session_id: "ses_jkl" })
    expect(result.title.length).toBeLessThanOrEqual(SPLASH_TITLE_LIMIT)
  })
})

describe("SPLASH_TITLE_LIMIT", () => {
  test("is a positive number", () => {
    expect(SPLASH_TITLE_LIMIT).toBeGreaterThan(0)
  })

  test("is 50", () => {
    expect(SPLASH_TITLE_LIMIT).toBe(50)
  })
})

describe("SPLASH_TITLE_FALLBACK", () => {
  test("is a non-empty string", () => {
    expect(SPLASH_TITLE_FALLBACK.length).toBeGreaterThan(0)
  })

  test("is Untitled session", () => {
    expect(SPLASH_TITLE_FALLBACK).toBe("Untitled session")
  })
})
