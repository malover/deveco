import { describe, expect, test } from "bun:test"
import {
  buildCrashReport,
  buildNextActionText,
  formatCrashReportText,
} from "../resources/skills/arkts-runtime-fix/scripts/shared/jscrash-parse.mjs"

describe("jscrash-parse buildCrashReport", () => {
  describe("basic crash detection", () => {
    test("detects TypeError crash", () => {
      const input = `
BuildID: 20240101
Timestamp: 2024-01-01 12:00:00
Reason: TypeError
Error message: Cannot read property 'foo' of undefined
at Object.bar (entry/src/main/ets/pages/Index.ets:42:15)
at Component.build (entry/src/main/ets/pages/Index.ets:10:5)
`
      const report = buildCrashReport(input, "test", "device1", "com.example.app", "")
      expect(report.status).toBe("detected")
      expect(report.errorType).toBe("TypeError")
      expect(report.errorMessage).toContain("TypeError")
      expect(report.source).toBe("test")
      expect(report.device).toBe("device1")
    })

    test("detects ReferenceError crash", () => {
      const input = `
jscrash log
ReferenceError: foo is not defined
at main (entry/src/main/ets/EntryAbility.ets:25:3)
`
      const report = buildCrashReport(input, "text", "default", "", "")
      expect(report.status).toBe("detected")
      expect(report.errorType).toBe("ReferenceError")
    })

    test("returns no_crash_signature for clean logs", () => {
      const input = `
2024-01-01 12:00:00 INFO Application started
2024-01-01 12:00:01 DEBUG Loading configuration
2024-01-01 12:00:02 INFO Ready
`
      const report = buildCrashReport(input, "hilog", "default", "", "")
      expect(report.status).toBe("no_crash_signature")
    })
  })

  describe("bundle and process detection", () => {
    test("uses provided bundle name", () => {
      const input = "TypeError: test"
      const report = buildCrashReport(input, "test", "default", "com.example.myapp", "")
      expect(report.bundle).toBe("com.example.myapp")
    })

    test("extracts bundle from log content", () => {
      const input = `
bundleName: com.example.test
TypeError: error
`
      const report = buildCrashReport(input, "test", "default", "", "")
      expect(report.bundle).toBe("com.example.test")
    })

    test("returns (unknown) when bundle not found", () => {
      const input = "TypeError: error"
      const report = buildCrashReport(input, "test", "default", "", "")
      expect(report.bundle).toBe("(unknown)")
    })

    test("uses provided process hint", () => {
      const input = "TypeError: test"
      const report = buildCrashReport(input, "test", "default", "", "com.example.app")
      expect(report.process).toBe("com.example.app")
    })

    test("extracts process from log content", () => {
      const input = `
processName: com.example.app
TypeError: error
`
      const report = buildCrashReport(input, "test", "default", "", "")
      expect(report.process).toBe("com.example.app")
    })
  })

  describe("stack trace extraction", () => {
    test("extracts top stack frames", () => {
      const input = `
TypeError: Cannot read property
at Object.foo (entry/src/main/ets/pages/Home.ets:10:5)
at Component.bar (entry/src/main/ets/pages/Home.ets:20:10)
at Function.baz (entry/src/main/ets/utils/Helper.ets:30:15)
`
      const report = buildCrashReport(input, "test", "default", "", "")
      expect(report.topStack.length).toBeGreaterThan(0)
      expect(report.topStack.length).toBeLessThanOrEqual(8)
    })

    test("filters duplicate stack frames", () => {
      const input = `
TypeError: error
at Object.foo (entry/src/main/ets/pages/Home.ets:10:5)
at Object.foo (entry/src/main/ets/pages/Home.ets:10:5)
at Object.foo (entry/src/main/ets/pages/Home.ets:10:5)
`
      const report = buildCrashReport(input, "test", "default", "", "")
      const uniqueFrames = new Set(report.topStack)
      expect(uniqueFrames.size).toBe(report.topStack.length)
    })
  })

  describe("suspected file detection", () => {
    test("identifies application .ets file", () => {
      const input = `
TypeError: error
at Object.foo (entry/src/main/ets/pages/Index.ets:42:15)
at Component.bar (framework/runtime/lib.ets:10:5)
`
      const report = buildCrashReport(input, "test", "default", "", "")
      expect(report.suspectedFile).toContain("Index.ets")
    })

    test("returns (not found) when no file detected", () => {
      const input = "TypeError: error without stack trace"
      const report = buildCrashReport(input, "test", "default", "", "")
      expect(report.suspectedFile).toBe("(not found)")
    })

    test("prefers entry/ files over framework files", () => {
      const input = `
TypeError: error
at Object.foo (framework/runtime/lib.ets:10:5)
at Object.bar (entry/src/main/ets/pages/Home.ets:20:10)
`
      const report = buildCrashReport(input, "test", "default", "", "")
      expect(report.suspectedFile).toContain("Home.ets")
    })
  })

  describe("keyword detection", () => {
    test("detects jscrash keyword", () => {
      const input = "jscrash occurred in application"
      const report = buildCrashReport(input, "test", "default", "", "")
      expect(report.keywords).toContain("jscrash")
    })

    test("detects multiple error keywords", () => {
      const input = "TypeError: uncaught exception in fatal crash"
      const report = buildCrashReport(input, "test", "default", "", "")
      expect(report.keywords).toContain("typeerror")
      expect(report.keywords).toContain("uncaught")
      expect(report.keywords).toContain("fatal")
    })

    test("returns empty array when no keywords found", () => {
      const input = "Normal log message without errors"
      const report = buildCrashReport(input, "test", "default", "", "")
      expect(report.keywords.length).toBe(0)
    })
  })

  describe("excerpt extraction", () => {
    test("extracts relevant lines around crash", () => {
      const input = `
Line 1: normal
Line 2: normal
Line 3: TypeError: error
Line 4: at foo (file.ets:1:1)
Line 5: normal
`
      const report = buildCrashReport(input, "test", "default", "", "")
      expect(report.excerpt.length).toBeGreaterThan(0)
      expect(report.excerpt.length).toBeLessThanOrEqual(24)
    })

    test("limits excerpt to 24 lines", () => {
      const lines = Array.from({ length: 100 }, (_, i) => `Line ${i}: TypeError`)
      const input = lines.join("\n")
      const report = buildCrashReport(input, "test", "default", "", "")
      expect(report.excerpt.length).toBeLessThanOrEqual(24)
    })
  })
})

describe("jscrash-parse buildNextActionText", () => {
  test("suggests asking for more evidence when no crash signature", () => {
    const report = buildCrashReport("2024-01-01 12:00:00 INFO Application started successfully", "test", "default", "", "")
    const action = buildNextActionText(report)
    expect(action).toContain("Ask for a fuller crash log")
  })

  test("suggests inspecting suspected file when found", () => {
    const input = `
TypeError: error
at Object.foo (entry/src/main/ets/pages/Index.ets:42:15)
`
    const report = buildCrashReport(input, "test", "default", "com.example.app", "")
    const action = buildNextActionText(report)
    expect(action).toContain("Inspect")
    expect(action).toContain("Index.ets")
  })

  test("suggests inspecting stack frames when no suspected file", () => {
    const input = "TypeError: error without stack trace"
    const report = buildCrashReport(input, "test", "default", "com.example.app", "")
    const action = buildNextActionText(report)
    expect(action).toContain("Inspect the top stack frames")
  })
})

describe("jscrash-parse formatCrashReportText", () => {
  test("formats detected crash report", () => {
    const input = `
TypeError: Cannot read property
at Object.foo (entry/src/main/ets/pages/Index.ets:42:15)
`
    const report = buildCrashReport(input, "file", "device1", "com.example.app", "")
    const text = formatCrashReportText(report)
    expect(text).toContain("Crash signature detected")
    expect(text).toContain("source: file")
    expect(text).toContain("device: device1")
    expect(text).toContain("bundle: com.example.app")
    expect(text).toContain("error_type: TypeError")
    expect(text).toContain("Top stack:")
  })

  test("formats no_crash_signature report", () => {
    const input = "2024-01-01 12:00:00 INFO Application started"
    const report = buildCrashReport(input, "hilog", "default", "", "")
    const text = formatCrashReportText(report)
    expect(text).toContain("No clear crash signature detected")
    expect(text).toContain("keywords: (none)")
    expect(text).toContain("Top stack:")
    expect(text).toContain("(empty)")
  })
})
