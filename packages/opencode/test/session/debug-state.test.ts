import { NodeFileSystem } from "@effect/platform-node"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Database } from "@opencode-ai/core/database/database"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Global } from "@opencode-ai/core/global"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ConfigV1 } from "@opencode-ai/core/v1/config/config"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { FetchHttpClient } from "effect/unstable/http"
import { expect } from "bun:test"
import { Context, Effect, Fiber, Layer } from "effect"
import path from "path"
import { Agent } from "../../src/agent/agent"
import { Auth } from "@/auth"
import { BackgroundJob } from "@/background/job"
import { Command } from "../../src/command"
import { Config } from "@/config/config"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Env } from "../../src/env"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Format } from "../../src/format"
import { Git } from "../../src/git"
import { Image } from "../../src/image/image"
import { LSP } from "@/lsp/lsp"
import { MCP } from "../../src/mcp"
import { Permission } from "../../src/permission"
import { Plugin } from "../../src/plugin"
import { Provider } from "@/provider/provider"
import { Question } from "../../src/question"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { Session } from "@/session/session"
import { SessionCompaction } from "../../src/session/compaction"
import { SessionDebugState } from "../../src/session/debug-state"
import { SessionAgentMode } from "../../src/session/agent-mode/routing"
import { ExitQueue } from "../../src/session/exit-queue"
import { Instruction } from "../../src/session/instruction"
import { LLM } from "../../src/session/llm"
import { SessionProcessor } from "../../src/session/processor"
import { SessionPrompt } from "../../src/session/prompt"
import { SessionRevert } from "../../src/session/revert"
import { SessionRunState } from "../../src/session/run-state"
import { MessageID, PartID, SessionID } from "../../src/session/schema"
import { SessionStatus } from "../../src/session/status"
import { SessionSummary } from "../../src/session/summary"
import { SystemPrompt } from "../../src/session/system"
import { Todo } from "../../src/session/todo"
import { Skill } from "../../src/skill"
import { Snapshot } from "../../src/snapshot"
import { ToolRegistry } from "@/tool/registry"
import { Truncate } from "@/tool/truncate"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { TestLLMServer } from "../lib/llm-server"

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

const mcp = Layer.succeed(
  MCP.Service,
  MCP.Service.of({
    status: () => Effect.succeed({}),
    clients: () => Effect.succeed({}),
    tools: () => Effect.succeed({}),
    prompts: () => Effect.succeed({}),
    resources: () => Effect.succeed({}),
    add: () => Effect.succeed({ status: { status: "disabled" as const } }),
    connect: () => Effect.void,
    disconnect: () => Effect.void,
    getPrompt: () => Effect.succeed(undefined),
    readResource: () => Effect.succeed(undefined),
    startAuth: () => Effect.die("unexpected MCP auth in debug-state tests"),
    authenticate: () => Effect.die("unexpected MCP auth in debug-state tests"),
    finishAuth: () => Effect.die("unexpected MCP auth in debug-state tests"),
    removeAuth: () => Effect.void,
    supportsOAuth: () => Effect.succeed(false),
    hasStoredTokens: () => Effect.succeed(false),
    getAuthStatus: () => Effect.succeed("not_authenticated" as const),
  }),
)

const lsp = Layer.succeed(
  LSP.Service,
  LSP.Service.of({
    init: () => Effect.void,
    status: () => Effect.succeed([]),
    hasClients: () => Effect.succeed(false),
    touchFile: () => Effect.void,
    diagnostics: () => Effect.succeed({}),
    hover: () => Effect.succeed(undefined),
    definition: () => Effect.succeed([]),
    references: () => Effect.succeed([]),
    implementation: () => Effect.succeed([]),
    documentSymbol: () => Effect.succeed([]),
    workspaceSymbol: () => Effect.succeed([]),
    prepareCallHierarchy: () => Effect.succeed([]),
    incomingCalls: () => Effect.succeed([]),
    outgoingCalls: () => Effect.succeed([]),
  }),
)

const status = SessionStatus.layer.pipe(Layer.provideMerge(EventV2Bridge.defaultLayer))
const agentMode = SessionAgentMode.defaultLayer
const run = SessionRunState.layer.pipe(Layer.provide(status))
const infra = Layer.mergeAll(NodeFileSystem.layer, CrossSpawnSpawner.defaultLayer)

function makePrompt() {
  const deps = Layer.mergeAll(
    Session.defaultLayer,
    Snapshot.defaultLayer,
    LLM.defaultLayer,
    Env.defaultLayer,
    Auth.defaultLayer,
    Agent.defaultLayer,
    Command.defaultLayer,
    Permission.defaultLayer,
    Plugin.defaultLayer,
    Config.defaultLayer,
    Provider.defaultLayer,
    lsp,
    mcp,
    FSUtil.defaultLayer,
    Global.defaultLayer,
    BackgroundJob.defaultLayer,
    status,
    Database.defaultLayer,
    EventV2Bridge.defaultLayer,
  ).pipe(Layer.provideMerge(infra))
  const question = Question.layer.pipe(Layer.provideMerge(deps))
  const todo = Todo.layer.pipe(Layer.provideMerge(deps))
  const registry = ToolRegistry.layer.pipe(
    Layer.provide(Skill.defaultLayer),
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(CrossSpawnSpawner.defaultLayer),
    Layer.provide(Git.defaultLayer),
    Layer.provide(Ripgrep.defaultLayer),
    Layer.provide(Format.defaultLayer),
    Layer.provide(RuntimeFlags.layer({ experimentalEventSystem: true })),
    Layer.provideMerge(agentMode),
    Layer.provideMerge(todo),
    Layer.provideMerge(question),
    Layer.provideMerge(deps),
  )
  const trunc = Truncate.layer.pipe(Layer.provideMerge(deps))
  const proc = SessionProcessor.layer.pipe(
    Layer.provide(summary),
    Layer.provide(Image.defaultLayer),
    Layer.provide(RuntimeFlags.layer({ experimentalEventSystem: true })),
    Layer.provide(ExitQueue.defaultLayer),
    Layer.provideMerge(deps),
  )
  const compact = SessionCompaction.layer.pipe(
    Layer.provide(RuntimeFlags.layer({ experimentalEventSystem: true })),
    Layer.provideMerge(proc),
    Layer.provideMerge(deps),
  )
  return SessionPrompt.layer.pipe(
    Layer.provide(SessionRevert.defaultLayer),
    Layer.provide(Image.defaultLayer),
    Layer.provide(summary),
    Layer.provideMerge(agentMode),
    Layer.provideMerge(run),
    Layer.provideMerge(compact),
    Layer.provideMerge(proc),
    Layer.provideMerge(registry),
    Layer.provideMerge(trunc),
    Layer.provide(Instruction.defaultLayer),
    Layer.provide(SystemPrompt.defaultLayer),
    Layer.provide(RuntimeFlags.layer({ experimentalEventSystem: true })),
    Layer.provideMerge(deps),
  )
}

const it = testEffect(Layer.mergeAll(TestLLMServer.layer, makePrompt()))

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

function providerCfg(url: string) {
  return {
    ...cfg,
    provider: {
      ...cfg.provider,
      test: {
        ...cfg.provider.test,
        options: {
          ...cfg.provider.test.options,
          baseURL: url,
        },
      },
    },
  }
}

const writeConfig = Effect.fn("test.writeConfig")(function* (dir: string, config: Partial<ConfigV1.Info>) {
  const fs = yield* FSUtil.Service
  yield* fs.writeWithDirs(
    path.join(dir, "deveco.json"),
    JSON.stringify({ $schema: "https://opencode.ai/config.json", ...config }),
  )
})

const useServerConfig = Effect.fn("test.useServerConfig")(function* () {
  const instance = yield* TestInstance
  const llm = yield* TestLLMServer
  yield* writeConfig(instance.directory, providerCfg(llm.url))
  return llm
})

const boot = Effect.fn("test.boot")(function* () {
  const config = yield* Config.Service
  const prompt = yield* SessionPrompt.Service
  const sessions = yield* Session.Service
  const state = yield* SessionDebugState.Service
  const registry = yield* ToolRegistry.Service
  const agents = yield* Agent.Service
  yield* config.get()
  const chat = yield* sessions.create({ title: "Pinned" })
  return { prompt, sessions, state, registry, agents, chat }
})

function debugPart(parts: SessionV1.Part[]) {
  return parts.find((part): part is SessionV1.DebugStatePart => part.type === "debug-state")
}

const enter = Effect.fn("test.enterDebug")(function* (
  prompt: SessionPrompt.Interface,
  llm: TestLLMServer["Service"],
  sessionID: SessionID,
  condition: string,
) {
  yield* llm.text("debug turn complete")
  return yield* prompt.command({ sessionID, command: "debug", arguments: condition })
})

const ask = Effect.fn("test.ask")(function* (
  prompt: SessionPrompt.Interface,
  llm: TestLLMServer["Service"],
  sessionID: SessionID,
  text: string,
) {
  yield* llm.text("turn complete")
  return yield* prompt.prompt({
    sessionID,
    agent: "build",
    model: ref,
    parts: [{ type: "text", text }],
  })
})

it.instance(
  "exposes debug_exit only to the debug agent",
  () =>
    Effect.gen(function* () {
      yield* useServerConfig()
      const { registry, agents } = yield* boot()
      const build = yield* agents.get("build")
      const debug = yield* agents.get("debug")
      if (!build || !debug) throw new Error("expected native build and debug agents")

      const buildTools = yield* registry.tools({ ...ref, agent: build })
      const debugTools = yield* registry.tools({ ...ref, agent: debug })
      expect(buildTools.some((tool) => tool.id === "debug_exit")).toBe(false)
      expect(debugTools.some((tool) => tool.id === "debug_exit")).toBe(true)
    }),
  30_000,
)

it.instance(
  "uses a high-confidence natural-language exit without another provider turn",
  () =>
    Effect.gen(function* () {
      const llm = yield* useServerConfig()
      const { prompt, state, chat } = yield* boot()

      yield* enter(prompt, llm, chat.id, "fix login crash")
      const result = yield* prompt.prompt({
        sessionID: chat.id,
        agent: "build",
        model: ref,
        parts: [{ type: "text", text: "请退出 debug 模式。" }],
      })

      expect(result.info.role).toBe("user")
      expect(result.info.agent).toBe("build")
      expect(debugPart(result.parts)?.state).toBe("cleared")
      expect(yield* state.get(chat.id)).toBeUndefined()
      expect(yield* llm.calls).toBe(1)
    }),
  30_000,
)

it.instance(
  "does not fast-exit for negated or implementation-related mentions",
  () =>
    Effect.gen(function* () {
      const llm = yield* useServerConfig()
      const { prompt, state, chat } = yield* boot()

      yield* enter(prompt, llm, chat.id, "fix login crash")
      const negated = yield* ask(prompt, llm, chat.id, "不要退出debug模式")
      expect(negated.info.role).toBe("assistant")
      expect(negated.info.agent).toBe("debug")
      expect(yield* state.get(chat.id)).toBeDefined()

      const implementation = yield* ask(prompt, llm, chat.id, "如何实现退出debug模式按钮")
      expect(implementation.info.role).toBe("assistant")
      expect(implementation.info.agent).toBe("debug")
      expect(yield* state.get(chat.id)).toBeDefined()
      expect(yield* llm.calls).toBe(3)
    }),
  30_000,
)

it.instance(
  "lets the debug agent semantically exit through debug_exit",
  () =>
    Effect.gen(function* () {
      const llm = yield* useServerConfig()
      const { prompt, sessions, state, chat } = yield* boot()

      yield* enter(prompt, llm, chat.id, "fix login crash")
      yield* llm.tool("debug_exit", {})
      yield* llm.text("已退出 debug 模式。")
      const result = yield* prompt.prompt({
        sessionID: chat.id,
        agent: "build",
        model: ref,
        parts: [{ type: "text", text: "先别查了，回到普通模式吧" }],
      })

      expect(result.info.role).toBe("assistant")
      expect(yield* state.get(chat.id)).toBeUndefined()
      expect(yield* llm.calls).toBe(3)
      const parts = (yield* sessions.messages({ sessionID: chat.id })).flatMap((message) => message.parts)
      expect(
        parts.some((part) => part.type === "tool" && part.tool === "debug_exit" && part.state.status === "completed"),
      ).toBe(true)
      expect(parts.some((part) => part.type === "debug-state" && part.state === "cleared" && !part.command)).toBe(true)

      const next = yield* ask(prompt, llm, chat.id, "continue normally")
      expect(next.info.role).toBe("assistant")
      expect(next.info.agent).toBe("build")
    }),
  30_000,
)

it.instance(
  "debug_exit ignores an exit request when a newer user message exists",
  () =>
    Effect.gen(function* () {
      const llm = yield* useServerConfig()
      const { prompt, sessions, state, registry, agents, chat } = yield* boot()

      yield* enter(prompt, llm, chat.id, "fix login crash")
      const snapshot = yield* sessions.messages({ sessionID: chat.id })
      const assistant = snapshot.findLast((message) => message.info.role === "assistant")
      const debug = yield* agents.get("debug")
      if (!assistant || assistant.info.role !== "assistant" || !debug) throw new Error("expected debug turn")

      const newer = yield* sessions.updateMessage({
        id: MessageID.ascending(),
        sessionID: chat.id,
        role: "user",
        time: { created: Date.now() },
        agent: "debug",
        model: ref,
      } satisfies SessionV1.User)
      yield* sessions.updatePart({
        id: PartID.ascending(),
        messageID: newer.id,
        sessionID: chat.id,
        type: "text",
        text: "继续调试",
      } satisfies SessionV1.TextPart)

      const tool = (yield* registry.tools({ ...ref, agent: debug })).find((item) => item.id === "debug_exit")
      if (!tool) throw new Error("expected debug_exit tool")
      const output = yield* tool.execute(
        {},
        {
          sessionID: chat.id,
          messageID: assistant.info.id,
          agent: "debug",
          abort: new AbortController().signal,
          messages: snapshot,
          metadata: () => Effect.void,
          ask: () => Effect.void,
        },
      )

      expect(output.title).toBe("Debug exit deferred")
      expect(yield* state.get(chat.id)).toBeDefined()
    }),
  30_000,
)

it.instance(
  "a high-confidence semantic exit cancels a busy debug run",
  () =>
    Effect.gen(function* () {
      const llm = yield* useServerConfig()
      const { prompt, state, chat } = yield* boot()
      const sessionStatus = yield* SessionStatus.Service

      yield* llm.hang
      yield* state.set(chat.id, {
        condition: "fix login crash",
        agent: "debug",
        mode: "build",
      })
      const running = yield* prompt
        .prompt({
          sessionID: chat.id,
          agent: "build",
          model: ref,
          parts: [{ type: "text", text: "keep investigating" }],
        })
        .pipe(Effect.forkChild)
      yield* llm.wait(1)

      const result = yield* prompt.prompt({
        sessionID: chat.id,
        agent: "build",
        model: ref,
        parts: [{ type: "text", text: "退出debug模式" }],
      })
      expect(result.info.role).toBe("user")
      expect(debugPart(result.parts)?.state).toBe("cleared")
      expect(yield* state.get(chat.id)).toBeUndefined()

      const exit = yield* Fiber.await(running).pipe(Effect.timeout("1 second"))
      expect(exit._tag).toBe("Success")
      expect(yield* sessionStatus.get(chat.id)).toEqual({ type: "idle" })
      expect(yield* llm.calls).toBe(1)
    }),
  30_000,
)

it.instance(
  "keeps debug sticky across ordinary prompts and only runs one provider turn each time",
  () =>
    Effect.gen(function* () {
      const llm = yield* useServerConfig()
      const { prompt, sessions, state, chat } = yield* boot()

      const first = yield* enter(prompt, llm, chat.id, "app crashes on login")
      expect(first.info.role).toBe("assistant")
      if (first.info.role !== "assistant") throw new Error("expected assistant response")
      expect(first.info.agent).toBe("debug")
      expect(first.info.mode).toBe("build")
      expect(yield* llm.calls).toBe(1)

      const active = yield* state.get(chat.id)
      expect(active?.condition).toBe("app crashes on login")
      expect(active?.agent).toBe("debug")
      expect(active?.mode).toBe("build")

      const second = yield* ask(prompt, llm, chat.id, "the crash still happens")
      expect(second.info.role).toBe("assistant")
      if (second.info.role !== "assistant") throw new Error("expected assistant response")
      expect(second.info.agent).toBe("debug")
      expect(second.info.mode).toBe("build")
      expect(yield* llm.calls).toBe(2)
      expect(yield* state.get(chat.id)).toEqual(active)

      const messages = yield* sessions.messages({ sessionID: chat.id })
      const ordinary = messages.find(
        (message) =>
          message.info.role === "user" &&
          message.parts.some((part) => part.type === "text" && part.text === "the crash still happens"),
      )
      expect(ordinary?.info.agent).toBe("debug")

      yield* llm.text("review complete")
      const command = yield* prompt.command({ sessionID: chat.id, command: "review", arguments: "" })
      expect(command.info.role).toBe("assistant")
      if (command.info.role !== "assistant") throw new Error("expected assistant response")
      expect(command.info.agent).toBe("debug")
      expect(command.info.mode).toBe("build")
    }),
  30_000,
)

it.instance(
  "shows the primary plan mode while the debug agent executes",
  () =>
    Effect.gen(function* () {
      const llm = yield* useServerConfig()
      const { prompt, state, chat } = yield* boot()

      yield* llm.text("debug turn complete")
      const first = yield* prompt.command({
        sessionID: chat.id,
        command: "debug",
        arguments: "app crashes on login",
        agent: "plan",
      })
      expect(first.info.role).toBe("assistant")
      if (first.info.role !== "assistant") throw new Error("expected assistant response")
      expect(first.info.agent).toBe("debug")
      expect(first.info.mode).toBe("plan")
      expect((yield* state.get(chat.id))?.mode).toBe("plan")

      yield* llm.text("turn complete")
      const second = yield* prompt.prompt({
        sessionID: chat.id,
        agent: "build",
        model: ref,
        parts: [{ type: "text", text: "keep investigating" }],
      })
      expect(second.info.role).toBe("assistant")
      if (second.info.role !== "assistant") throw new Error("expected assistant response")
      expect(second.info.agent).toBe("debug")
      expect(second.info.mode).toBe("plan")
    }),
  30_000,
)

it.instance(
  "restores debug state from durable events when the state service is rebuilt",
  () =>
    Effect.gen(function* () {
      const { state, chat } = yield* boot()
      yield* state.set(chat.id, {
        condition: "fix login crash",
        agent: "debug",
        mode: "plan",
      })

      const fresh = Context.get(
        yield* Layer.build(
          Layer.fresh(
            SessionDebugState.layer.pipe(
              Layer.provide(Layer.succeed(Database.Service, yield* Database.Service)),
              Layer.provide(Layer.succeed(EventV2Bridge.Service, yield* EventV2Bridge.Service)),
            ),
          ),
        ),
        SessionDebugState.Service,
      )
      expect(yield* fresh.get(chat.id)).toEqual({
        condition: "fix login crash",
        agent: "debug",
        mode: "plan",
      })

      yield* fresh.clear(chat.id)
      expect(yield* state.get(chat.id)).toBeUndefined()
    }),
  30_000,
)

it.instance(
  "keeps legacy debug state active when its event has no originating mode",
  () =>
    Effect.gen(function* () {
      const { state, chat } = yield* boot()
      const events = yield* EventV2Bridge.Service
      yield* events.publish(SessionDebugState.Event.Updated, {
        sessionID: chat.id,
        state: "set",
        condition: "fix login crash",
        agent: "debug",
      })

      expect(yield* state.get(chat.id)).toEqual({
        condition: "fix login crash",
        agent: "debug",
        mode: "build",
      })
    }),
  30_000,
)

it.instance(
  "uses bare /debug to enter when inactive and to report status when active",
  () =>
    Effect.gen(function* () {
      const llm = yield* useServerConfig()
      const { prompt, state, chat } = yield* boot()

      const entered = yield* enter(prompt, llm, chat.id, "   ")
      expect(entered.info.role).toBe("assistant")
      expect(entered.info.agent).toBe("debug")
      expect((yield* state.get(chat.id))?.condition).toBe("")
      expect(yield* llm.calls).toBe(1)

      const reported = yield* prompt.command({ sessionID: chat.id, command: "debug", arguments: "" })
      expect(reported.info.role).toBe("user")
      expect(debugPart(reported.parts)?.state).toBe("status")
      expect((yield* state.get(chat.id))?.condition).toBe("")
      expect(yield* llm.calls).toBe(1)

      const explicit = yield* prompt.command({ sessionID: chat.id, command: "debug", arguments: " status " })
      expect(debugPart(explicit.parts)?.state).toBe("status")
      expect(yield* state.get(chat.id)).toBeDefined()
      expect(yield* llm.calls).toBe(1)
    }),
  30_000,
)

it.instance(
  "clears only the exact trim-and-lowercase clear subcommand",
  () =>
    Effect.gen(function* () {
      const llm = yield* useServerConfig()
      const { prompt, state, chat } = yield* boot()

      yield* enter(prompt, llm, chat.id, "fix login crash")
      yield* enter(prompt, llm, chat.id, "stop")
      expect((yield* state.get(chat.id))?.condition).toBe("stop")
      yield* enter(prompt, llm, chat.id, "cancel")
      expect((yield* state.get(chat.id))?.condition).toBe("cancel")
      yield* enter(prompt, llm, chat.id, "clear now")
      expect((yield* state.get(chat.id))?.condition).toBe("clear now")
      expect(yield* llm.calls).toBe(4)

      const cleared = yield* prompt.command({ sessionID: chat.id, command: "debug", arguments: "  ClEaR  " })
      expect(debugPart(cleared.parts)?.state).toBe("cleared")
      expect(debugPart(cleared.parts)?.condition).toBe("clear now")
      expect(yield* state.get(chat.id)).toBeUndefined()
      expect(yield* llm.calls).toBe(4)
    }),
  30_000,
)

it.instance(
  "routes ordinary prompts back to the requested build agent after clear",
  () =>
    Effect.gen(function* () {
      const llm = yield* useServerConfig()
      const { prompt, state, chat } = yield* boot()

      yield* enter(prompt, llm, chat.id, "fix login crash")
      yield* prompt.command({ sessionID: chat.id, command: "debug", arguments: "clear" })
      expect(yield* state.get(chat.id)).toBeUndefined()

      const result = yield* ask(prompt, llm, chat.id, "build the project")
      expect(result.info.role).toBe("assistant")
      expect(result.info.agent).toBe("build")
      expect(yield* llm.calls).toBe(2)
    }),
  30_000,
)

it.instance(
  "keeps debug active when the current provider turn is cancelled",
  () =>
    Effect.gen(function* () {
      const llm = yield* useServerConfig()
      const { prompt, state, chat } = yield* boot()

      yield* llm.hang
      yield* state.set(chat.id, {
        condition: "fix login crash",
        agent: "debug",
        mode: "build",
      })
      const fiber = yield* prompt
        .prompt({
          sessionID: chat.id,
          agent: "build",
          model: ref,
          parts: [{ type: "text", text: "keep investigating" }],
        })
        .pipe(Effect.forkChild)
      yield* llm.wait(1)

      yield* prompt.cancel(chat.id)
      yield* Fiber.await(fiber)

      expect((yield* state.get(chat.id))?.condition).toBe("fix login crash")
      expect(yield* llm.calls).toBe(1)
    }),
  30_000,
)

it.instance(
  "/debug clear exits debug mode and cancels its busy run",
  () =>
    Effect.gen(function* () {
      const llm = yield* useServerConfig()
      const { prompt, state, chat } = yield* boot()
      const sessionStatus = yield* SessionStatus.Service

      yield* llm.hang
      yield* state.set(chat.id, {
        condition: "fix login crash",
        agent: "debug",
        mode: "build",
      })
      const fiber = yield* prompt
        .prompt({
          sessionID: chat.id,
          agent: "build",
          model: ref,
          parts: [{ type: "text", text: "keep investigating" }],
        })
        .pipe(Effect.forkChild)
      yield* llm.wait(1)

      const result = yield* prompt.command({ sessionID: chat.id, command: "debug", arguments: "clear" })
      expect(result.info.role).toBe("user")
      expect(debugPart(result.parts)?.state).toBe("cleared")
      expect(yield* state.get(chat.id)).toBeUndefined()

      const exit = yield* Fiber.await(fiber).pipe(Effect.timeout("1 second"))
      expect(exit._tag).toBe("Success")
      expect(yield* sessionStatus.get(chat.id)).toEqual({ type: "idle" })
      expect(yield* llm.calls).toBe(1)
    }),
  30_000,
)

it.instance(
  "/debug clear does not cancel a non-debug run",
  () =>
    Effect.gen(function* () {
      const llm = yield* useServerConfig()
      const { prompt, state, chat } = yield* boot()

      yield* llm.hang
      const fiber = yield* prompt
        .prompt({
          sessionID: chat.id,
          agent: "build",
          model: ref,
          parts: [{ type: "text", text: "build the project" }],
        })
        .pipe(Effect.forkChild)
      yield* llm.wait(1)

      yield* prompt.command({ sessionID: chat.id, command: "debug", arguments: "clear" })
      expect(yield* state.get(chat.id)).toBeUndefined()
      expect((yield* Fiber.await(fiber).pipe(Effect.timeoutOption("50 millis")))._tag).toBe("None")

      yield* prompt.cancel(chat.id)
      yield* Fiber.await(fiber)
    }),
  30_000,
)

it.instance(
  "a later /debug clear wins while the entering debug turn is still running",
  () =>
    Effect.gen(function* () {
      const llm = yield* useServerConfig()
      const { prompt, state, chat } = yield* boot()

      yield* llm.hang
      const entering = yield* prompt
        .command({ sessionID: chat.id, command: "debug", arguments: "fix login crash" })
        .pipe(Effect.forkChild)
      yield* llm.wait(1)
      expect((yield* state.get(chat.id))?.condition).toBe("fix login crash")

      yield* prompt.command({ sessionID: chat.id, command: "debug", arguments: "clear" })
      expect(yield* state.get(chat.id)).toBeUndefined()

      const exit = yield* Fiber.await(entering).pipe(Effect.timeout("1 second"))
      expect(exit._tag).toBe("Success")
      expect(yield* state.get(chat.id)).toBeUndefined()
    }),
  30_000,
)
