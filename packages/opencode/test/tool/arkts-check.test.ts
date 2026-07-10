import { describe, expect, beforeEach, afterEach } from "bun:test"
import { Effect, Layer, Schema } from "effect"
import fs from "fs"
import path from "path"
import os from "os"
import { ArktsCheckTool } from "../../src/tool/arkts_check"
import { Tool } from "@/tool/tool"
import { Agent } from "@/agent/agent"
import { Truncate } from "@/tool/truncate"
import { testEffect } from "../lib/effect"
import { SessionID, MessageID } from "../../src/session/schema"

const it = testEffect(Layer.mergeAll(Truncate.defaultLayer, Agent.defaultLayer))

describe("arkts_check Parameters schema", () => {
  it.effect("accepts valid file list with multiple files", () =>
    Effect.gen(function* () {
      const info = yield* ArktsCheckTool
      const def = yield* info.init()
      const decode = Schema.decodeUnknownSync(def.parameters)
      const result = decode({ files: ["src/page.ets", "src/component.ets"] })
      expect(result.files).toEqual(["src/page.ets", "src/component.ets"])
    }),
  )

  it.effect("accepts single file in list", () =>
    Effect.gen(function* () {
      const info = yield* ArktsCheckTool
      const def = yield* info.init()
      const decode = Schema.decodeUnknownSync(def.parameters)
      const result = decode({ files: ["main.ets"] })
      expect(result.files).toEqual(["main.ets"])
    }),
  )

  it.effect("accepts empty file list", () =>
    Effect.gen(function* () {
      const info = yield* ArktsCheckTool
      const def = yield* info.init()
      const decode = Schema.decodeUnknownSync(def.parameters)
      const result = decode({ files: [] })
      expect(result.files).toEqual([])
    }),
  )

  it.effect("rejects missing files field", () =>
    Effect.gen(function* () {
      const info = yield* ArktsCheckTool
      const def = yield* info.init()
      const decode = Schema.decodeUnknownSync(def.parameters)
      expect(() => decode({})).toThrow()
    }),
  )

  it.effect("rejects non-array files value", () =>
    Effect.gen(function* () {
      const info = yield* ArktsCheckTool
      const def = yield* info.init()
      const decode = Schema.decodeUnknownSync(def.parameters)
      expect(() => decode({ files: "not-an-array" })).toThrow()
    }),
  )

  it.effect("rejects array with non-string elements", () =>
    Effect.gen(function* () {
      const info = yield* ArktsCheckTool
      const def = yield* info.init()
      const decode = Schema.decodeUnknownSync(def.parameters)
      expect(() => decode({ files: ["valid.ets", 123, "another.ets"] })).toThrow()
    }),
  )
})

describe("ArktsCheckTool structure", () => {
  it.effect("has correct tool id, description, parameters, and execute", () =>
    Effect.gen(function* () {
      const info = yield* ArktsCheckTool
      expect(info.id).toBe("arkts_check")
      const def = yield* info.init()
      expect(typeof def.description).toBe("string")
      expect(def.description.length).toBeGreaterThan(0)
      expect(def.parameters).toBeDefined()
      expect(typeof def.execute).toBe("function")
    }),
  )
})

describe("arkts_check execute error handling", () => {
  let tmpDir: string
  let originalEnv: string | undefined

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-check-test-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    if (originalEnv !== undefined) {
      process.env.DEVECO_HOME = originalEnv
    } else {
      delete process.env.DEVECO_HOME
    }
  })

  it.effect("throws error when DevEco Studio path not found", () =>
    Effect.gen(function* () {
      originalEnv = process.env.DEVECO_HOME
      delete process.env.DEVECO_HOME
      
      const info = yield* ArktsCheckTool
      const def = yield* info.init()
      const ctx = {
        sessionID: SessionID.make("ses_test"),
        messageID: MessageID.make("msg_test"),
        agent: "build",
        abort: new AbortController().signal,
        messages: [],
        metadata: () => Effect.void,
        ask: () => Effect.void,
      }

      const result = yield* def.execute(
        { files: ["test.ets"] },
        ctx,
      ).pipe(Effect.exit)

      expect(result._tag).toBe("Failure")
    }),
  )

  it.effect("throws error when node binary not found", () =>
    Effect.gen(function* () {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-check-test-"))
      const fakeHome = path.join(tmpDir, "FakeDevEco")
      fs.mkdirSync(fakeHome, { recursive: true })
      
      originalEnv = process.env.DEVECO_HOME
      process.env.DEVECO_HOME = fakeHome

      const info = yield* ArktsCheckTool
      const def = yield* info.init()
      const ctx = {
        sessionID: SessionID.make("ses_test"),
        messageID: MessageID.make("msg_test"),
        agent: "build",
        abort: new AbortController().signal,
        messages: [],
        metadata: () => Effect.void,
        ask: () => Effect.void,
      }

      const result = yield* def.execute(
        { files: ["test.ets"] },
        ctx,
      ).pipe(Effect.exit)

      expect(result._tag).toBe("Failure")
    }),
  )
})

describe("arkts_check execute subprocess error handling", () => {
  let tmpDir: string
  let fakeHome: string
  let originalEnv: string | undefined

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arkts-check-test-"))
    fakeHome = path.join(tmpDir, "FakeDevEco")
    fs.mkdirSync(fakeHome, { recursive: true })
    originalEnv = process.env.DEVECO_HOME
    process.env.DEVECO_HOME = fakeHome

    // Create fake product-info.json so resolveDevEcoHome passes version check
    fs.writeFileSync(
      path.join(fakeHome, "product-info.json"),
      JSON.stringify({ version: "6.0.0" }),
      "utf-8",
    )

    // Create fake node binary directory
    const nodeDir = path.join(fakeHome, "tools", "node", "bin")
    fs.mkdirSync(nodeDir, { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    if (originalEnv !== undefined) {
      process.env.DEVECO_HOME = originalEnv
    } else {
      delete process.env.DEVECO_HOME
    }
  })

  it.effect("writes arkts-check script to temp directory", () =>
    Effect.gen(function* () {
      // Create fake node binary
      const nodePath = process.platform === "win32"
        ? path.join(fakeHome, "tools", "node", "node.exe")
        : path.join(fakeHome, "tools", "node", "bin", "node")
      fs.mkdirSync(path.dirname(nodePath), { recursive: true })
      fs.writeFileSync(nodePath, "fake-node", "utf-8")

      const info = yield* ArktsCheckTool
      const def = yield* info.init()
      const ctx = {
        sessionID: SessionID.make("ses_test"),
        messageID: MessageID.make("msg_test"),
        agent: "build",
        abort: new AbortController().signal,
        messages: [],
        metadata: () => Effect.void,
        ask: () => Effect.void,
      }

      // This will fail at subprocess level since node doesn't exist
      // but it tests that ensureScriptOnDisk was called and wrote the script
      yield* def.execute({ files: ["test.ets"] }, ctx).pipe(Effect.exit)

      const scriptPath = path.join(os.tmpdir(), "deveco-arkts-check", "arkts-check.cjs")
      expect(fs.existsSync(scriptPath)).toBe(true)
    }),
  )

  it.effect("throws error when subprocess produces empty output", () =>
    Effect.gen(function* () {
      // Create fake node binary
      const nodePath = process.platform === "win32"
        ? path.join(fakeHome, "tools", "node", "node.exe")
        : path.join(fakeHome, "tools", "node", "bin", "node")
      fs.mkdirSync(path.dirname(nodePath), { recursive: true })
      fs.writeFileSync(nodePath, "fake-node", "utf-8")

      const info = yield* ArktsCheckTool
      const def = yield* info.init()
      const ctx = {
        sessionID: SessionID.make("ses_test"),
        messageID: MessageID.make("msg_test"),
        agent: "build",
        abort: new AbortController().signal,
        messages: [],
        metadata: () => Effect.void,
        ask: () => Effect.void,
      }

      // Subprocess will fail to execute, producing empty output
      const result = yield* def.execute({ files: ["test.ets"] }, ctx).pipe(Effect.exit)

      expect(result._tag).toBe("Failure")
    }),
  )
})

