import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { Cause, Effect, Exit, Layer } from "effect"
import { afterEach, describe, expect } from "bun:test"
import path from "path"
import { pathToFileURL } from "url"
import type { Tool } from "@/tool/tool"
import { SkillTool } from "../../src/tool/skill"
import { ToolRegistry } from "@/tool/registry"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { SessionID, MessageID } from "../../src/session/schema"
import { testEffect } from "../lib/effect"

const baseCtx: Omit<Tool.Context, "ask"> = {
  sessionID: SessionID.make("ses_test"),
  messageID: MessageID.make("msg_test"),
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
}

afterEach(async () => {
  await disposeAllInstances()
})

const node = CrossSpawnSpawner.defaultLayer

const it = testEffect(Layer.mergeAll(ToolRegistry.defaultLayer, node).pipe(Layer.provide(Ripgrep.defaultLayer)))
async function writeSkill(dir: string, name: string, description: string, content: string) {
  const skillDir = path.join(dir, ".deveco", "skill", name)
  await Bun.write(
    path.join(skillDir, "SKILL.md"),
    `---
name: ${name}
description: ${description}
---

${content}
`,
  )
  return skillDir
}

function makeCtx(): { ctx: Tool.Context; requests: Array<Omit<PermissionV1.Request, "id" | "sessionID" | "tool">> } {
  const requests: Array<Omit<PermissionV1.Request, "id" | "sessionID" | "tool">> = []
  const ctx: Tool.Context = {
    ...baseCtx,
    ask: (req) =>
      Effect.sync(() => {
        requests.push(req)
      }),
  }
  return { ctx, requests }
}

describe("arkts-error-fixes DevEcoRequiredSkills guard", () => {
  // Tests lines 35-39 of src/tool/skill.ts:
  // DevEcoRequiredSkills = { arkts-error-fixes, arkts-grammar-standards,
  //   arkts-runtime-fix, deveco-create-project }
  // Guard: if (DevEcoRequiredSkills.has(info.name) && !process.env.DEVECO_HOME?.trim())
  //   throw new Error("DEVECO_HOME ... is not configured ...")

  const DEV_ECO_REQUIRED = [
    "arkts-error-fixes",
    "arkts-grammar-standards",
    "arkts-runtime-fix",
    "deveco-create-project",
  ] as const

  for (const skillName of DEV_ECO_REQUIRED) {
    it.instance(`throws when DEVECO_HOME is not set for ${skillName}`, () =>
      Effect.gen(function* () {
        const dir = (yield* TestInstance).directory
        yield* Effect.promise(() =>
          writeSkill(dir, skillName, `Test ${skillName}.`, `# ${skillName} Content`),
        )

        const home = process.env.DEVECO_TEST_HOME
        const devecoHome = process.env.DEVECO_HOME
        process.env.DEVECO_TEST_HOME = dir
        delete process.env.DEVECO_HOME
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            process.env.DEVECO_TEST_HOME = home
            if (devecoHome !== undefined) process.env.DEVECO_HOME = devecoHome
          }),
        )

        const registry = yield* ToolRegistry.Service
        const agent = { name: "build", mode: "primary" as const, permission: [], options: {} }
        const tool = (yield* registry.tools({
          providerID: "opencode" as any,
          modelID: "gpt-5" as any,
          agent,
        })).find((t) => t.id === SkillTool.id)
        if (!tool) throw new Error("Skill tool not found")

        const { ctx } = makeCtx()

        const exit = yield* tool
          .execute({ name: skillName }, ctx)
          .pipe(Effect.exit)

        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) {
          const error = Cause.squash(exit.cause)
          expect(error).toBeInstanceOf(Error)
          if (error instanceof Error) {
            expect(error.message).toContain("DEVECO_HOME")
            expect(error.message).toContain("is not configured")
          }
        }
      }),
      60_000,
    )
  }

  it.instance(`throws when DEVECO_HOME is empty string`, () =>
    Effect.gen(function* () {
      const dir = (yield* TestInstance).directory
      yield* Effect.promise(() =>
        writeSkill(dir, "arkts-error-fixes", "Test.", `# Content`),
      )

      const home = process.env.DEVECO_TEST_HOME
      const devecoHome = process.env.DEVECO_HOME
      process.env.DEVECO_TEST_HOME = dir
      process.env.DEVECO_HOME = ""
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          process.env.DEVECO_TEST_HOME = home
          if (devecoHome !== undefined) process.env.DEVECO_HOME = devecoHome
          else delete process.env.DEVECO_HOME
        }),
      )

      const registry = yield* ToolRegistry.Service
      const agent = { name: "build", mode: "primary" as const, permission: [], options: {} }
      const tool = (yield* registry.tools({
        providerID: "opencode" as any,
        modelID: "gpt-5" as any,
        agent,
      })).find((t) => t.id === SkillTool.id)
      if (!tool) throw new Error("Skill tool not found")

      const { ctx } = makeCtx()

      const exit = yield* tool
        .execute({ name: "arkts-error-fixes" }, ctx)
        .pipe(Effect.exit)

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        const error = Cause.squash(exit.cause)
        if (error instanceof Error) {
          expect(error.message).toContain("DEVECO_HOME")
        }
      }
    }),
    60_000,
  )

  it.instance(`throws when DEVECO_HOME is whitespace only`, () =>
    Effect.gen(function* () {
      const dir = (yield* TestInstance).directory
      yield* Effect.promise(() =>
        writeSkill(dir, "arkts-error-fixes", "Test.", `# Content`),
      )

      const home = process.env.DEVECO_TEST_HOME
      const devecoHome = process.env.DEVECO_HOME
      process.env.DEVECO_TEST_HOME = dir
      process.env.DEVECO_HOME = "   "
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          process.env.DEVECO_TEST_HOME = home
          if (devecoHome !== undefined) process.env.DEVECO_HOME = devecoHome
          else delete process.env.DEVECO_HOME
        }),
      )

      const registry = yield* ToolRegistry.Service
      const agent = { name: "build", mode: "primary" as const, permission: [], options: {} }
      const tool = (yield* registry.tools({
        providerID: "opencode" as any,
        modelID: "gpt-5" as any,
        agent,
      })).find((t) => t.id === SkillTool.id)
      if (!tool) throw new Error("Skill tool not found")

      const { ctx } = makeCtx()

      const exit = yield* tool
        .execute({ name: "arkts-error-fixes" }, ctx)
        .pipe(Effect.exit)

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        const error = Cause.squash(exit.cause)
        if (error instanceof Error) {
          expect(error.message).toContain("DEVECO_HOME")
        }
      }
    }),
    60_000,
  )
})