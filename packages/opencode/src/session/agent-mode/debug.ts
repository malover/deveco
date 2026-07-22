import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { SessionTable } from "@opencode-ai/core/session/sql"
import { Agent } from "@/agent/agent"
import { Command } from "@/command"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Provider } from "@/provider/provider"
import { SessionDebugState } from "@/session/debug-state"
import { SessionRunState } from "@/session/run-state"
import { SessionStatus } from "@/session/status"
import { Session } from "@/session/session"
import { MessageID, PartID, SessionID } from "@/session/schema"
import type { CommandInput } from "@/session/prompt"
import type { PromptInput } from "@/session/prompt"
import { eq } from "drizzle-orm"
import { Context, Effect, Layer, Option } from "effect"
import type { DebugCommandResult, DebugMarkerState } from "./types"

const directDebugExit = [
  /^(?:请|麻烦)?(?:帮我)?(?:现在|立即|直接)?(?:退出|关闭|结束|取消|停止)(?:一下)?\s*(?:debug|调试)(?:\s*模式)?(?:吧|了)?$/i,
  /^(?:please\s+)?(?:exit|leave|quit|close|disable|stop|turn off)\s+(?:the\s+)?debug(?:ging)?(?:\s+mode)?(?:\s+please)?$/i,
]

export function isDirectDebugExit(input: PromptInput) {
  if (input.parts.length !== 1) return false
  const part = input.parts[0]
  if (!part || part.type !== "text" || part.synthetic || part.ignored) return false
  const text = part.text
    .normalize("NFKC")
    .trim()
    .replace(/[。.!！?？]+$/u, "")
    .replace(/\s+/g, " ")
  return directDebugExit.some((pattern) => pattern.test(text))
}

export interface Interface {
  readonly writeMarker: (input: {
    sessionID: SessionID
    messageID: MessageID
    state: DebugMarkerState
    condition: string
    command?: string
  }) => Effect.Effect<SessionV1.DebugStatePart>
  readonly finalizeDebugEnter: (input: {
    sessionID: SessionID
    messageID: MessageID
    condition: string
  }) => Effect.Effect<SessionV1.DebugStatePart>
  readonly appendSemanticExitMarker: (input: {
    sessionID: SessionID
    messageID: MessageID
    info: SessionDebugState.Info
  }) => Effect.Effect<SessionV1.DebugStatePart>
  readonly handleDebugCommand: (input: CommandInput) => Effect.Effect<DebugCommandResult | undefined>
  readonly resolveCommandAgent: (input: CommandInput) => Effect.Effect<string | undefined>
  readonly clearForSemanticExit: (sessionID: SessionID) => Effect.Effect<SessionDebugState.Info | undefined>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionAgentModeDebug") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const debugState = yield* SessionDebugState.Service
    const sessions = yield* Session.Service
    const agents = yield* Agent.Service
    const provider = yield* Provider.Service
    const status = yield* SessionStatus.Service
    const runState = yield* SessionRunState.Service
    const events = yield* EventV2Bridge.Service
    const { db } = yield* Database.Service

    const currentModel = Effect.fnUntraced(function* (sessionID: SessionID) {
      const current = yield* db
        .select({ model: SessionTable.model })
        .from(SessionTable)
        .where(eq(SessionTable.id, sessionID))
        .get()
        .pipe(Effect.orDie)
      if (current?.model) {
        return {
          providerID: ProviderV2.ID.make(current.model.providerID),
          modelID: ModelV2.ID.make(current.model.id),
          ...(current.model.variant && current.model.variant !== "default" ? { variant: current.model.variant } : {}),
        }
      }
      const match = yield* sessions
        .findMessage(sessionID, (m) => m.info.role === "user" && !!m.info.model)
        .pipe(Effect.orDie)
      if (Option.isSome(match) && match.value.info.role === "user") return match.value.info.model
      return yield* provider.defaultModel().pipe(Effect.orDie)
    })

    const lastAssistant = Effect.fnUntraced(function* (sessionID: SessionID) {
      const match = yield* sessions.findMessage(sessionID, (m) => m.info.role !== "user").pipe(Effect.orDie)
      if (Option.isSome(match)) return match.value
      const msgs = yield* sessions.messages({ sessionID, limit: 1 }).pipe(Effect.orDie)
      const last = msgs[0]
      if (last) return last
      throw new Error("Impossible")
    })

    const writeMarker = Effect.fn("SessionAgentModeDebug.writeMarker")(function* (input: {
      sessionID: SessionID
      messageID: MessageID
      state: DebugMarkerState
      condition: string
      command?: string
    }) {
      return yield* sessions.updatePart({
        id: PartID.ascending(),
        messageID: input.messageID,
        sessionID: input.sessionID,
        type: "debug-state",
        state: input.state,
        condition: input.condition,
        ...(input.command !== undefined ? { command: input.command } : {}),
      } satisfies SessionV1.DebugStatePart)
    })

    const finalizeDebugEnter = Effect.fn("SessionAgentModeDebug.finalizeDebugEnter")(function* (input: {
      sessionID: SessionID
      messageID: MessageID
      condition: string
    }) {
      return yield* writeMarker({
        sessionID: input.sessionID,
        messageID: input.messageID,
        state: "set",
        condition: input.condition,
        command: `/debug${input.condition ? ` ${input.condition}` : ""}`,
      })
    })

    const appendSemanticExitMarker = Effect.fn("SessionAgentModeDebug.appendSemanticExitMarker")(function* (input: {
      sessionID: SessionID
      messageID: MessageID
      info: SessionDebugState.Info
    }) {
      return yield* writeMarker({
        sessionID: input.sessionID,
        messageID: input.messageID,
        state: "cleared",
        condition: input.info.condition,
      })
    })

    const echoTranscriptMarker = Effect.fn("SessionAgentModeDebug.echoTranscriptMarker")(function* (input: {
      command: CommandInput
      info: SessionDebugState.Info | undefined
      state: "cleared" | "status" | "none"
    }) {
      const current = yield* status.get(input.command.sessionID)
      // A marker user message written mid-run would keep the run loop from
      // exiting, so transcript echoes are persisted only while idle. State
      // events still reach the UI immediately.
      if (current.type !== "idle") return yield* lastAssistant(input.command.sessionID)
      const model = yield* currentModel(input.command.sessionID)
      const marker: SessionV1.User = {
        id: input.command.messageID ?? MessageID.ascending(),
        sessionID: input.command.sessionID,
        role: "user",
        time: { created: Date.now() },
        agent: input.info?.mode ?? input.command.agent ?? (yield* agents.defaultInfo()).name,
        model: { providerID: model.providerID, modelID: model.modelID },
      }
      yield* sessions.updateMessage(marker)
      const part = yield* writeMarker({
        sessionID: input.command.sessionID,
        messageID: marker.id,
        state: input.state,
        condition: input.info?.condition ?? "",
        command: `/debug${input.command.arguments.trim() ? ` ${input.command.arguments.trim()}` : ""}`,
      })
      yield* events.publish(Command.Event.Executed, {
        name: input.command.command,
        sessionID: input.command.sessionID,
        arguments: input.command.arguments,
        messageID: marker.id,
      })
      return { info: marker, parts: [part] } satisfies SessionV1.WithParts
    })

    const handleDebugCommand = Effect.fn("SessionAgentModeDebug.handleDebugCommand")(function* (input: CommandInput) {
      const condition = input.arguments.trim()
      const sub = condition.toLowerCase()
      if (sub === "clear") {
        const info = yield* debugState.clear(input.sessionID)
        if (info) yield* runState.cancel(input.sessionID)
        return {
          type: "echo" as const,
          result: yield* echoTranscriptMarker({
            command: input,
            info,
            state: info ? "cleared" : "none",
          }),
        }
      }
      if (sub === "status") {
        const info = yield* debugState.get(input.sessionID)
        return {
          type: "echo" as const,
          result: yield* echoTranscriptMarker({
            command: input,
            info,
            state: info ? "status" : "none",
          }),
        }
      }
      const mode =
        input.agent ?? (yield* debugState.get(input.sessionID))?.mode ?? (yield* agents.defaultInfo()).name
      const agent = Command.Default.DEBUG
      if (sub !== "") {
        yield* debugState.set(input.sessionID, { condition, agent, mode })
        return { type: "enter" as const, condition }
      }
      const entered = yield* debugState.enter(input.sessionID, { condition, agent, mode })
      if (entered.entered) return { type: "enter" as const, condition }
      return {
        type: "echo" as const,
        result: yield* echoTranscriptMarker({
          command: input,
          info: entered.info,
          state: "status",
        }),
      }
    })

    const resolveCommandAgent = Effect.fn("SessionAgentModeDebug.resolveCommandAgent")(function* (input: CommandInput) {
      const active = yield* debugState.get(input.sessionID)
      return active?.agent ?? input.agent
    })

    const clearForSemanticExit = Effect.fn("SessionAgentModeDebug.clearForSemanticExit")((sessionID: SessionID) =>
      debugState.clear(sessionID),
    )

    return Service.of({
      writeMarker,
      finalizeDebugEnter,
      appendSemanticExitMarker,
      handleDebugCommand,
      resolveCommandAgent,
      clearForSemanticExit,
    })
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(SessionDebugState.defaultLayer),
  Layer.provide(Session.defaultLayer),
  Layer.provide(Agent.defaultLayer),
  Layer.provide(Provider.defaultLayer),
  Layer.provide(SessionStatus.defaultLayer),
  Layer.provide(SessionRunState.defaultLayer),
  Layer.provide(EventV2Bridge.defaultLayer),
  Layer.provide(Database.defaultLayer),
)

export const node = LayerNode.make(layer, [
  SessionDebugState.node,
  Session.node,
  Agent.node,
  Provider.node,
  SessionStatus.node,
  SessionRunState.node,
  EventV2Bridge.node,
  Database.node,
])

export * as SessionAgentModeDebug from "./debug"
