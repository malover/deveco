import { describe, expect, test } from "bun:test"
import { ShellID } from "../../src/tool/shell/id"

describe("ShellID", () => {
  describe("toKind", () => {
    test("returns bash for bash", () => {
      expect(ShellID.toKind("bash")).toBe("bash")
    })

    test("returns pwsh for pwsh", () => {
      expect(ShellID.toKind("pwsh")).toBe("pwsh")
    })

    test("returns powershell for powershell", () => {
      expect(ShellID.toKind("powershell")).toBe("powershell")
    })

    test("returns cmd for cmd", () => {
      expect(ShellID.toKind("cmd")).toBe("cmd")
    })

    test("defaults to bash for unknown shell", () => {
      expect(ShellID.toKind("zsh")).toBe("bash")
    })

    test("defaults to bash for empty string", () => {
      expect(ShellID.toKind("")).toBe("bash")
    })
  })

  describe("ToolID", () => {
    test("is bash for backwards compatibility", () => {
      expect(ShellID.ToolID).toBe("bash")
    })
  })
})
