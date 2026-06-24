import { afterEach, describe, expect, it } from "bun:test"
import path from "path"
import fs from "fs"
import { Effect, Layer } from "effect"
import { Agent } from "@/agent/agent"
import { ToolRegistry } from "@/tool/registry"
import { Config } from "@/config/config"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { InstanceState } from "@/effect/instance-state"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import type * as ToolType from "@/tool/tool"
import { SwitchCwdTool } from "../../src/tool/switch-cwd"
import { resolveTarget } from "../../src/tool/switch-cwd"
import { getSessionCwd, clearSessionCwd } from "../../src/tool/lib/session-cwd"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { TestConfig } from "../fixture/config"
import { SessionID, MessageID } from "../../src/session/schema"
import { testEffect } from "../lib/effect"

const configLayer = TestConfig.layer({
  directories: () => InstanceState.directory.pipe(Effect.map((dir) => [path.join(dir, ".deveco")])),
})
const root = LayerNode.group([ToolRegistry.node, Agent.node])
const replacements = [
  LayerNode.replace(Config.node, configLayer),
  LayerNode.replace(RuntimeFlags.node, RuntimeFlags.layer()),
]
const testLayer = LayerNode.buildLayer(root, { replacements })
const testIt = testEffect(testLayer)

function makeCtx(sessionID: string = "ses_test"): ToolType.Context {
  return {
    sessionID: SessionID.make(sessionID),
    messageID: MessageID.make("msg_test"),
    callID: "",
    agent: "build",
    abort: AbortSignal.any([]),
    messages: [],
    metadata: () => Effect.void,
    ask: () => Effect.void,
  }
}



afterEach(async () => {
  clearSessionCwd()
  await disposeAllInstances()
})

describe("resolveTarget", () => {
  it("throws when input is empty string", () => {
    expect(() => resolveTarget("")).toThrow("project_path must not be empty")
  })

  it("throws when input is whitespace only", () => {
    expect(() => resolveTarget("   ")).toThrow("project_path must not be empty")
  })

  it("throws when input is tab and newline only", () => {
    expect(() => resolveTarget("\t\n")).toThrow("project_path must not be empty")
  })

  it("returns normalized path for absolute input", () => {
    const abs = path.resolve("/foo/bar")
    expect(resolveTarget(abs)).toBe(path.normalize(abs))
  })

  it("normalizes dots in absolute path containing parent refs", () => {
    const input = path.resolve("/foo/../bar")
    expect(resolveTarget(input)).toBe(path.normalize(input))
  })

  it("resolves relative path from cwd", () => {
    expect(resolveTarget("subdir")).toBe(path.resolve(process.cwd(), "subdir"))
  })

  it("resolves dot as current directory", () => {
    expect(resolveTarget(".")).toBe(process.cwd())
  })

  it("resolves parent-relative path", () => {
    expect(resolveTarget("../other")).toBe(path.resolve(process.cwd(), "../other"))
  })
})

describe("switch_cwd tool", () => {
  afterEach(async () => {
    clearSessionCwd()
    await disposeAllInstances()
  })

  testIt.instance(
    "init returns correct tool id",
    () =>
      Effect.gen(function* () {
        const registry = yield* ToolRegistry.Service
        const agent = { name: "build", mode: "primary" as const, permission: [], options: {} }
        const tools = yield* registry.tools({
          providerID: "opencode" as any,
          modelID: "gpt-5" as any,
          agent,
        })
        const tool = tools.find((t) => t.id === SwitchCwdTool.id)
        expect(tool).toBeDefined()
        expect(tool!.id).toBe("switch_cwd")
      }),
    30_000,
  )

  testIt.instance(
    "execute returns harmony result for AppScope/app.json5 directory",
    () =>
      Effect.gen(function* () {
        const dir = (yield* TestInstance).directory
        const appScope = path.join(dir, "AppScope")
        fs.mkdirSync(appScope, { recursive: true })
        fs.writeFileSync(path.join(appScope, "app.json5"), "{}")

        const registry = yield* ToolRegistry.Service
        const tool = yield* getToolAsEffect(registry)
        const ctx = makeCtx("ses_appscope")
        const result = yield* tool.execute({ project_path: dir }, ctx)

        expect(result.title).toBe("Switch project context")
        expect(result.output).toContain(`Session directory updated to ${dir}`)
        expect(getSessionCwd("ses_appscope")).toBe(dir)
      }),
    30_000,
  )

  testIt.instance(
    "execute returns non-harmony warning for plain directory",
    () =>
      Effect.gen(function* () {
        const dir = (yield* TestInstance).directory
        const registry = yield* ToolRegistry.Service
        const tool = yield* getToolAsEffect(registry)
        const ctx = makeCtx("ses_plain")
        const result = yield* tool.execute({ project_path: dir }, ctx)

        expect(result.title).toBe("Switch project context")
        expect(result.output).toContain("AppScope/app.json5")
        expect(getSessionCwd("ses_plain")).toBe(dir)
      }),
    30_000,
  )

  testIt.instance(
    "execute returns harmony result for build-profile.json5 plus oh-package.json5",
    () =>
      Effect.gen(function* () {
        const dir = (yield* TestInstance).directory
        fs.writeFileSync(path.join(dir, "build-profile.json5"), "{}")
        fs.writeFileSync(path.join(dir, "oh-package.json5"), "{}")

        const registry = yield* ToolRegistry.Service
        const tool = yield* getToolAsEffect(registry)
        const ctx = makeCtx("ses_oh5")
        const result = yield* tool.execute({ project_path: dir }, ctx)

        expect(result.title).toBe("Switch project context")
        expect(getSessionCwd("ses_oh5")).toBe(dir)
      }),
    30_000,
  )

  testIt.instance(
    "execute returns harmony result for build-profile.json5 plus oh-package.json",
    () =>
      Effect.gen(function* () {
        const dir = (yield* TestInstance).directory
        fs.writeFileSync(path.join(dir, "build-profile.json5"), "{}")
        fs.writeFileSync(path.join(dir, "oh-package.json"), "{}")

        const registry = yield* ToolRegistry.Service
        const tool = yield* getToolAsEffect(registry)
        const ctx = makeCtx("ses_oh")
        const result = yield* tool.execute({ project_path: dir }, ctx)

        expect(result.title).toBe("Switch project context")
        expect(getSessionCwd("ses_oh")).toBe(dir)
      }),
    30_000,
  )

  testIt.instance(
    "execute returns non-harmony for build-profile.json5 without oh-package files",
    () =>
      Effect.gen(function* () {
        const dir = (yield* TestInstance).directory
        fs.writeFileSync(path.join(dir, "build-profile.json5"), "{}")

        const registry = yield* ToolRegistry.Service
        const tool = yield* getToolAsEffect(registry)
        const ctx = makeCtx("ses_build_only")
        const result = yield* tool.execute({ project_path: dir }, ctx)

        expect(result.title).toBe("Switch project context")
        expect(result.output).toContain("not a Harmony")
        expect(getSessionCwd("ses_build_only")).toBe(dir)
      }),
    30_000,
  )

  testIt.instance(
    "execute returns defect when path does not exist",
    () =>
      Effect.gen(function* () {
        const dir = (yield* TestInstance).directory
        const registry = yield* ToolRegistry.Service
        const tool = yield* getToolAsEffect(registry)
        const ctx = makeCtx("ses_enoent")
        const exit = yield* tool
          .execute({ project_path: path.join(dir, "nonexistent-xyz") }, ctx)
          .pipe(Effect.exit)

        expect(exit._tag).toBe("Failure")
      }),
    30_000,
  )

  testIt.instance(
    "execute returns defect when path is a file not a directory",
    () =>
      Effect.gen(function* () {
        const dir = (yield* TestInstance).directory
        const filePath = path.join(dir, "testfile.txt")
        fs.writeFileSync(filePath, "content")

        const registry = yield* ToolRegistry.Service
        const tool = yield* getToolAsEffect(registry)
        const ctx = makeCtx("ses_file")
        const exit = yield* tool
          .execute({ project_path: filePath }, ctx)
          .pipe(Effect.exit)

        expect(exit._tag).toBe("Failure")
      }),
    30_000,
  )

  testIt.instance(
    "execute updates sessionCwd correctly across switches",
    () =>
      Effect.gen(function* () {
        const dir = (yield* TestInstance).directory

        const registry = yield* ToolRegistry.Service
        const tool = yield* getToolAsEffect(registry)
        const ctx = makeCtx("ses_multi")
        yield* tool.execute({ project_path: dir }, ctx)
        expect(getSessionCwd("ses_multi")).toBe(dir)
      }),
    30_000,
  )
})

function getToolAsEffect(registry: ToolRegistry.Interface): Effect.Effect<ToolType.Def, never, never> {
  return Effect.gen(function* () {
    const agent = { name: "build", mode: "primary" as const, permission: [], options: {} }
    const tools = yield* registry.tools({
      providerID: "opencode" as any,
      modelID: "gpt-5" as any,
      agent,
    })
    const tool = tools.find((t) => t.id === SwitchCwdTool.id)
    if (!tool) throw new Error("switch_cwd tool not found")
    return tool
  }).pipe(Effect.orDie)
}
