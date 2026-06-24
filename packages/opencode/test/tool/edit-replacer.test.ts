import { describe, expect, test } from "bun:test"
import {
  SimpleReplacer,
  LineTrimmedReplacer,
  BlockAnchorReplacer,
  WhitespaceNormalizedReplacer,
  IndentationFlexibleReplacer,
  EscapeNormalizedReplacer,
  MultiOccurrenceReplacer,
  TrimmedBoundaryReplacer,
  ContextAwareReplacer,
  trimDiff,
  replace,
} from "../../src/tool/edit"

describe("edit replacer functions", () => {
  describe("SimpleReplacer", () => {
    test("yields exact match when present", () => {
      const content = "hello world foo bar"
      const results = [...SimpleReplacer(content, "world")]
      expect(results).toEqual(["world"])
    })

    test("always yields the find string (pass-through behavior)", () => {
      const results = [...SimpleReplacer("hello world", "notfound")]
      expect(results).toEqual(["notfound"])
    })
  })

  describe("LineTrimmedReplacer", () => {
    test("matches lines ignoring leading/trailing whitespace", () => {
      const content = "  hello  \n  world  \n"
      const results = [...LineTrimmedReplacer(content, "hello\nworld")]
      expect(results.length).toBe(1)
      expect(results[0]).toContain("hello")
    })

    test("yields nothing when trimmed lines do not match", () => {
      const content = "hello\nworld"
      const results = [...LineTrimmedReplacer(content, "foo\nbar")]
      expect(results).toEqual([])
    })
  })

  describe("BlockAnchorReplacer", () => {
    test("matches block when first and last lines anchor", () => {
      const content = "START\nmiddle1\nmiddle2\nEND\n"
      const results = [...BlockAnchorReplacer(content, "START\nmiddle1\nmiddle2\nEND")]
      expect(results.length).toBe(1)
      expect(results[0]).toContain("START")
      expect(results[0]).toContain("END")
    })

    test("ignores blocks shorter than 3 lines", () => {
      const content = "START\nEND"
      const results = [...BlockAnchorReplacer(content, "START\nEND")]
      expect(results).toEqual([])
    })

    test("yields nothing when anchors do not match", () => {
      const content = "A\nB\nC\nD\nE"
      const results = [...BlockAnchorReplacer(content, "X\nB\nC\nD\nY")]
      expect(results).toEqual([])
    })
  })

  describe("WhitespaceNormalizedReplacer", () => {
    test("matches single line with different whitespace", () => {
      const content = "hello    world"
      const results = [...WhitespaceNormalizedReplacer(content, "hello world")]
      expect(results.length).toBe(1)
    })

    test("matches multi-line block with normalized whitespace", () => {
      const content = "  hello   \n  world  "
      const results = [...WhitespaceNormalizedReplacer(content, "hello\nworld")]
      expect(results.length).toBe(1)
    })
  })

  describe("IndentationFlexibleReplacer", () => {
    test("matches block regardless of indentation level", () => {
      const content = "    hello\n    world"
      const results = [...IndentationFlexibleReplacer(content, "hello\nworld")]
      expect(results.length).toBe(1)
    })

    test("yields nothing when content does not match", () => {
      const content = "    hello\n    world"
      const results = [...IndentationFlexibleReplacer(content, "foo\nbar")]
      expect(results).toEqual([])
    })
  })

  describe("EscapeNormalizedReplacer", () => {
    test("matches unescaped find string in content", () => {
      const content = "hello\nworld"
      const results = [...EscapeNormalizedReplacer(content, "hello\\nworld")]
      expect(results.length).toBeGreaterThanOrEqual(1)
    })

    test("yields nothing when unescaped version not found", () => {
      const content = "hello world"
      const results = [...EscapeNormalizedReplacer(content, "foo\\nbar")]
      expect(results).toEqual([])
    })
  })

  describe("MultiOccurrenceReplacer", () => {
    test("yields all occurrences", () => {
      const content = "foo bar foo baz foo"
      const results = [...MultiOccurrenceReplacer(content, "foo")]
      expect(results.length).toBe(3)
    })

    test("yields nothing when not found", () => {
      const results = [...MultiOccurrenceReplacer("hello", "foo")]
      expect(results).toEqual([])
    })
  })

  describe("TrimmedBoundaryReplacer", () => {
    test("matches trimmed version of find string", () => {
      const content = "hello world"
      const results = [...TrimmedBoundaryReplacer(content, "  hello world  ")]
      expect(results.length).toBeGreaterThanOrEqual(1)
    })

    test("yields nothing when already trimmed", () => {
      const results = [...TrimmedBoundaryReplacer("hello", "hello")]
      expect(results).toEqual([])
    })
  })

  describe("ContextAwareReplacer", () => {
    test("matches block with context anchors", () => {
      const content = "START\nmiddle\nEND\n"
      const results = [...ContextAwareReplacer(content, "START\nmiddle\nEND")]
      expect(results.length).toBe(1)
    })

    test("ignores blocks shorter than 3 lines", () => {
      const content = "A\nB"
      const results = [...ContextAwareReplacer(content, "A\nB")]
      expect(results).toEqual([])
    })
  })
})

describe("trimDiff", () => {
  test("returns diff unchanged when no common indentation", () => {
    const diff = "-hello\n+world"
    expect(trimDiff(diff)).toBe(diff)
  })

  test("trims common leading whitespace from diff lines", () => {
    const diff = "  -  hello\n  +  world"
    const result = trimDiff(diff)
    expect(result).toContain("-")
    expect(result).toContain("+")
  })

  test("returns unchanged diff when content lines are empty", () => {
    const diff = "--- a/file\n+++ b/file"
    expect(trimDiff(diff)).toBe(diff)
  })
})

describe("replace", () => {
  test("replaces single occurrence", () => {
    const result = replace("hello world", "world", "there")
    expect(result).toBe("hello there")
  })

  test("replaces all occurrences when replaceAll is true", () => {
    const result = replace("foo bar foo", "foo", "baz", true)
    expect(result).toBe("baz bar baz")
  })

  test("throws when oldString equals newString", () => {
    expect(() => replace("hello", "hello", "hello")).toThrow("No changes to apply")
  })

  test("throws when oldString is empty", () => {
    expect(() => replace("hello", "", "world")).toThrow("oldString cannot be empty")
  })

  test("throws when oldString not found", () => {
    expect(() => replace("hello", "notfound", "world")).toThrow("Could not find oldString")
  })

  test("throws when multiple matches exist without replaceAll", () => {
    expect(() => replace("foo bar foo", "foo", "baz")).toThrow("Found multiple matches")
  })
})
