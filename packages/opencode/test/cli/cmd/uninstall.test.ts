import { describe, expect, mock, test } from "bun:test"
import type { RemovalTargets } from "../../../src/cli/cmd/uninstall"

const logCalls: string[] = []

void mock.module("@clack/prompts", () => ({
  log: {
    info: (msg: string) => { logCalls.push(msg) },
    message: (msg: string) => { logCalls.push(msg) },
    success: (msg: string) => {},
    warn: (msg: string) => {},
    step: (msg: string) => {},
    error: (msg: string) => {},
  },
  intro: () => {},
  outro: () => {},
  spinner: () => ({ start: () => {}, stop: () => {} }),
  confirm: () => true,
  isCancel: () => false,
}))

// Dynamic import AFTER mock.module — this ensures the mock is in place
const { showBinaryRemovalInstructions } = await import("../../../src/cli/cmd/uninstall")

describe("showBinaryRemovalInstructions", () => {
  test("shows Remove-Item commands on Windows for irm method", () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, "platform", {
      value: "win32",
      writable: true,
      configurable: true,
    })
    try {
      logCalls.length = 0
      const targets: RemovalTargets = {
        directories: [],
        shellConfig: null,
        binary: "C:\\Users\\testuser\\.deveco\\bin\\deveco.exe",
      }
      showBinaryRemovalInstructions("irm", targets)
      expect(logCalls.some((c) => c.includes("Remove-Item"))).toBe(true)
      expect(logCalls.some((c) => c.includes("deveco.exe"))).toBe(true)
      expect(logCalls.some((c) => c.includes("PATH"))).toBe(true)
      expect(logCalls.some((c) => c.includes("rm "))).toBe(false)
    } finally {
      Object.defineProperty(process, "platform", {
        value: originalPlatform,
        writable: true,
        configurable: true,
      })
    }
  })

  test("shows rm commands on non-Windows for irm method", () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, "platform", {
      value: "linux",
      writable: true,
      configurable: true,
    })
    try {
      logCalls.length = 0
      const targets: RemovalTargets = {
        directories: [],
        shellConfig: null,
        binary: "/home/testuser/.deveco/bin/deveco",
      }
      showBinaryRemovalInstructions("irm", targets)
      expect(logCalls.some((c) => c.includes("rm "))).toBe(true)
      expect(logCalls.some((c) => c.includes("Remove-Item"))).toBe(false)
    } finally {
      Object.defineProperty(process, "platform", {
        value: originalPlatform,
        writable: true,
        configurable: true,
      })
    }
  })

  test("does nothing for npm method", () => {
    logCalls.length = 0
    const targets: RemovalTargets = {
      directories: [],
      shellConfig: null,
      binary: null,
    }
    showBinaryRemovalInstructions("npm", targets)
    expect(logCalls.length).toBe(0)
  })
})
