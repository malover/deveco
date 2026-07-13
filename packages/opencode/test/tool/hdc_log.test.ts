import { afterEach, beforeEach, describe, expect, mock, spyOn } from "bun:test"
import { Cause, Effect, Exit, Layer } from "effect"
import { Agent } from "../../src/agent/agent"
import { Truncate } from "../../src/tool/truncate"
import { Tool } from "../../src/tool/tool"
import { SessionID, MessageID } from "../../src/session/schema"
import { testEffect } from "../lib/effect"

let mockFindDevEcoHomeResult: string | undefined
let mockHdcPathResult: string
let mockFileExistsResult: boolean

void mock.module("../../src/tool/lib/env", () => ({
  findDevEcoHome: async () => mockFindDevEcoHomeResult,
  hdcPath: (_home: string) => mockHdcPathResult,
}))

const { HdcLogTool } = await import("../../src/tool/hdc_log")

const mockTruncateLayer = Layer.mock(Truncate.Service, {
  output: (text: string) => Effect.succeed({ content: text, truncated: false as const }),
})

const mockAgentLayer = Layer.mock(Agent.Service, {
  get: (_name: string) =>
    Effect.succeed({
      name: "build",
      mode: "all" as const,
      permission: [],
      options: {},
    } satisfies Agent.Info),
  defaultAgent: () => Effect.succeed("build"),
})

const it = testEffect(Layer.mergeAll(mockTruncateLayer, mockAgentLayer))

const ctx: Tool.Context = {
  sessionID: SessionID.make("ses_hdc_log_test"),
  messageID: MessageID.make("msg_hdc_log_test"),
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
}

function textToStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text))
      controller.close()
    },
  })
}

function mockSpawnResult(stdout: string, stderr: string, exitCode: number) {
  return {
    stdout: stdout ? textToStream(stdout) : null,
    stderr: stderr ? textToStream(stderr) : null,
    exited: Promise.resolve(exitCode),
  }
}

const initTool = Effect.fn("HdcLogTest.init")(function* () {
  const info = yield* HdcLogTool
  return yield* info.init()
})

const execute = Effect.fn("HdcLogTest.execute")(function* (
  args: Tool.InferParameters<typeof HdcLogTool>,
  toolCtx: Tool.Context = ctx,
) {
  const tool = yield* initTool()
  return yield* tool.execute(args, toolCtx)
})

const failExecute = Effect.fn("HdcLogTest.fail")(function* (
  args: Tool.InferParameters<typeof HdcLogTool>,
  toolCtx: Tool.Context = ctx,
) {
  const exit = yield* execute(args, toolCtx).pipe(Effect.exit)
  if (Exit.isFailure(exit)) {
    const err = Cause.squash(exit.cause)
    return err instanceof Error ? err : new Error(String(err))
  }
  throw new Error("expected execution to fail but it succeeded")
})

function resetMocks() {
  mockFindDevEcoHomeResult = "/fake/deveco"
  mockHdcPathResult = "/fake/hdc"
  mockFileExistsResult = true
}

function setupFileMock() {
  // @ts-expect-error Bun.file mock returns partial BunFile
  return spyOn(Bun, "file").mockImplementation((_path: string) => ({
    exists: () => Promise.resolve(mockFileExistsResult),
  }))
}

function setupSpawnMock(stdout: string, stderr: string, exitCode: number) {
  return spyOn(Bun, "spawn").mockImplementation(() => mockSpawnResult(stdout, stderr, exitCode) as any)
}

function setupSpawnCapture() {
  let capturedCmd: string[] = []
  // @ts-expect-error Bun.spawn mock returns partial Subprocess
  const spy = spyOn(Bun, "spawn").mockImplementation((opts: Record<string, unknown>) => {
    capturedCmd = opts.cmd as string[]
    return mockSpawnResult("", "", 0) as any
  })
  return { spy, capturedCmd: () => capturedCmd }
}

function setupSpawnCaptureWithOutput(stdout: string) {
  let capturedCmd: string[] = []
  // @ts-expect-error Bun.spawn mock returns partial Subprocess
  const spy = spyOn(Bun, "spawn").mockImplementation((opts: Record<string, unknown>) => {
    capturedCmd = opts.cmd as string[]
    return mockSpawnResult(stdout, "", 0) as any
  })
  return { spy, capturedCmd: () => capturedCmd }
}

describe("HdcLogTool", () => {
  let fileSpy: ReturnType<typeof spyOn> | undefined
  let spawnSpy: ReturnType<typeof spyOn> | undefined

  beforeEach(() => {
    resetMocks()
    fileSpy = undefined
    spawnSpy = undefined
  })

  afterEach(() => {
    fileSpy?.mockRestore()
    spawnSpy?.mockRestore()
  })

  describe("execute", () => {
    it.live("should throw error when DevEco home is not found", () =>
      Effect.gen(function* () {
        mockFindDevEcoHomeResult = undefined
        const error = yield* failExecute({ action: "list_devices", log_prefix: "[TEST]", lines: 100 })
        expect(error.message).toContain("DevEco Studio path not found")
      }),
    )

    it.live("should throw error when hdc binary does not exist at resolved path", () =>
      Effect.gen(function* () {
        mockFileExistsResult = false
        fileSpy = setupFileMock()
        const error = yield* failExecute({ action: "list_devices", log_prefix: "[TEST]", lines: 100 })
        expect(error.message).toContain("hdc not found")
        expect(error.message).toContain("/fake/hdc")
      }),
    )

    describe("list_devices", () => {
      it.live("should throw error when hdc list targets returns non-zero exit code", () =>
        Effect.gen(function* () {
          fileSpy = setupFileMock()
          spawnSpy = setupSpawnMock("", "connection error", 1)
          const error = yield* failExecute({ action: "list_devices", log_prefix: "[TEST]", lines: 100 })
          expect(error.message).toContain("hdc list targets failed")
          expect(error.message).toContain("connection error")
        }),
      )

      it.live("should prefer stderr over stdout in error message when both are present", () =>
        Effect.gen(function* () {
          fileSpy = setupFileMock()
          spawnSpy = setupSpawnMock("stdout msg", "stderr msg", 1)
          const error = yield* failExecute({ action: "list_devices", log_prefix: "[TEST]", lines: 100 })
          expect(error.message).toContain("stderr msg")
        }),
      )

      it.live("should return No Devices when stdout is empty", () =>
        Effect.gen(function* () {
          fileSpy = setupFileMock()
          spawnSpy = setupSpawnMock("", "", 0)
          const result = yield* execute({ action: "list_devices", log_prefix: "[TEST]", lines: 100 })
          expect(result.title).toBe("No Devices")
          expect(result.output).toBe("No connected devices detected.")
          expect(result.metadata.deviceCount).toBe(0)
          expect(result.metadata.lineCount).toBeUndefined()
        }),
      )

      it.live("should return No Devices when output only contains [Empty] entries", () =>
        Effect.gen(function* () {
          fileSpy = setupFileMock()
          spawnSpy = setupSpawnMock("[Empty]\n  [Empty]  \n", "", 0)
          const result = yield* execute({ action: "list_devices", log_prefix: "[TEST]", lines: 100 })
          expect(result.title).toBe("No Devices")
          expect(result.metadata.deviceCount).toBe(0)
        }),
      )

      it.live("should return Connected Devices with numbered device list", () =>
        Effect.gen(function* () {
          fileSpy = setupFileMock()
          spawnSpy = setupSpawnMock("device_abc\ndevice_def\n", "", 0)
          const result = yield* execute({ action: "list_devices", log_prefix: "[TEST]", lines: 100 })
          expect(result.title).toBe("Connected Devices")
          expect(result.output).toContain("Connected devices:")
          expect(result.output).toContain("1. device_abc")
          expect(result.output).toContain("2. device_def")
          expect(result.metadata.deviceCount).toBe(2)
        }),
      )

      it.live("should trim whitespace and skip blank lines from device entries", () =>
        Effect.gen(function* () {
          fileSpy = setupFileMock()
          spawnSpy = setupSpawnMock("  device1  \n\n  \r\n  device2  \n", "", 0)
          const result = yield* execute({ action: "list_devices", log_prefix: "[TEST]", lines: 100 })
          expect(result.output).toContain("1. device1")
          expect(result.output).toContain("2. device2")
          expect(result.metadata.deviceCount).toBe(2)
        }),
      )

      it.live("should handle CRLF line endings in device output", () =>
        Effect.gen(function* () {
          fileSpy = setupFileMock()
          spawnSpy = setupSpawnMock("device_a\r\ndevice_b\r\n", "", 0)
          const result = yield* execute({ action: "list_devices", log_prefix: "[TEST]", lines: 100 })
          expect(result.output).toContain("1. device_a")
          expect(result.output).toContain("2. device_b")
          expect(result.metadata.deviceCount).toBe(2)
        }),
      )
    })

    describe("clear", () => {
      it.live("should throw error when hdc hilog -r returns non-zero exit code", () =>
        Effect.gen(function* () {
          fileSpy = setupFileMock()
          spawnSpy = setupSpawnMock("", "clear failed", 1)
          const error = yield* failExecute({ action: "clear", log_prefix: "[TEST]", lines: 100 })
          expect(error.message).toContain("hdc hilog -r failed")
          expect(error.message).toContain("clear failed")
        }),
      )

      it.live("should return Log Buffer Cleared with default device when device_id is omitted", () =>
        Effect.gen(function* () {
          fileSpy = setupFileMock()
          spawnSpy = setupSpawnMock("", "", 0)
          const result = yield* execute({ action: "clear", log_prefix: "[TEST]", lines: 100 })
          expect(result.title).toBe("Log Buffer Cleared")
          expect(result.output).toContain("Device log buffer cleared.")
          expect(result.output).toContain("device: default")
          expect(result.metadata.deviceCount).toBeUndefined()
          expect(result.metadata.lineCount).toBeUndefined()
        }),
      )

      it.live("should return Log Buffer Cleared with specified device_id in output", () =>
        Effect.gen(function* () {
          fileSpy = setupFileMock()
          spawnSpy = setupSpawnMock("", "", 0)
          const result = yield* execute({ action: "clear", device_id: "emulator-5554", log_prefix: "[TEST]", lines: 100 })
          expect(result.output).toContain("device: emulator-5554")
          expect(result.output).not.toContain("device: default")
        }),
      )

      it.live("should include -t device flag in spawn command when device_id is specified", () =>
        Effect.gen(function* () {
          fileSpy = setupFileMock()
          const capture = setupSpawnCapture()
          spawnSpy = capture.spy
          yield* execute({ action: "clear", device_id: "emulator-5554", log_prefix: "[TEST]", lines: 100 })
          expect(capture.capturedCmd()).toContain("-t")
          expect(capture.capturedCmd()).toContain("emulator-5554")
        }),
      )
    })

    describe("collect", () => {
      it.live("should throw error when hdc hilog -x returns non-zero exit code with stderr", () =>
        Effect.gen(function* () {
          fileSpy = setupFileMock()
          spawnSpy = setupSpawnMock("", "hilog collection error", 1)
          const error = yield* failExecute({ action: "collect", log_prefix: "[TEST]", lines: 100 })
          expect(error.message).toContain("hdc hilog -x failed")
          expect(error.message).toContain("hilog collection error")
        }),
      )

      it.live("should include stdout in error message when stderr is empty and exit code is non-zero", () =>
        Effect.gen(function* () {
          fileSpy = setupFileMock()
          spawnSpy = setupSpawnMock("error from stdout", "", 2)
          const error = yield* failExecute({ action: "collect", log_prefix: "[TEST]", lines: 100 })
          expect(error.message).toContain("error from stdout")
        }),
      )

      it.live("should return No Matching Logs when no logs match prefix filter", () =>
        Effect.gen(function* () {
          fileSpy = setupFileMock()
          spawnSpy = setupSpawnMock("line1\nline2\n", "", 0)
          const result = yield* execute({ action: "collect", log_prefix: "[NOMATCH]", lines: 100 })
          expect(result.title).toBe("No Matching Logs")
          expect(result.output).toContain("No matching logs found.")
          expect(result.output).toContain("device: default")
          expect(result.output).toContain("prefix: [NOMATCH]")
          expect(result.metadata.lineCount).toBe(0)
          expect(result.metadata.deviceCount).toBeUndefined()
        }),
      )

      it.live("should return No Matching Logs when stdout has only blank/whitespace lines", () =>
        Effect.gen(function* () {
          fileSpy = setupFileMock()
          spawnSpy = setupSpawnMock("  \n\n\r\n  \n", "", 0)
          const result = yield* execute({ action: "collect", log_prefix: "", lines: 100 })
          expect(result.title).toBe("No Matching Logs")
          expect(result.metadata.lineCount).toBe(0)
        }),
      )

      it.live("should return Log Collection Successful with prefix-filtered log content", () =>
        Effect.gen(function* () {
          fileSpy = setupFileMock()
          const logContent = "[VCODER_DEBUG] first log\n[OTHER] other log\n[VCODER_DEBUG] second log\n"
          spawnSpy = setupSpawnMock(logContent, "", 0)
          const result = yield* execute({ action: "collect", log_prefix: "[VCODER_DEBUG]", lines: 100 })
          expect(result.title).toBe("Log Collection Successful")
          expect(result.output).toContain("Log collection successful.")
          expect(result.output).toContain("--- Log Content ---")
          expect(result.output).toContain("[VCODER_DEBUG] first log")
          expect(result.output).toContain("[VCODER_DEBUG] second log")
          expect(result.output).not.toContain("[OTHER] other log")
          expect(result.output).toContain("count: 2")
          expect(result.output).toContain("prefix: [VCODER_DEBUG]")
          expect(result.metadata.lineCount).toBe(2)
        }),
      )

      it.live("should return all lines when prefix is empty string", () =>
        Effect.gen(function* () {
          fileSpy = setupFileMock()
          const logContent = "unfiltered1\n[VCODER_DEBUG] filtered\nunfiltered2\n"
          spawnSpy = setupSpawnMock(logContent, "", 0)
          const result = yield* execute({ action: "collect", log_prefix: "", lines: 100 })
          expect(result.metadata.lineCount).toBe(3)
          expect(result.output).toContain("unfiltered1")
          expect(result.output).toContain("[VCODER_DEBUG] filtered")
          expect(result.output).toContain("unfiltered2")
          expect(result.output).toContain("prefix: ")
        }),
      )

      it.live("should limit output to last N matching lines when lines count is less than total", () =>
        Effect.gen(function* () {
          fileSpy = setupFileMock()
          const lines = Array.from({ length: 10 }, (_, i) => `[TEST] log${i + 1}`).join("\n")
          spawnSpy = setupSpawnMock(lines, "", 0)
          const result = yield* execute({ action: "collect", log_prefix: "[TEST]", lines: 3 })
          expect(result.metadata.lineCount).toBe(3)
          expect(result.output).toContain("[TEST] log8")
          expect(result.output).toContain("[TEST] log9")
          expect(result.output).toContain("[TEST] log10")
          expect(result.output).not.toContain("[TEST] log7")
        }),
      )

      it.live("should include specified device_id in output", () =>
        Effect.gen(function* () {
          fileSpy = setupFileMock()
          const logContent = "[TEST] log entry\n"
          spawnSpy = setupSpawnMock(logContent, "", 0)
          const result = yield* execute({ action: "collect", device_id: "real-device-001", log_prefix: "[TEST]", lines: 100 })
          expect(result.output).toContain("device: real-device-001")
          expect(result.output).not.toContain("device: default")
        }),
      )

      it.live("should include -t device flag in spawn command when device_id is specified", () =>
        Effect.gen(function* () {
          fileSpy = setupFileMock()
          const logContent = "[TEST] log entry\n"
          const capture = setupSpawnCaptureWithOutput(logContent)
          spawnSpy = capture.spy
          yield* execute({ action: "collect", device_id: "real-device-001", log_prefix: "[TEST]", lines: 100 })
          expect(capture.capturedCmd()).toContain("-t")
          expect(capture.capturedCmd()).toContain("real-device-001")
        }),
      )

      it.live("should handle CRLF line endings in log output", () =>
        Effect.gen(function* () {
          fileSpy = setupFileMock()
          spawnSpy = setupSpawnMock("[TEST] line1\r\n[TEST] line2\r\n", "", 0)
          const result = yield* execute({ action: "collect", log_prefix: "[TEST]", lines: 100 })
          expect(result.metadata.lineCount).toBe(2)
          expect(result.output).toContain("[TEST] line1")
          expect(result.output).toContain("[TEST] line2")
        }),
      )

      it.live("should skip blank and whitespace-only lines in log output", () =>
        Effect.gen(function* () {
          fileSpy = setupFileMock()
          spawnSpy = setupSpawnMock("[TEST] a\n   \n\n[TEST] b\n", "", 0)
          const result = yield* execute({ action: "collect", log_prefix: "[TEST]", lines: 100 })
          expect(result.metadata.lineCount).toBe(2)
          expect(result.output).toContain("[TEST] a")
          expect(result.output).toContain("[TEST] b")
        }),
      )

      it.live("should not include -t flag when device_id is omitted", () =>
        Effect.gen(function* () {
          fileSpy = setupFileMock()
          const logContent = "[TEST] log entry\n"
          const capture = setupSpawnCaptureWithOutput(logContent)
          spawnSpy = capture.spy
          yield* execute({ action: "collect", log_prefix: "[TEST]", lines: 100 })
          expect(capture.capturedCmd()).not.toContain("-t")
        }),
      )
    })
  })
})
