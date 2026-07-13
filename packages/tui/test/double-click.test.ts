import { describe, expect, test } from "bun:test"
import { createDoubleClickDetector } from "../src/util/double-click"

describe("createDoubleClickDetector", () => {
  test("first click returns false", () => {
    const detector = createDoubleClickDetector()
    expect(detector.isDoubleClick(5, 10)).toBe(false)
  })

  test("second click within threshold returns true", () => {
    const detector = createDoubleClickDetector()
    detector.isDoubleClick(5, 10)
    expect(detector.isDoubleClick(5, 10)).toBe(true)
  })

  test("second click after threshold returns false", async () => {
    const detector = createDoubleClickDetector()
    detector.isDoubleClick(5, 10)
    await new Promise((r) => setTimeout(r, 500))
    expect(detector.isDoubleClick(5, 10)).toBe(false)
  })

  test("second click too far away returns false", () => {
    const detector = createDoubleClickDetector()
    detector.isDoubleClick(5, 10)
    expect(detector.isDoubleClick(20, 10)).toBe(false)
  })

  test("double-click resets state — third click is not a double", () => {
    const detector = createDoubleClickDetector()
    detector.isDoubleClick(5, 10) // first
    detector.isDoubleClick(5, 10) // second → double
    expect(detector.isDoubleClick(5, 10)).toBe(false) // third → reset
  })
})
