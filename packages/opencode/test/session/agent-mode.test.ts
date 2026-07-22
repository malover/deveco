import { NodeFileSystem } from "@effect/platform-node"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Database } from "@opencode-ai/core/database/database"
import { Global } from "@opencode-ai/core/global"
import { expect } from "bun:test"
import { Effect, Layer } from "effect"
import { SessionAgentMode } from "../../src/session/agent-mode/routing"
import { isDirectDebugExit } from "../../src/session/agent-mode/debug"
import { SessionDebugState } from "../../src/session/debug-state"
import { Session } from "@/session/session"
import { SessionRunState } from "@/session/run-state"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Agent } from "../../src/agent/agent"
import { Auth } from "@/auth"
import { Config } from "@/config/config"
import { Provider } from "@/provider/provider"
import { SessionID } from "../../src/session/schema"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const infra = Layer.mergeAll(NodeFileSystem.layer, CrossSpawnSpawner.defaultLayer)

const it = testEffect(
  Layer.mergeAll(
    SessionAgentMode.defaultLayer,
    Session.defaultLayer,
    Agent.defaultLayer,
    Auth.defaultLayer,
    Config.defaultLayer,
    Provider.defaultLayer,
    Global.defaultLayer,
    Database.defaultLayer,
    EventV2Bridge.defaultLayer,
    SessionRunState.defaultLayer,
    infra,
  ),
)

expect(
  isDirectDebugExit({
    sessionID: SessionID.make("ses_test"),
    parts: [{ type: "text", text: "请退出 debug 模式" }],
  }),
).toBe(true)
expect(
  isDirectDebugExit({
    sessionID: SessionID.make("ses_test"),
    parts: [{ type: "text", text: "如何实现退出debug模式按钮" }],
  }),
).toBe(false)

it.instance("routePrompt continues normally without sticky debug", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    const sessions = yield* Session.Service
    const agentMode = yield* SessionAgentMode.Service
    const chat = yield* sessions.create({ title: "agent-mode" })

    const routed = yield* agentMode.routePrompt({
      sessionID: chat.id,
      agent: "build",
      parts: [{ type: "text", text: "hello" }],
    })

    expect(routed.type).toBe("continue")
    if (routed.type !== "continue") return
    expect(routed.input.agent).toBe("build")
    expect(test.directory).toContain("opencode-test-")
  }),
)

it.instance("routePrompt forces debug agent while sticky debug is active", () =>
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    const debugState = yield* SessionDebugState.Service
    const agentMode = yield* SessionAgentMode.Service
    const chat = yield* sessions.create({ title: "agent-mode" })

    yield* debugState.enter(chat.id, { condition: "white screen", agent: "debug", mode: "build" })
    const routed = yield* agentMode.routePrompt({
      sessionID: chat.id,
      agent: "build",
      parts: [{ type: "text", text: "still broken" }],
    })

    expect(routed.type).toBe("continue")
    if (routed.type !== "continue") return
    expect(routed.input.agent).toBe("debug")
  }),
)

it.instance("routePrompt returns semantic-exit when user asks to leave debug", () =>
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    const debugState = yield* SessionDebugState.Service
    const agentMode = yield* SessionAgentMode.Service
    const chat = yield* sessions.create({ title: "agent-mode" })

    yield* debugState.enter(chat.id, { condition: "crash", agent: "debug", mode: "build" })
    const routed = yield* agentMode.routePrompt({
      sessionID: chat.id,
      agent: "build",
      parts: [{ type: "text", text: "exit debug mode" }],
    })

    expect(routed.type).toBe("semantic-exit")
    if (routed.type !== "semantic-exit") return
    expect(routed.info.mode).toBe("build")
    expect(yield* debugState.get(chat.id)).toBeUndefined()
  }),
)

it.instance("resolveAssistantDisplayMode returns originating mode during debug", () =>
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    const debugState = yield* SessionDebugState.Service
    const agentMode = yield* SessionAgentMode.Service
    const chat = yield* sessions.create({ title: "agent-mode" })

    yield* debugState.enter(chat.id, { condition: "crash", agent: "debug", mode: "build" })
    expect(yield* agentMode.resolveAssistantDisplayMode(chat.id, "debug")).toBe("build")
    expect(yield* agentMode.resolveAssistantDisplayMode(chat.id, "build")).toBe("build")
  }),
)
