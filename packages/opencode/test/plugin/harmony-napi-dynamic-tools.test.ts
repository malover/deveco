import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import fs from "fs"
import path from "path"
import { setSessionCwd, clearSessionCwd } from "../../src/tool/lib/session-cwd"

let mockCallHarmonyNapiToolCalls: Array<{
  worktree: string
  toolName: string
  args: Record<string, unknown>
}> = []
let mockCallHarmonyNapiToolResult: unknown = null
let mockResolveUIVerifyParamsResult: {
  baseURL: string | null
  apiKey: string | null
  modelName: string | null
} = { baseURL: null, apiKey: null, modelName: null }

import * as harmonyNapi from "../../src/tool/lib/harmony_napi"

const HarmonyNapiDynamicToolsPlugin = await import(
  "../../src/plugin/harmony-napi-dynamic-tools"
).then((m) => m.default)

function resetMocks() {
  mockCallHarmonyNapiToolCalls = []
  mockCallHarmonyNapiToolResult = null
  mockResolveUIVerifyParamsResult = { baseURL: null, apiKey: null, modelName: null }
  clearSessionCwd()
}

function withEnvVar<T>(
  key: string,
  value: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  const saved = process.env[key]
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
  return fn().finally(() => {
    if (saved === undefined) delete process.env[key]
    else process.env[key] = saved
  })
}

function withDevecoHome(fn: () => Promise<void>): Promise<void> {
  return withEnvVar("DEVECO_HOME", "/fake/deveco", fn)
}

async function catchError(fn: () => Promise<unknown>): Promise<Error | undefined> {
  try {
    await fn()
    return undefined
  } catch (e) {
    return e as Error
  }
}

const defaultCtx = {
  sessionID: "test-session-id",
  messageID: "test-message-id",
  agent: "build",
  directory: "/test/project",
  worktree: "/test/project",
  abort: AbortSignal.any([]),
  metadata: () => {},
  ask: () => Promise.resolve(),
}

describe("HarmonyNapiDynamicToolsPlugin", () => {
  let tools: Record<string, ReturnType<typeof import("@opencode-ai/plugin").tool>>
  let realpathSpy: ReturnType<typeof spyOn> | undefined
  let callHarmonyNapiToolSpy: ReturnType<typeof spyOn>
  let resolveUIVerifyParamsSpy: ReturnType<typeof spyOn>

  beforeEach(async () => {
    resetMocks()
    callHarmonyNapiToolSpy = spyOn(harmonyNapi, "callHarmonyNapiTool").mockImplementation(async (params: {
      worktree: string
      toolName: string
      args: Record<string, unknown>
    }) => {
      mockCallHarmonyNapiToolCalls.push(params)
      return mockCallHarmonyNapiToolResult
    })
    resolveUIVerifyParamsSpy = spyOn(harmonyNapi, "resolveUIVerifyParams").mockImplementation(async () => mockResolveUIVerifyParamsResult)
    const result = await HarmonyNapiDynamicToolsPlugin({} as never)
    tools = result.tool ?? {}
    realpathSpy = undefined
  })

  afterEach(() => {
    callHarmonyNapiToolSpy?.mockRestore()
    resolveUIVerifyParamsSpy?.mockRestore()
    realpathSpy?.mockRestore()
    clearSessionCwd()
  })

  describe("plugin creation", () => {
    test("should create tools matching emulator_tools.json tool names", () => {
      const toolNames = Object.keys(tools)
      expect(toolNames).toEqual(["check_ets_files"])
    })

    test("should set description from tool metadata", () => {
      expect(tools.check_ets_files.description).toContain("ArkTS-Check")
    })

    test("should preserve description when tool has one", () => {
      expect(tools.check_ets_files.description).toContain("ArkTS-Check")
    })

    test("should create Zod args from required inputSchema properties", () => {
      const args = tools.check_ets_files.args
      expect(args.files).toBeDefined()
    })
  })

  describe("tool execute - DEVECO_HOME check", () => {
    test("should throw error when DEVECO_HOME is not set", async () => {
      const error = await withEnvVar("DEVECO_HOME", undefined, () =>
        catchError(() => tools.check_ets_files.execute({ files: ["test.ets"] }, defaultCtx)),
      )
      expect(error).toBeDefined()
      expect(error!.message).toContain("DEVECO_HOME")
    })

    test("should throw error when DEVECO_HOME is empty whitespace", async () => {
      const error = await withEnvVar("DEVECO_HOME", "   ", () =>
        catchError(() => tools.check_ets_files.execute({ files: ["test.ets"] }, defaultCtx)),
      )
      expect(error).toBeDefined()
      expect(error!.message).toContain("DEVECO_HOME")
    })
  })

  describe("tool execute - worktree resolution", () => {
    test("should use session cwd when getSessionCwd returns a value", async () => {
      await withDevecoHome(async () => {
        setSessionCwd(defaultCtx.sessionID, "/session/cwd/path")
        mockCallHarmonyNapiToolResult = { content: [{ text: "ok" }] }
        await tools.check_ets_files.execute({ files: ["test.ets"] }, defaultCtx)
        expect(mockCallHarmonyNapiToolCalls[0].worktree).toBe("/session/cwd/path")
      })
    })

    test("should use context directory when session cwd is not set", async () => {
      await withDevecoHome(async () => {
        mockCallHarmonyNapiToolResult = { content: [{ text: "ok" }] }
        const ctx = { ...defaultCtx, directory: "/ctx/directory", worktree: "" }
        await tools.check_ets_files.execute({ files: ["test.ets"] }, ctx)
        expect(mockCallHarmonyNapiToolCalls[0].worktree).toBe("/ctx/directory")
      })
    })

    test("should use context worktree when directory is not set", async () => {
      await withDevecoHome(async () => {
        mockCallHarmonyNapiToolResult = { content: [{ text: "ok" }] }
        const ctx = { ...defaultCtx, directory: "", worktree: "/ctx/worktree" }
        await tools.check_ets_files.execute({ files: ["test.ets"] }, ctx)
        expect(mockCallHarmonyNapiToolCalls[0].worktree).toBe("/ctx/worktree")
      })
    })

    test("should fall back to process.cwd() when no worktree source is available", async () => {
      await withDevecoHome(async () => {
        mockCallHarmonyNapiToolResult = { content: [{ text: "ok" }] }
        const ctx = { ...defaultCtx, directory: "", worktree: "" }
        await tools.check_ets_files.execute({ files: ["test.ets"] }, ctx)
        expect(mockCallHarmonyNapiToolCalls[0].worktree).toBe(process.cwd())
      })
    })
  })

  describe("tool execute - callHarmonyNapiTool invocation", () => {
    test("should call callHarmonyNapiTool with worktree, toolName, and args", async () => {
      await withDevecoHome(async () => {
        mockCallHarmonyNapiToolResult = { content: [{ text: "done" }] }
        await tools.check_ets_files.execute({ files: ["a.ets", "b.ets"] }, defaultCtx)
        expect(mockCallHarmonyNapiToolCalls.length).toBe(1)
        expect(mockCallHarmonyNapiToolCalls[0].toolName).toBe("check_ets_files")
        expect(mockCallHarmonyNapiToolCalls[0].args.files).toEqual(["a.ets", "b.ets"])
      })
    })
  })

  describe("tool execute - result formatting", () => {
    test("should extract text from content array", async () => {
      await withDevecoHome(async () => {
        mockCallHarmonyNapiToolResult = {
          content: [{ text: "line1" }, { text: "line2" }],
        }
        const result = await tools.check_ets_files.execute({ files: ["test.ets"] }, defaultCtx)
        expect(result).toBe("line1\nline2")
      })
    })

    test("should filter out empty text entries from content array", async () => {
      await withDevecoHome(async () => {
        mockCallHarmonyNapiToolResult = {
          content: [{ text: "hello" }, { text: "" }, { text: "world" }],
        }
        const result = await tools.check_ets_files.execute({ files: ["test.ets"] }, defaultCtx)
        expect(result).toBe("hello\nworld")
      })
    })

    test("should fall back to JSON.stringify when result has no content array", async () => {
      await withDevecoHome(async () => {
        mockCallHarmonyNapiToolResult = { status: "success", data: 42 }
        const result = await tools.check_ets_files.execute({ files: ["test.ets"] }, defaultCtx)
        expect(result).toContain('"status"')
        expect(result).toContain('"success"')
      })
    })

    test("should fall back to JSON.stringify when result is null", async () => {
      await withDevecoHome(async () => {
        mockCallHarmonyNapiToolResult = null
        const result = await tools.check_ets_files.execute({ files: ["test.ets"] }, defaultCtx)
        expect(result).toBe("null")
      })
    })

    test("should fall back to JSON.stringify when content array has no text entries", async () => {
      await withDevecoHome(async () => {
        mockCallHarmonyNapiToolResult = {
          content: [{ image: "base64data" }],
        }
        const result = await tools.check_ets_files.execute({ files: ["test.ets"] }, defaultCtx)
        expect(result).toContain('"content"')
      })
    })

    test("should fall back to JSON.stringify when content array is empty", async () => {
      await withDevecoHome(async () => {
        mockCallHarmonyNapiToolResult = { content: [] }
        const result = await tools.check_ets_files.execute({ files: ["test.ets"] }, defaultCtx)
        expect(result).toContain('"content"')
      })
    })
  })

  describe("tool execute - argsJson parsing", () => {
    test("should parse argsJson string and pass parsed object when args has single argsJson key", async () => {
      await withDevecoHome(async () => {
        mockCallHarmonyNapiToolResult = { content: [{ text: "ok" }] }
        await tools.check_ets_files.execute({ argsJson: '{"files":["test.ets"]}' }, defaultCtx)
        expect(mockCallHarmonyNapiToolCalls[0].args.files).toEqual(["test.ets"])
      })
    })

    test("should throw error when argsJson is not a JSON object string", async () => {
      await withDevecoHome(async () => {
        const error = await catchError(() =>
          tools.check_ets_files.execute({ argsJson: "[1,2,3]" }, defaultCtx),
        )
        expect(error).toBeDefined()
        expect(error!.message).toContain("argsJson must be a JSON object")
      })
    })

    test("should throw error when argsJson is malformed JSON", async () => {
      await withDevecoHome(async () => {
        const error = await catchError(() =>
          tools.check_ets_files.execute({ argsJson: "{bad json}" }, defaultCtx),
        )
        expect(error).toBeDefined()
      })
    })

    test("should throw error when argsJson is a JSON primitive (not object)", async () => {
      await withDevecoHome(async () => {
        const error = await catchError(() =>
          tools.check_ets_files.execute({ argsJson: "42" }, defaultCtx),
        )
        expect(error).toBeDefined()
        expect(error!.message).toContain("argsJson must be a JSON object")
      })
    })
  })

  describe("tool execute - args validation", () => {
    test("should throw validation error when args fail schema validation", async () => {
      await withDevecoHome(async () => {
        const error = await catchError(() =>
          tools.check_ets_files.execute({ files: "not-an-array" }, defaultCtx),
        )
        expect(error).toBeDefined()
        expect(error!.message).toContain("Args validation failed")
      })
    })
  })

})
