import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { toErrorMessage, printKv } from "../resources/skills/arkts-runtime-fix/scripts/shared/utils.mjs"

describe("utils toErrorMessage", () => {
  test("extracts message from Error instance", () => {
    const error = new Error("test error message")
    expect(toErrorMessage(error)).toBe("test error message")
  })

  test("converts string to string", () => {
    expect(toErrorMessage("string error")).toBe("string error")
  })

  test("converts number to string", () => {
    expect(toErrorMessage(42)).toBe("42")
  })

  test("converts null to string", () => {
    expect(toErrorMessage(null)).toBe("null")
  })

  test("converts undefined to string", () => {
    expect(toErrorMessage(undefined)).toBe("undefined")
  })

  test("converts object to string", () => {
    const obj = { key: "value" }
    expect(toErrorMessage(obj)).toBe("[object Object]")
  })
})

describe("utils printKv", () => {
  let output = ""
  let spy: ReturnType<typeof spyOn>

  beforeEach(() => {
    output = ""
    spy = spyOn(console, "log").mockImplementation((text: string) => {
      output = text
    })
  })

  afterEach(() => {
    spy.mockRestore()
  })

  test("formats key-value pairs", () => {
    printKv({
      status: "detected",
      error_type: "TypeError",
      error_message: "test",
    })

    expect(output).toContain("status: detected")
    expect(output).toContain("error_type: TypeError")
    expect(output).toContain("error_message: test")
  })

  test("joins multiple pairs with newlines", () => {
    printKv({
      key1: "value1",
      key2: "value2",
      key3: "value3",
    })

    const lines = output.split("\n")
    expect(lines.length).toBe(3)
  })

  test("handles empty object", () => {
    printKv({})
    expect(output).toBe("")
  })
})
