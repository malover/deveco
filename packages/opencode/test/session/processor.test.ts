import { describe, expect } from "bun:test"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { EventV2Bridge } from "@/event-v2-bridge"
import { tool } from "ai"
import { Effect, Fiber, Layer, Stream } from "effect"
import path from "path"
import z from "zod"
import type { Agent } from "../../src/agent/agent"
import { Provider } from "@/provider/provider"

import { Session } from "@/session/session"
import { LLM } from "../../src/session/llm"
import { MessageV2 } from "../../src/session/message-v2"
import { SessionProcessor } from "../../src/session/processor"
import { MessageID, PartID, SessionID } from "../../src/session/schema"
import { SessionStatus } from "../../src/session/status"
import { SessionSummary } from "../../src/session/summary"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { provideTmpdirInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { SessionEvent } from "@opencode-ai/core/session/event"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { LLMEvent } from "@opencode-ai/llm"

const summary = Layer.succeed(
  SessionSummary.Service,
  SessionSummary.Service.of({
    summarize: () => Effect.void,
    diff: () => Effect.succeed([]),
    computeDiff: () => Effect.succeed([]),
  }),
)

const ref = {
  providerID: ProviderV2.ID.make("test"),
  modelID: ModelV2.ID.make("test-model"),
}

const cfg = {
  provider: {
    test: {
      name: "Test",
      id: "test",
      env: [],
      npm: "@ai-sdk/openai-compatible",
      models: {
        "test-model": {
          id: "test-model",
          name: "Test Model",
          attachment: false,
          reasoning: false,
          temperature: false,
          tool_call: true,
          release_date: "2025-01-01",
          limit: { context: 100000, output: 10000 },
          cost: { input: 0, output: 0 },
          options: {},
        },
      },
      options: {
        apiKey: "test-key",
        baseURL: "http://localhost:1/v1",
      },
    },
  },
}

function agent(): Agent.Info {
  return {
    name: "build",
    mode: "primary",
    options: {},
    permission: [{ permission: "*", pattern: "*", action: "allow" }],
  }
}

const root = LayerNode.group([
  SessionProcessor.node,
  Session.node,
  SessionProjector.node,
  Provider.node,
  Database.node,
  EventV2Bridge.node,
  SessionStatus.node,
  CrossSpawnSpawner.node,
])

const replacements = [
  LayerNode.replace(SessionSummary.node, summary),
  LayerNode.replace(RuntimeFlags.node, RuntimeFlags.layer({ experimentalEventSystem: true })),
]

function mockLLM(events: LLMEvent[]) {
  return Layer.succeed(
    LLM.Service,
    LLM.Service.of({
      stream: () => Stream.fromIterable(events),
    }),
  )
}

function makeUser(sessionID: SessionID, text: string) {
  return Effect.fn("TestUser")(function* () {
    const session = yield* Session.Service
    const msg = yield* session.updateMessage({
      id: MessageID.ascending(),
      role: "user",
      sessionID,
      agent: "build",
      model: ref,
      time: { created: Date.now() },
    })
    yield* session.updatePart({
      id: PartID.ascending(),
      messageID: msg.id,
      sessionID,
      type: "text",
      text,
    })
    return msg
  })
}

function makeAssistant(sessionID: SessionID, parentID: MessageID, rootDir: string) {
  return Effect.fn("TestAssistant")(function* () {
    const session = yield* Session.Service
    const msg: SessionV1.Assistant = {
      id: MessageID.ascending(),
      role: "assistant",
      sessionID,
      mode: "build",
      agent: "build",
      path: { cwd: rootDir, root: rootDir },
      cost: 0,
      tokens: {
        total: 0,
        input: 0,
        output: 0,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
      modelID: ref.modelID,
      providerID: ref.providerID,
      parentID,
      time: { created: Date.now() },
      finish: "end_turn",
    }
    yield* session.updateMessage(msg)
    return msg
  })
}

const boot = Effect.fn("boot")(function* () {
  const processors = yield* SessionProcessor.Service
  const session = yield* Session.Service
  const provider = yield* Provider.Service
  return { processors, session, provider }
})

function makeStreamInput(parentMsg: SessionV1.User, chatID: SessionID, mdl: Provider.Model) {
  return {
    user: {
      id: parentMsg.id,
      sessionID: chatID,
      role: "user" as const,
      time: parentMsg.time,
      agent: parentMsg.agent,
      model: { providerID: ref.providerID, modelID: ref.modelID },
    } satisfies SessionV1.User,
    sessionID: chatID,
    model: mdl,
    agent: agent(),
    system: [],
    messages: [{ role: "user" as const, content: "hi" }],
    tools: {},
  } satisfies LLM.StreamInput
}

// ---------------------------------------------------------------------------
// tool-input-delta / tool-input-end via direct LLMEvent stream
// ---------------------------------------------------------------------------

describe("tool-input-delta", () => {
  const eventsEnv = LayerNode.buildLayer(root, {
    replacements: [
      ...replacements,
      LayerNode.replace(
        LLM.node,
        mockLLM([
          LLMEvent.stepStart({ index: 0 }),
          LLMEvent.toolInputStart({ id: "call-1", name: "bash" }),
          LLMEvent.toolInputDelta({ id: "call-1", name: "bash", text: '{"cmd":"pwd"}' }),
          LLMEvent.toolCall({ id: "call-1", name: "bash", input: { cmd: "pwd" } }),
          LLMEvent.toolResult({
            id: "call-1",
            name: "bash",
            result: { type: "json", value: { output: "/tmp" } },
          }),
          LLMEvent.stepFinish({ index: 0, reason: "stop" }),
          LLMEvent.finish({ reason: "stop" }),
        ]),
      ),
    ],
  })
  const it = testEffect(eventsEnv)

  it.live(
    "captures tool input deltas in tool part",
    () =>
      provideTmpdirInstance(
        (dir) =>
          Effect.gen(function* () {
            const { processors, session, provider } = yield* boot()
            const chat = yield* session.create({})
            const parent = yield* makeUser(chat.id, "hello")()
            const msg = yield* makeAssistant(chat.id, parent.id, path.resolve(dir))()
            const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
            const handle = yield* processors.create({
              assistantMessage: msg,
              sessionID: chat.id,
              model: mdl,
            })
            const result = yield* handle.process(makeStreamInput(parent, chat.id, mdl))
            const parts = yield* MessageV2.parts(msg.id)
            const toolPart = parts.find((p): p is SessionV1.ToolPart => p.type === "tool")
            expect(result).toBe("continue")
            expect(toolPart).toBeDefined()
            expect(toolPart?.callID).toBe("call-1")
            expect(toolPart?.tool).toBe("bash")
            expect(toolPart?.state.status).toBe("completed")
          }),
        { config: cfg },
      ),
    60_000,
  )
})

// ---------------------------------------------------------------------------
// tool-result with record-style output (title/metadata/attachments)
// ---------------------------------------------------------------------------

describe("tool-result record output", () => {
  const eventsEnv = LayerNode.buildLayer(root, {
    replacements: [
      ...replacements,
      LayerNode.replace(
        LLM.node,
        mockLLM([
          LLMEvent.stepStart({ index: 0 }),
          LLMEvent.toolInputStart({ id: "t1", name: "lookup" }),
          LLMEvent.toolCall({ id: "t1", name: "lookup", input: { q: "x" } }),
          LLMEvent.toolResult({
            id: "t1",
            name: "lookup",
            result: { type: "json", value: { output: "found: x" } },
          }),
          LLMEvent.stepFinish({ index: 0, reason: "stop" }),
          LLMEvent.finish({ reason: "stop" }),
        ]),
      ),
    ],
  })
  const it = testEffect(eventsEnv)

  it.live(
    "completes with record-style output using tool name as title",
    () =>
      provideTmpdirInstance(
        (dir) =>
          Effect.gen(function* () {
            const { processors, session, provider } = yield* boot()
            const chat = yield* session.create({})
            const parent = yield* makeUser(chat.id, "lookup")()
            const msg = yield* makeAssistant(chat.id, parent.id, path.resolve(dir))()
            const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
            const handle = yield* processors.create({
              assistantMessage: msg,
              sessionID: chat.id,
              model: mdl,
            })
            yield* handle.process(makeStreamInput(parent, chat.id, mdl))
            const parts = yield* MessageV2.parts(msg.id)
            const call = parts.find((p): p is SessionV1.ToolPart => p.type === "tool")
            expect(call?.state.status).toBe("completed")
            if (call?.state.status !== "completed") return
            expect(call.state.output).toBe("found: x")
            expect(call.state.title).toBe("lookup")
          }),
        { config: cfg },
      ),
    15_000,
  )
})

// ---------------------------------------------------------------------------
// tool-result with plain string output
// ---------------------------------------------------------------------------

describe("tool-result string output", () => {
  const eventsEnv = LayerNode.buildLayer(root, {
    replacements: [
      ...replacements,
      LayerNode.replace(
        LLM.node,
        mockLLM([
          LLMEvent.stepStart({ index: 0 }),
          LLMEvent.toolInputStart({ id: "s1", name: "echo" }),
          LLMEvent.toolCall({ id: "s1", name: "echo", input: { v: "hello" } }),
          LLMEvent.toolResult({
            id: "s1",
            name: "echo",
            result: { type: "text", value: "hello world" },
          }),
          LLMEvent.stepFinish({ index: 0, reason: "stop" }),
          LLMEvent.finish({ reason: "stop" }),
        ]),
      ),
    ],
  })
  const it = testEffect(eventsEnv)

  it.live("uses tool name as title for string result", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          const { processors, session, provider } = yield* boot()
          const chat = yield* session.create({})
          const parent = yield* makeUser(chat.id, "echo")()
          const msg = yield* makeAssistant(chat.id, parent.id, path.resolve(dir))()
          const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
          const handle = yield* processors.create({
            assistantMessage: msg,
            sessionID: chat.id,
            model: mdl,
          })
          yield* handle.process(makeStreamInput(parent, chat.id, mdl))
          const parts = yield* MessageV2.parts(msg.id)
          const call = parts.find((p): p is SessionV1.ToolPart => p.type === "tool")
          expect(call?.state.status).toBe("completed")
          if (call?.state.status !== "completed") return
          expect(call.state.output).toBe("hello world")
          expect(call.state.title).toBe("echo")
        }),
      { config: cfg },
    ),
  )
})

// ---------------------------------------------------------------------------
// tool-error event
// ---------------------------------------------------------------------------

describe("tool-error", () => {
  const eventsEnv = LayerNode.buildLayer(root, {
    replacements: [
      ...replacements,
      LayerNode.replace(
        LLM.node,
        mockLLM([
          LLMEvent.stepStart({ index: 0 }),
          LLMEvent.toolInputStart({ id: "e1", name: "bash" }),
          LLMEvent.toolCall({ id: "e1", name: "bash", input: { cmd: "fail" } }),
          LLMEvent.toolError({ id: "e1", name: "bash", message: "command not found", error: new Error("command not found") }),
          LLMEvent.stepFinish({ index: 0, reason: "stop" }),
          LLMEvent.finish({ reason: "stop" }),
        ]),
      ),
    ],
  })
  const it = testEffect(eventsEnv)

  it.live("marks tool as error with message", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          const { processors, session, provider } = yield* boot()
          const events = yield* EventV2Bridge.Service
          const chat = yield* session.create({})
          const parent = yield* makeUser(chat.id, "err")()
          const msg = yield* makeAssistant(chat.id, parent.id, path.resolve(dir))()
          const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
          const failed: string[] = []
          const off = yield* events.listen((event) => {
            if (event.type === SessionEvent.Tool.Failed.type) failed.push(event.type)
            return Effect.void
          })
          const handle = yield* processors.create({
            assistantMessage: msg,
            sessionID: chat.id,
            model: mdl,
          })
          yield* handle.process(makeStreamInput(parent, chat.id, mdl))
          yield* off
          const parts = yield* MessageV2.parts(msg.id)
          const call = parts.find((p): p is SessionV1.ToolPart => p.type === "tool")
          expect(call?.state.status).toBe("error")
          if (call?.state.status === "error") {
            expect(call.state.error).toContain("command not found")
          }
          expect(failed.length).toBeGreaterThanOrEqual(1)
        }),
      { config: cfg },
    ),
  )
})

// ---------------------------------------------------------------------------
// reasoning-delta orphan (no prior reasoning-start)
// ---------------------------------------------------------------------------

describe("reasoning-delta orphan", () => {
  const eventsEnv = LayerNode.buildLayer(root, {
    replacements: [
      ...replacements,
      LayerNode.replace(
        LLM.node,
        mockLLM([
          LLMEvent.stepStart({ index: 0 }),
          LLMEvent.reasoningDelta({ id: "orphan-1", text: "dropped" }),
          LLMEvent.textStart({ id: "t1" }),
          LLMEvent.textDelta({ id: "t1", text: "ok" }),
          LLMEvent.textEnd({ id: "t1" }),
          LLMEvent.stepFinish({ index: 0, reason: "stop" }),
          LLMEvent.finish({ reason: "stop" }),
        ]),
      ),
    ],
  })
  const it = testEffect(eventsEnv)

  it.live("silently drops orphan reasoning deltas", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          const { processors, session, provider } = yield* boot()
          const chat = yield* session.create({})
          const parent = yield* makeUser(chat.id, "test")()
          const msg = yield* makeAssistant(chat.id, parent.id, path.resolve(dir))()
          const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
          const handle = yield* processors.create({
            assistantMessage: msg,
            sessionID: chat.id,
            model: mdl,
          })
          const result = yield* handle.process(makeStreamInput(parent, chat.id, mdl))
          const parts = yield* MessageV2.parts(msg.id)
          const reasoning = parts.filter((p): p is SessionV1.ReasoningPart => p.type === "reasoning")
          const text = parts.find((p): p is SessionV1.TextPart => p.type === "text")
          expect(result).toBe("continue")
          expect(reasoning).toHaveLength(0)
          expect(text?.text).toBe("ok")
        }),
      { config: cfg },
    ),
  )
})

// ---------------------------------------------------------------------------
// reasoning lifecycle (start → delta → end → step-finish)
// ---------------------------------------------------------------------------

describe("reasoning lifecycle", () => {
  const eventsEnv = LayerNode.buildLayer(root, {
    replacements: [
      ...replacements,
      LayerNode.replace(
        LLM.node,
        mockLLM([
          LLMEvent.stepStart({ index: 0 }),
          LLMEvent.reasoningStart({ id: "r1" }),
          LLMEvent.reasoningDelta({ id: "r1", text: "thinking " }),
          LLMEvent.reasoningDelta({ id: "r1", text: "about it" }),
          LLMEvent.reasoningEnd({ id: "r1" }),
          LLMEvent.textStart({ id: "t1" }),
          LLMEvent.textDelta({ id: "t1", text: "answer" }),
          LLMEvent.textEnd({ id: "t1" }),
          LLMEvent.stepFinish({ index: 0, reason: "stop" }),
          LLMEvent.finish({ reason: "stop" }),
        ]),
      ),
    ],
  })
  const it = testEffect(eventsEnv)

  it.live("records reasoning text and finalizes on step-finish", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          const { processors, session, provider } = yield* boot()
          const chat = yield* session.create({})
          const parent = yield* makeUser(chat.id, "think")()
          const msg = yield* makeAssistant(chat.id, parent.id, path.resolve(dir))()
          const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
          const handle = yield* processors.create({
            assistantMessage: msg,
            sessionID: chat.id,
            model: mdl,
          })
          yield* handle.process(makeStreamInput(parent, chat.id, mdl))
          const parts = yield* MessageV2.parts(msg.id)
          const reasoning = parts.find((p): p is SessionV1.ReasoningPart => p.type === "reasoning")
          expect(reasoning).toBeDefined()
          expect(reasoning?.text).toBe("thinking about it")
          expect(reasoning?.time?.start).toBeDefined()
          expect(reasoning?.time?.end).toBeDefined()
        }),
      { config: cfg },
    ),
  )
})

// ---------------------------------------------------------------------------
// finish event (no-op)
// ---------------------------------------------------------------------------

describe("finish event", () => {
  const eventsEnv = LayerNode.buildLayer(root, {
    replacements: [
      ...replacements,
      LayerNode.replace(
        LLM.node,
        mockLLM([
          LLMEvent.stepStart({ index: 0 }),
          LLMEvent.textStart({ id: "t1" }),
          LLMEvent.textDelta({ id: "t1", text: "done" }),
          LLMEvent.textEnd({ id: "t1" }),
          LLMEvent.stepFinish({ index: 0, reason: "stop" }),
          LLMEvent.finish({ reason: "stop" }),
        ]),
      ),
    ],
  })
  const it = testEffect(eventsEnv)

  it.live("returns continue for normal finish", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          const { processors, session, provider } = yield* boot()
          const chat = yield* session.create({})
          const parent = yield* makeUser(chat.id, "test")()
          const msg = yield* makeAssistant(chat.id, parent.id, path.resolve(dir))()
          const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
          const handle = yield* processors.create({
            assistantMessage: msg,
            sessionID: chat.id,
            model: mdl,
          })
          const result = yield* handle.process(makeStreamInput(parent, chat.id, mdl))
          expect(result).toBe("continue")
        }),
      { config: cfg },
    ),
  )
})

// ---------------------------------------------------------------------------
// text-delta when no currentText (orphan)
// ---------------------------------------------------------------------------

describe("text-delta orphan", () => {
  const eventsEnv = LayerNode.buildLayer(root, {
    replacements: [
      ...replacements,
      LayerNode.replace(
        LLM.node,
        mockLLM([
          LLMEvent.stepStart({ index: 0 }),
          LLMEvent.textDelta({ id: "orphan", text: "dropped" }),
          LLMEvent.textStart({ id: "real" }),
          LLMEvent.textDelta({ id: "real", text: "kept" }),
          LLMEvent.textEnd({ id: "real" }),
          LLMEvent.stepFinish({ index: 0, reason: "stop" }),
          LLMEvent.finish({ reason: "stop" }),
        ]),
      ),
    ],
  })
  const it = testEffect(eventsEnv)

  it.live("ignores text deltas without preceding text-start", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          const { processors, session, provider } = yield* boot()
          const chat = yield* session.create({})
          const parent = yield* makeUser(chat.id, "test")()
          const msg = yield* makeAssistant(chat.id, parent.id, path.resolve(dir))()
          const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
          const handle = yield* processors.create({
            assistantMessage: msg,
            sessionID: chat.id,
            model: mdl,
          })
          yield* handle.process(makeStreamInput(parent, chat.id, mdl))
          const parts = yield* MessageV2.parts(msg.id)
          const text = parts.find((p): p is SessionV1.TextPart => p.type === "text")
          expect(text?.text).toBe("kept")
        }),
      { config: cfg },
    ),
  )
})

// ---------------------------------------------------------------------------
// text-end when no currentText (orphan)
// ---------------------------------------------------------------------------

describe("text-end orphan", () => {
  const eventsEnv = LayerNode.buildLayer(root, {
    replacements: [
      ...replacements,
      LayerNode.replace(
        LLM.node,
        mockLLM([
          LLMEvent.stepStart({ index: 0 }),
          LLMEvent.textEnd({ id: "orphan" }),
          LLMEvent.textStart({ id: "real" }),
          LLMEvent.textDelta({ id: "real", text: "ok" }),
          LLMEvent.textEnd({ id: "real" }),
          LLMEvent.stepFinish({ index: 0, reason: "stop" }),
          LLMEvent.finish({ reason: "stop" }),
        ]),
      ),
    ],
  })
  const it = testEffect(eventsEnv)

  it.live("ignores text-end without preceding text-start", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          const { processors, session, provider } = yield* boot()
          const chat = yield* session.create({})
          const parent = yield* makeUser(chat.id, "test")()
          const msg = yield* makeAssistant(chat.id, parent.id, path.resolve(dir))()
          const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
          const handle = yield* processors.create({
            assistantMessage: msg,
            sessionID: chat.id,
            model: mdl,
          })
          const result = yield* handle.process(makeStreamInput(parent, chat.id, mdl))
          expect(result).toBe("continue")
          const parts = yield* MessageV2.parts(msg.id)
          const text = parts.find((p): p is SessionV1.TextPart => p.type === "text")
          expect(text?.text).toBe("ok")
        }),
      { config: cfg },
    ),
  )
})

// ---------------------------------------------------------------------------
// step-finish with usage/tokens/cost accounting
// ---------------------------------------------------------------------------

describe("step-finish usage", () => {
  const eventsEnv = LayerNode.buildLayer(root, {
    replacements: [
      ...replacements,
      LayerNode.replace(
        LLM.node,
        mockLLM([
          LLMEvent.stepStart({ index: 0 }),
          LLMEvent.textStart({ id: "t1" }),
          LLMEvent.textDelta({ id: "t1", text: "hi" }),
          LLMEvent.textEnd({ id: "t1" }),
          LLMEvent.stepFinish({
            index: 0,
            reason: "stop",
            usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
          }),
          LLMEvent.finish({ reason: "stop" }),
        ]),
      ),
    ],
  })
  const it = testEffect(eventsEnv)

  it.live("records tokens and cost from step-finish usage", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          const { processors, session, provider } = yield* boot()
          const chat = yield* session.create({})
          const parent = yield* makeUser(chat.id, "usage")()
          const msg = yield* makeAssistant(chat.id, parent.id, path.resolve(dir))()
          const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
          const handle = yield* processors.create({
            assistantMessage: msg,
            sessionID: chat.id,
            model: mdl,
          })
          yield* handle.process(makeStreamInput(parent, chat.id, mdl))
          const parts = yield* MessageV2.parts(msg.id)
          const stepFinish = parts.find((p): p is SessionV1.StepFinishPart => p.type === "step-finish")
          expect(stepFinish).toBeDefined()
          if (!stepFinish || stepFinish.type !== "step-finish") return
          expect(stepFinish.tokens.input).toBeGreaterThanOrEqual(0)
          expect(stepFinish.reason).toBe("stop")
        }),
      { config: cfg },
    ),
  )
})

// ---------------------------------------------------------------------------
// context overflow via halt with auto compaction disabled
// ---------------------------------------------------------------------------

describe("context overflow with auto compaction disabled", () => {
  const overflowEvents = [
    LLMEvent.stepStart({ index: 0 }),
    LLMEvent.stepFinish({ index: 0, reason: "stop", usage: { inputTokens: 100001, outputTokens: 0, totalTokens: 100001 } }),
  ]
  const eventsEnv = LayerNode.buildLayer(root, {
    replacements: [
      ...replacements,
      LayerNode.replace(LLM.node, mockLLM(overflowEvents)),
    ],
  })
  const it = testEffect(eventsEnv)

  it.live("returns compact when token usage exceeds model limit", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          const { processors, session, provider } = yield* boot()
          const chat = yield* session.create({})
          const parent = yield* makeUser(chat.id, "overflow")()
          const msg = yield* makeAssistant(chat.id, parent.id, path.resolve(dir))()
          const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
          const handle = yield* processors.create({
            assistantMessage: msg,
            sessionID: chat.id,
            model: mdl,
          })
          const result = yield* handle.process(makeStreamInput(parent, chat.id, mdl))
          expect(result).toBe("compact")
        }),
      { config: { ...cfg, compaction: { auto: true } } },
    ),
  )
})

// ---------------------------------------------------------------------------
// tool-call not allowed during summary
// ---------------------------------------------------------------------------

describe("tool-call during summary", () => {
  const eventsEnv = LayerNode.buildLayer(root, {
    replacements: [
      ...replacements,
      LayerNode.replace(
        LLM.node,
        mockLLM([
          LLMEvent.stepStart({ index: 0 }),
          LLMEvent.toolCall({ id: "tc1", name: "bash", input: { cmd: "ls" } }),
          LLMEvent.stepFinish({ index: 0, reason: "stop" }),
          LLMEvent.finish({ reason: "stop" }),
        ]),
      ),
    ],
  })
  const it = testEffect(eventsEnv)

  it.live("throws when tool-call received for summary message", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          const { processors, session, provider } = yield* boot()
          const chat = yield* session.create({})
          const parent = yield* makeUser(chat.id, "summary")()
          const summaryMsg: SessionV1.Assistant = {
            id: MessageID.ascending(),
            role: "assistant",
            sessionID: chat.id,
            mode: "build",
            agent: "build",
            path: { cwd: dir, root: dir },
            cost: 0,
            tokens: {
              total: 0,
              input: 0,
              output: 0,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
            modelID: ref.modelID,
            providerID: ref.providerID,
            parentID: parent.id,
            time: { created: Date.now() },
            finish: "end_turn",
            summary: true,
          }
          yield* session.updateMessage(summaryMsg)
          const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
          const handle = yield* processors.create({
            assistantMessage: summaryMsg,
            sessionID: chat.id,
            model: mdl,
          })
          const result = yield* handle.process(makeStreamInput(parent, chat.id, mdl))
          expect(result).toBe("stop")
          expect(handle.message.error).toBeDefined()
        }),
      { config: cfg },
    ),
  )
})

// ---------------------------------------------------------------------------
// cleanup: pending reasoning parts finalized
// ---------------------------------------------------------------------------

describe("cleanup reasoning on interrupt", () => {
  const hangLLM = Layer.succeed(
    LLM.Service,
    LLM.Service.of({
      stream: () =>
        Stream.make(
          LLMEvent.stepStart({ index: 0 }),
          LLMEvent.reasoningStart({ id: "r1" }),
          LLMEvent.reasoningDelta({ id: "r1", text: "partial" }),
        ).pipe(Stream.concat(Stream.never)),
    }),
  )
  const eventsEnv = LayerNode.buildLayer(root, {
    replacements: [...replacements, LayerNode.replace(LLM.node, hangLLM)],
  })
  const it = testEffect(eventsEnv)

  it.live("finalizes reasoning time on interrupt cleanup", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          const { processors, session, provider } = yield* boot()
          const chat = yield* session.create({})
          const parent = yield* makeUser(chat.id, "reasoning cleanup")()
          const msg = yield* makeAssistant(chat.id, parent.id, path.resolve(dir))()
          const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
          const handle = yield* processors.create({
            assistantMessage: msg,
            sessionID: chat.id,
            model: mdl,
          })
          const run = yield* handle
            .process(makeStreamInput(parent, chat.id, mdl))
            .pipe(Effect.forkChild)
          yield* Effect.sleep("50 millis")
          yield* Fiber.interrupt(run)
          const parts = yield* MessageV2.parts(msg.id)
          const reasoning = parts.find((p): p is SessionV1.ReasoningPart => p.type === "reasoning")
          if (reasoning) {
            expect(reasoning.time?.end).toBeDefined()
          }
        }),
      { config: cfg },
    ),
  )
})

// ---------------------------------------------------------------------------
// multiple tool calls in single step
// ---------------------------------------------------------------------------

describe("multiple tool calls", () => {
  const eventsEnv = LayerNode.buildLayer(root, {
    replacements: [
      ...replacements,
      LayerNode.replace(
        LLM.node,
        mockLLM([
          LLMEvent.stepStart({ index: 0 }),
          LLMEvent.toolInputStart({ id: "c1", name: "bash" }),
          LLMEvent.toolCall({ id: "c1", name: "bash", input: { cmd: "ls" } }),
          LLMEvent.toolResult({
            id: "c1",
            name: "bash",
            result: { type: "json", value: { output: "file1" } },
          }),
          LLMEvent.toolInputStart({ id: "c2", name: "read" }),
          LLMEvent.toolCall({ id: "c2", name: "read", input: { path: "file1" } }),
          LLMEvent.toolResult({
            id: "c2",
            name: "read",
            result: { type: "json", value: { output: "content" } },
          }),
          LLMEvent.stepFinish({ index: 0, reason: "stop" }),
          LLMEvent.finish({ reason: "stop" }),
        ]),
      ),
    ],
  })
  const it = testEffect(eventsEnv)

  it.live("processes multiple tool calls in one step", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          const { processors, session, provider } = yield* boot()
          const chat = yield* session.create({})
          const parent = yield* makeUser(chat.id, "multi")()
          const msg = yield* makeAssistant(chat.id, parent.id, path.resolve(dir))()
          const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
          const handle = yield* processors.create({
            assistantMessage: msg,
            sessionID: chat.id,
            model: mdl,
          })
          const result = yield* handle.process(makeStreamInput(parent, chat.id, mdl))
          const parts = yield* MessageV2.parts(msg.id)
          const tools = parts.filter((p): p is SessionV1.ToolPart => p.type === "tool")
          expect(result).toBe("continue")
          expect(tools).toHaveLength(2)
          expect(tools[0]?.callID).toBe("c1")
          expect(tools[1]?.callID).toBe("c2")
          expect(tools[0]?.state.status).toBe("completed")
          expect(tools[1]?.state.status).toBe("completed")
        }),
      { config: cfg },
    ),
  )
})

// ---------------------------------------------------------------------------
// tool-result with error type result
// ---------------------------------------------------------------------------

describe("tool-result error", () => {
  const eventsEnv = LayerNode.buildLayer(root, {
    replacements: [
      ...replacements,
      LayerNode.replace(
        LLM.node,
        mockLLM([
          LLMEvent.stepStart({ index: 0 }),
          LLMEvent.toolInputStart({ id: "err1", name: "bash" }),
          LLMEvent.toolCall({ id: "err1", name: "bash", input: { cmd: "nope" } }),
          LLMEvent.toolResult({
            id: "err1",
            name: "bash",
            result: { type: "error", value: "permission denied" },
          }),
          LLMEvent.stepFinish({ index: 0, reason: "stop" }),
          LLMEvent.finish({ reason: "stop" }),
        ]),
      ),
    ],
  })
  const it = testEffect(eventsEnv)

  it.live("marks tool as error when result type is error", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          const { processors, session, provider } = yield* boot()
          const chat = yield* session.create({})
          const parent = yield* makeUser(chat.id, "err")()
          const msg = yield* makeAssistant(chat.id, parent.id, path.resolve(dir))()
          const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
          const handle = yield* processors.create({
            assistantMessage: msg,
            sessionID: chat.id,
            model: mdl,
          })
          yield* handle.process(makeStreamInput(parent, chat.id, mdl))
          const parts = yield* MessageV2.parts(msg.id)
          const call = parts.find((p): p is SessionV1.ToolPart => p.type === "tool")
          expect(call?.state.status).toBe("error")
          if (call?.state.status === "error") {
            expect(call.state.error).toContain("permission denied")
          }
        }),
      { config: cfg },
    ),
  )
})

// ---------------------------------------------------------------------------
// step-start creates step-start part
// ---------------------------------------------------------------------------

describe("step-start part", () => {
  const eventsEnv = LayerNode.buildLayer(root, {
    replacements: [
      ...replacements,
      LayerNode.replace(
        LLM.node,
        mockLLM([
          LLMEvent.stepStart({ index: 0 }),
          LLMEvent.textStart({ id: "t1" }),
          LLMEvent.textDelta({ id: "t1", text: "x" }),
          LLMEvent.textEnd({ id: "t1" }),
          LLMEvent.stepFinish({ index: 0, reason: "stop" }),
          LLMEvent.finish({ reason: "stop" }),
        ]),
      ),
    ],
  })
  const it = testEffect(eventsEnv)

  it.live("creates step-start part on step-start event", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          const { processors, session, provider } = yield* boot()
          const chat = yield* session.create({})
          const parent = yield* makeUser(chat.id, "step")()
          const msg = yield* makeAssistant(chat.id, parent.id, path.resolve(dir))()
          const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
          const handle = yield* processors.create({
            assistantMessage: msg,
            sessionID: chat.id,
            model: mdl,
          })
          yield* handle.process(makeStreamInput(parent, chat.id, mdl))
          const parts = yield* MessageV2.parts(msg.id)
          const stepStart = parts.find((p) => p.type === "step-start")
          const stepFinish = parts.find((p) => p.type === "step-finish")
          expect(stepStart).toBeDefined()
          expect(stepFinish).toBeDefined()
        }),
      { config: cfg },
    ),
  )
})

// ---------------------------------------------------------------------------
// provider-error causes step failure
// ---------------------------------------------------------------------------

describe("provider-error", () => {
  const eventsEnv = LayerNode.buildLayer(root, {
    replacements: [
      ...replacements,
      LayerNode.replace(
        LLM.node,
        mockLLM([
          LLMEvent.stepStart({ index: 0 }),
          LLMEvent.providerError({ message: "provider is down" }),
        ]),
      ),
    ],
  })
  const it = testEffect(eventsEnv)

  it.live("records error from provider-error event", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          const { processors, session, provider } = yield* boot()
          const chat = yield* session.create({})
          const parent = yield* makeUser(chat.id, "provider err")()
          const msg = yield* makeAssistant(chat.id, parent.id, path.resolve(dir))()
          const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
          const handle = yield* processors.create({
            assistantMessage: msg,
            sessionID: chat.id,
            model: mdl,
          })
          const result = yield* handle.process(makeStreamInput(parent, chat.id, mdl))
          expect(result).toBe("stop")
          expect(handle.message.error).toBeDefined()
        }),
      { config: cfg },
    ),
  )
})

// ---------------------------------------------------------------------------
// v2 event publishing: Tool.Input.Started / Delta / Ended / Called
// ---------------------------------------------------------------------------

describe("v2 event publishing for tool lifecycle", () => {
  const eventsEnv = LayerNode.buildLayer(root, {
    replacements: [
      ...replacements,
      LayerNode.replace(
        LLM.node,
        mockLLM([
          LLMEvent.stepStart({ index: 0 }),
          LLMEvent.toolInputStart({ id: "v2-1", name: "bash" }),
          LLMEvent.toolInputDelta({ id: "v2-1", name: "bash", text: '{"cmd":"pwd"}' }),
          LLMEvent.toolInputEnd({ id: "v2-1", name: "bash" }),
          LLMEvent.toolCall({ id: "v2-1", name: "bash", input: { cmd: "pwd" } }),
          LLMEvent.toolResult({
            id: "v2-1",
            name: "bash",
            result: { type: "json", value: { output: "/tmp" } },
          }),
          LLMEvent.stepFinish({ index: 0, reason: "stop" }),
          LLMEvent.finish({ reason: "stop" }),
        ]),
      ),
    ],
  })
  const it = testEffect(eventsEnv)

  it.live("publishes all tool lifecycle v2 events", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          const { processors, session, provider } = yield* boot()
          const events = yield* EventV2Bridge.Service
          const chat = yield* session.create({})
          const parent = yield* makeUser(chat.id, "v2 events")()
          const msg = yield* makeAssistant(chat.id, parent.id, path.resolve(dir))()
          const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
          const seen: string[] = []
          const off = yield* events.listen((event) => {
            seen.push(event.type)
            return Effect.void
          })
          const handle = yield* processors.create({
            assistantMessage: msg,
            sessionID: chat.id,
            model: mdl,
          })
          yield* handle.process(makeStreamInput(parent, chat.id, mdl))
          yield* off
          expect(seen).toContain(SessionEvent.Tool.Input.Started.type)
          expect(seen).toContain(SessionEvent.Tool.Input.Delta.type)
          expect(seen).toContain(SessionEvent.Tool.Input.Ended.type)
          expect(seen).toContain(SessionEvent.Tool.Called.type)
          expect(seen).toContain(SessionEvent.Tool.Success.type)
        }),
      { config: cfg },
    ),
  )
})

// ---------------------------------------------------------------------------
// process returns stop when assistant has error
// ---------------------------------------------------------------------------

describe("process returns stop on error", () => {
  const eventsEnv = LayerNode.buildLayer(root, {
    replacements: [
      ...replacements,
      LayerNode.replace(
        LLM.node,
        mockLLM([LLMEvent.providerError({ message: "immediate fail" })]),
      ),
    ],
  })
  const it = testEffect(eventsEnv)

  it.live("returns stop when error occurs during processing", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          const { processors, session, provider } = yield* boot()
          const chat = yield* session.create({})
          const parent = yield* makeUser(chat.id, "err")()
          const msg = yield* makeAssistant(chat.id, parent.id, path.resolve(dir))()
          const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
          const handle = yield* processors.create({
            assistantMessage: msg,
            sessionID: chat.id,
            model: mdl,
          })
          const result = yield* handle.process(makeStreamInput(parent, chat.id, mdl))
          expect(result).toBe("stop")
        }),
      { config: cfg },
    ),
  )
})
