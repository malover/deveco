import { describe, expect, test } from "bun:test"
import { rmSync } from "node:fs"
import { cleanupTestRoot } from "./preload-cleanup"

describe("preload cleanup", () => {
  test("uses recursive removal retries for the test root", () => {
    let options: Parameters<typeof rmSync>[1] | undefined

    cleanupTestRoot(
      "test-root",
      (_path, input) => {
        options = input
      },
      () => undefined,
    )

    expect(options).toEqual({ recursive: true, force: true, maxRetries: 30, retryDelay: 100 })
  })

  test("does not throw when removal reports a busy directory", () => {
    const error = Object.assign(new Error("directory is busy"), { code: "EBUSY" })
    const warnings: string[] = []

    expect(() =>
      cleanupTestRoot(
        "test-root",
        () => {
          throw error
        },
        (message) => warnings.push(message),
      ),
    ).not.toThrow()
    expect(warnings[0]).toContain("EBUSY")
  })

  test("rethrows unexpected removal errors", () => {
    const error = new Error("permission denied")

    expect(() =>
      cleanupTestRoot(
        "test-root",
        () => {
          throw error
        },
        () => undefined,
      ),
    ).toThrow(error)
  })
})
