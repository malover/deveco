import { describe, expect, mock, it, beforeEach } from "bun:test"
import os from "node:os"
import path from "node:path"
import fs from "node:fs"
import { getMockBridge } from "../lib/mock-bridge"
import emulatorTools from "../../src/tool/lib/emulator_tools.json"

const bridge = getMockBridge()

// Import real implementation before mock.module takes effect
const { resolveUIVerifyParams: realResolveUIVerifyParams } = await import("../../src/tool/lib/harmony_napi")

void mock.module("../../src/tool/lib/harmony_napi", () => ({
  ensureInitialized: async (worktree: string) => bridge.ensureInitialized_(worktree),
  callHarmonyNapiTool: async (params: any) => bridge.callTool_(params),
  listTools: async (worktree: string) => bridge.listTools_(worktree),
  callTool: async (worktree: string, toolName: string, args: Record<string, unknown>) =>
    bridge.callTool_({ worktree, toolName, args }),
  napiBridgeStop: async () => {},
  // Keep real resolveUIVerifyParams to avoid polluting other tests with mock version
  resolveUIVerifyParams: realResolveUIVerifyParams,
}))

const {
  parseToolArgs,
  textFromCallResult,
  validatePathParameters,
  sanitizeFilePath,
  buildProxiedToolDescription,
  formatSchemaError,
} = await import("../../src/plugin/harmony-napi-dynamic-tools")

const { callHarmonyNapiTool } = await import("../../src/tool/lib/harmony_napi")

beforeEach(() => bridge.reset())

describe("textFromCallResult", () => {
  it("extracts text from MCP content array", () => {
    const result = textFromCallResult({
      content: [{ type: "text", text: "success" }, { type: "text", text: "done" }],
    })
    expect(result).toBe("success\ndone")
  })

  it("joins multiple text entries with newline", () => {
    const result = textFromCallResult({
      content: [{ text: "line1" }, { text: "line2" }, { text: "line3" }],
    })
    expect(result).toBe("line1\nline2\nline3")
  })

  it("skips entries without text property", () => {
    const result = textFromCallResult({
      content: [{ text: "hello" }, { image: "data" }, { type: "resource" }],
    })
    expect(result).toBe("hello")
  })

  it("falls back to JSON for object without content array", () => {
    const result = textFromCallResult({ output: "something", status: "ok" })
    expect(result).toBe(JSON.stringify({ output: "something", status: "ok" }, null, 2))
  })

  it("falls back to JSON when content is not an array", () => {
    const result = textFromCallResult({ content: "just a string" })
    expect(result).toBe(JSON.stringify({ content: "just a string" }, null, 2))
  })

  it("returns JSON string for null input", () => {
    const result = textFromCallResult(null)
    expect(result).toBe("null")
  })

  it("returns undefined for undefined input (JSON.stringify(undefined) is undefined)", () => {
    const result = textFromCallResult(undefined)
    expect(result).toBeUndefined()
  })

  it("returns JSON string for primitive values", () => {
    expect(textFromCallResult("hello")).toBe('"hello"')
    expect(textFromCallResult(42)).toBe("42")
    expect(textFromCallResult(true)).toBe("true")
  })

  it("falls back to JSON when all content entries lack text", () => {
    const result = textFromCallResult({
      content: [{ type: "image", data: "base64" }, { type: "resource" }],
    })
    expect(result).toBe(
      JSON.stringify({ content: [{ type: "image", data: "base64" }, { type: "resource" }] }, null, 2),
    )
  })

  it("returns JSON for empty content array", () => {
    const result = textFromCallResult({ content: [] })
    expect(result).toBe(JSON.stringify({ content: [] }, null, 2))
  })

  it("handles empty string text entries by filtering them out", () => {
    const result = textFromCallResult({
      content: [{ text: "" }, { text: "visible" }, { text: "" }],
    })
    expect(result).toBe("visible")
  })
})

describe("buildProxiedToolDescription", () => {
  it("returns description when provided", () => {
    expect(buildProxiedToolDescription("build_project", "Build the app.")).toBe("Build the app.")
  })

  it("returns fallback description when undefined", () => {
    expect(buildProxiedToolDescription("build_project", undefined)).toBe("Harmony N-API tool: build_project.")
  })

  it("trims whitespace from description", () => {
    expect(buildProxiedToolDescription("test", "  spaced  ")).toBe("spaced")
  })

  it("returns empty string for whitespace-only description (trim result is falsy but not nullish)", () => {
    expect(buildProxiedToolDescription("test", "   ")).toBe("")
  })
})

describe("formatSchemaError", () => {
  it("extracts message property from error", () => {
    expect(formatSchemaError({ message: "type mismatch" })).toBe("type mismatch")
  })

  it("extracts _tag when no message", () => {
    expect(formatSchemaError({ _tag: "ParseError" })).toBe("Validation error: ParseError")
  })

  it("returns generic message for unknown error shapes", () => {
    expect(formatSchemaError(null)).toBe("Schema validation failed")
    expect(formatSchemaError(undefined)).toBe("Schema validation failed")
    expect(formatSchemaError("string error")).toBe("Schema validation failed")
    expect(formatSchemaError(42)).toBe("Schema validation failed")
  })

  it("prefers message over _tag", () => {
    expect(formatSchemaError({ message: "specific", _tag: "generic" })).toBe("specific")
  })
})

describe("validatePathParameters", () => {
  const worktree = os.tmpdir()

  it("validates dirname parameter", () => {
    const realTmp = fs.realpathSync(worktree)
    const args = { dirname: realTmp }
    validatePathParameters(args, realTmp)
    expect(args.dirname).toBe(realTmp)
  })

  it("validates log_path parameter", () => {
    const realTmp = fs.realpathSync(worktree)
    const args = { log_path: realTmp }
    validatePathParameters(args, realTmp)
    expect(args.log_path).toBe(realTmp)
  })

  it("ignores parameters not in the path params list", () => {
    const args = { testPlan: "click button", id: "abc-123" }
    const original = { ...args }
    validatePathParameters(args, worktree)
    expect(args).toEqual(original)
  })

  it("throws on path traversal attempt", () => {
    expect(() => validatePathParameters({ dirname: "../../etc/passwd" }, worktree)).toThrow(
      "Path traversal detected",
    )
  })

  it("skips non-string values for path parameters", () => {
    const args = { dirname: 123, log_path: true, filePath: null } as any
    validatePathParameters(args, worktree)
    expect(args.dirname).toBe(123)
    expect(args.log_path).toBe(true)
    expect(args.filePath).toBeNull()
  })

  it("validates all known path parameter names", () => {
    const realTmp = fs.realpathSync(worktree)
    const params = ["log_path", "dirname", "filePath", "filepath", "path"] as const
    for (const paramName of params) {
      const args: Record<string, unknown> = { [paramName]: realTmp }
      validatePathParameters(args, realTmp)
      expect(args[paramName]).toBe(realTmp)
    }
  })
})

describe("sanitizeFilePath", () => {
  const worktree = os.tmpdir()

  it("resolves relative paths within worktree", () => {
    const realTmp = fs.realpathSync(worktree)
    const result = sanitizeFilePath("subdir/file.txt", realTmp)
    expect(path.isAbsolute(result)).toBe(true)
  })

  it("accepts absolute path within worktree", () => {
    const realTmp = fs.realpathSync(worktree)
    const result = sanitizeFilePath(realTmp, realTmp)
    expect(result).toBe(realTmp)
  })

  it("rejects path traversal outside worktree", () => {
    const realTmp = fs.realpathSync(worktree)
    expect(() => sanitizeFilePath("../../etc/passwd", realTmp)).toThrow("Path traversal detected")
  })
})

describe("execute flow simulation — callHarmonyNapiTool with mock bridge", () => {
  checkTool("check_ets_files")({ files: ["src/Main.ets"] })
  checkTool("build_project")({ build_mode: "debug" })
  checkTool("start_app")({ ability: "EntryAbility", target: "default" })
  checkTool("verify_ui")({ testPlan: "click login button" })
  checkTool("get_ui_verification_log")({ id: "v1", maxLogSize: 5000 })

  function checkTool(name: string) {
    return (validArgs: Record<string, unknown>) => {
      const tool = emulatorTools.find((t) => t.name === name)!

      it(`${name}: full flow — parse args → bridge call → format result`, async () => {
        const payload = parseToolArgs(validArgs, tool.inputSchema)
        bridge.next({
          content: [{ type: "text", text: `${name} succeeded` }],
        })
        const result = await callHarmonyNapiTool({ worktree: "/test", toolName: name, args: payload })
        const text = textFromCallResult(result)
        expect(text).toBe(`${name} succeeded`)
        expect(bridge.calls).toHaveLength(1)
        expect(bridge.calls[0].toolName).toBe(name)
        expect(bridge.calls[0].worktree).toBe("/test")
      })

      it(`${name}: bridge returns non-MCP format`, async () => {
        const payload = parseToolArgs(validArgs, tool.inputSchema)
        bridge.next({ status: "ok", output: "raw result" })
        const result = await callHarmonyNapiTool({ worktree: "/test", toolName: name, args: payload })
        const text = textFromCallResult(result)
        expect(text).toBe(JSON.stringify({ status: "ok", output: "raw result" }, null, 2))
      })

      it(`${name}: bridge throws error`, async () => {
        const payload = parseToolArgs(validArgs, tool.inputSchema)
        bridge.nextError(new Error("bridge connection failed"))
        await expect(
          callHarmonyNapiTool({ worktree: "/test", toolName: name, args: payload }),
        ).rejects.toThrow("bridge connection failed")
      })

      it(`${name}: bridge returns empty content`, async () => {
        const payload = parseToolArgs(validArgs, tool.inputSchema)
        bridge.next({ content: [] })
        const result = await callHarmonyNapiTool({ worktree: "/test", toolName: name, args: payload })
        const text = textFromCallResult(result)
        expect(text).toBe(JSON.stringify({ content: [] }, null, 2))
      })

      it(`${name}: required-only tools throw on empty args`, () => {
        const required = (tool.inputSchema as { required?: string[] }).required
        if (required?.length) {
          expect(() => parseToolArgs({}, tool.inputSchema)).toThrow("Args validation failed:")
          expect(bridge.calls).toHaveLength(0)
        }
      })
    }
  }
})

describe("execute flow — verify_ui specific logic", () => {
  const verifyUITool = emulatorTools.find((t) => t.name === "verify_ui")!

  it("parseToolArgs + sessionId injection produces correct payload", () => {
    const payload = parseToolArgs({ testPlan: "tap settings icon" }, verifyUITool.inputSchema)
    payload.sessionId = "ses_abc123"
    expect(payload.testPlan).toBe("tap settings icon")
    expect(payload.sessionId).toBe("ses_abc123")
  })

  it("resolveUIVerifyParams returns null params when unconfigured", async () => {
    bridge.setUIVerifyParams({ baseURL: null, apiKey: null, modelName: null })
    const params = await bridge.resolveUIVerifyParams_("/test")
    expect(params.baseURL).toBeNull()
    expect(params.apiKey).toBeNull()
    expect(params.modelName).toBeNull()
  })

  it("resolveUIVerifyParams returns configured model params", async () => {
    bridge.setUIVerifyParams({
      baseURL: "https://model.example.com/v1",
      apiKey: "sk-test-key",
      modelName: "qwen3-vl-plus",
    })
    const params = await bridge.resolveUIVerifyParams_("/test")
    expect(params.baseURL).toBe("https://model.example.com/v1")
    expect(params.apiKey).toBe("sk-test-key")
    expect(params.modelName).toBe("qwen3-vl-plus")
  })

  it("verify_ui args with all optional fields", () => {
    const payload = parseToolArgs(
      { testPlan: "swipe left", bundleName: "com.example", device: "emulator", freshStart: true },
      verifyUITool.inputSchema,
    )
    expect(payload.testPlan).toBe("swipe left")
    expect(payload.bundleName).toBe("com.example")
    expect(payload.device).toBe("emulator")
    expect(payload.freshStart).toBe(true)
  })
})

describe("execute flow — save_ui_screenshot specific logic", () => {
  const screenshotTool = emulatorTools.find((t) => t.name === "save_ui_screenshot")!

  it("full flow with valid path within worktree", async () => {
    const realTmp = fs.realpathSync(os.tmpdir())
    const payload = parseToolArgs({ id: "v1", dirname: realTmp }, screenshotTool.inputSchema)
    validatePathParameters(payload, realTmp)
    bridge.next({
      content: [{ type: "text", text: "screenshots saved: [shot1.png, shot2.png]" }],
    })
    const result = await callHarmonyNapiTool({ worktree: realTmp, toolName: "save_ui_screenshot", args: payload })
    const text = textFromCallResult(result)
    expect(text).toBe("screenshots saved: [shot1.png, shot2.png]")
    expect(bridge.calls[0].args.dirname).toBe(realTmp)
  })

  it("rejects dirname with path traversal", () => {
    const payload = parseToolArgs({ id: "v1", dirname: "/tmp/screenshots" }, screenshotTool.inputSchema)
    expect(() => validatePathParameters(payload, os.homedir())).toThrow("Path traversal detected")
  })

  it("rejects missing required fields before bridge call", () => {
    expect(() => parseToolArgs({ dirname: "/tmp" }, screenshotTool.inputSchema)).toThrow("Args validation failed:")
    expect(() => parseToolArgs({ id: "v1" }, screenshotTool.inputSchema)).toThrow("Args validation failed:")
    expect(bridge.calls).toHaveLength(0)
  })

  it("bridge error after valid args", async () => {
    const realTmp = fs.realpathSync(os.tmpdir())
    const payload = parseToolArgs({ id: "v1", dirname: realTmp }, screenshotTool.inputSchema)
    validatePathParameters(payload, realTmp)
    bridge.nextError(new Error("device not connected"))
    await expect(
      callHarmonyNapiTool({ worktree: realTmp, toolName: "save_ui_screenshot", args: payload }),
    ).rejects.toThrow("device not connected")
  })
})

describe("execute flow — ensureInitialized behavior via mock bridge", () => {
  it("tracks worktree passed to ensureInitialized", async () => {
    bridge.next({ content: [{ text: "ok" }] })
    await callHarmonyNapiTool({ worktree: "/projects/app1", toolName: "check_ets_files", args: { files: ["a.ets"] } })
    // callHarmonyNapiTool internally calls ensureInitialized, but the mock tracks calls separately
    expect(bridge.calls).toHaveLength(1)
    expect(bridge.calls[0].worktree).toBe("/projects/app1")
  })

  it("setInitialized(false) causes ensureInitialized to throw", async () => {
    bridge.setInitialized(false)
    await expect(bridge.ensureInitialized_("/test")).rejects.toThrow("DevEco Studio not found")
    expect(bridge.initCalls).toEqual(["/test"])
  })

  it("setInitialized with custom error", async () => {
    bridge.setInitialized(true, new Error("Bridge process crashed"))
    await expect(bridge.ensureInitialized_("/test")).rejects.toThrow("Bridge process crashed")
  })

  it("ensureInitialized tracks each call", async () => {
    await bridge.ensureInitialized_("/project-a")
    await bridge.ensureInitialized_("/project-b")
    await bridge.ensureInitialized_("/project-a")
    expect(bridge.initCalls).toEqual(["/project-a", "/project-b", "/project-a"])
  })
})

describe("execute flow — listTools with mock bridge", () => {
  it("returns tool list from mock", async () => {
    bridge.setListToolsResult([
      { name: "check_ets_files", description: "Check ETS files" },
      { name: "build_project", description: "Build project" },
    ])
    const result = await bridge.listTools_("/test")
    expect(result).toEqual([
      { name: "check_ets_files", description: "Check ETS files" },
      { name: "build_project", description: "Build project" },
    ])
  })

  it("returns empty array by default", async () => {
    const result = await bridge.listTools_("/test")
    expect(result).toEqual([])
  })
})
