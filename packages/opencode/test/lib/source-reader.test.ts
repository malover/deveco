import { describe, expect, test } from "bun:test"
import { readSource, fileExists } from "./source-reader"

describe("source-reader", () => {
  describe("readSource", () => {
    test("reads existing file content", () => {
      const content = readSource("packages/opencode/test/lib/source-reader.ts")
      expect(content).toContain("export function readSource")
      expect(content).toContain("export function fileExists")
    })

    test("returns empty string for non-existent file", () => {
      const content = readSource("packages/opencode/test/lib/non-existent-file-12345.ts")
      expect(content).toBe("")
    })

    test("throws EISDIR for empty path (resolves to repo root directory)", () => {
      expect(() => readSource("")).toThrow("EISDIR")
    })

    test("handles relative paths with ..", () => {
      const content = readSource("packages/opencode/../opencode/test/lib/source-reader.ts")
      expect(content).toContain("export function readSource")
    })

    test("reads JSON files", () => {
      const content = readSource("packages/opencode/package.json")
      expect(content).toContain('"name"')
      expect(content).toContain("deveco")
    })

    test("reads markdown files", () => {
      const content = readSource("README.md")
      expect(content.length).toBeGreaterThan(0)
    })
  })

  describe("fileExists", () => {
    test("returns true for existing file", () => {
      expect(fileExists("packages/opencode/test/lib/source-reader.ts")).toBe(true)
    })

    test("returns true for existing directory", () => {
      expect(fileExists("packages/opencode/test/lib")).toBe(true)
    })

    test("returns false for non-existent file", () => {
      expect(fileExists("packages/opencode/test/lib/non-existent-file-12345.ts")).toBe(false)
    })

    test("returns true for empty path (resolves to repo root)", () => {
      expect(fileExists("")).toBe(true)
    })

    test("returns true for package.json", () => {
      expect(fileExists("packages/opencode/package.json")).toBe(true)
    })

    test("returns true for README.md", () => {
      expect(fileExists("README.md")).toBe(true)
    })
  })

  describe("edge cases", () => {
    test("readSource and fileExists are consistent", () => {
      const validPath = "packages/opencode/test/lib/source-reader.ts"
      const invalidPath = "packages/opencode/test/lib/non-existent-file-12345.ts"

      expect(fileExists(validPath)).toBe(true)
      expect(readSource(validPath).length).toBeGreaterThan(0)

      expect(fileExists(invalidPath)).toBe(false)
      expect(readSource(invalidPath)).toBe("")
    })

    test("readSource returns string type", () => {
      const content = readSource("packages/opencode/test/lib/source-reader.ts")
      expect(typeof content).toBe("string")
    })

    test("fileExists returns boolean type", () => {
      const exists = fileExists("packages/opencode/test/lib/source-reader.ts")
      expect(typeof exists).toBe("boolean")
    })
  })
})
