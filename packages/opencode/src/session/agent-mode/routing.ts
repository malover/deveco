import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionDebugState } from "@/session/debug-state"
import type { PromptInput } from "@/session/prompt"
import { SessionID } from "@/session/schema"
import { Context, Effect, Layer } from "effect"
import {
  isDirectDebugExit,
  Service as DebugOrchestrationService,
  defaultLayer as debugDefaultLayer,
  node as debugNode,
  type Interface as DebugOrchestration,
} from "./debug"
import type { PromptRouteResult } from "./types"

export interface Interface {
  readonly routePrompt: (input: PromptInput) => Effect.Effect<PromptRouteResult<PromptInput>>
  readonly resolveAssistantDisplayMode: (sessionID: SessionID, agentName: string) => Effect.Effect<string>
  readonly handleDebugCommand: DebugOrchestration["handleDebugCommand"]
  readonly resolveCommandAgent: DebugOrchestration["resolveCommandAgent"]
  readonly finalizeDebugEnter: DebugOrchestration["finalizeDebugEnter"]
  readonly appendSemanticExitMarker: DebugOrchestration["appendSemanticExitMarker"]
  readonly clearForSemanticExit: DebugOrchestration["clearForSemanticExit"]
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionAgentMode") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const debugState = yield* SessionDebugState.Service
    const debug = yield* DebugOrchestrationService

    const routePrompt = Effect.fn("SessionAgentMode.routePrompt")(function* (input: PromptInput) {
      const active = yield* debugState.get(input.sessionID)
      if (!active) return { type: "continue" as const, input }
      if (!isDirectDebugExit(input)) return { type: "continue" as const, input: { ...input, agent: active.agent } }

      const info = yield* debug.clearForSemanticExit(input.sessionID)
      if (!info) return { type: "continue" as const, input }
      return { type: "semantic-exit" as const, input, info }
    })

    const resolveAssistantDisplayMode = Effect.fn("SessionAgentMode.resolveAssistantDisplayMode")(
      function* (sessionID: SessionID, agentName: string) {
        const active = yield* debugState.get(sessionID)
        return active?.mode ?? agentName
      },
    )

    return Service.of({
      routePrompt,
      resolveAssistantDisplayMode,
      handleDebugCommand: debug.handleDebugCommand,
      resolveCommandAgent: debug.resolveCommandAgent,
      finalizeDebugEnter: debug.finalizeDebugEnter,
      appendSemanticExitMarker: debug.appendSemanticExitMarker,
      clearForSemanticExit: debug.clearForSemanticExit,
    })
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(debugDefaultLayer),
  Layer.provideMerge(SessionDebugState.defaultLayer),
)

export const node = LayerNode.make(layer, [debugNode, SessionDebugState.node])

export * as SessionAgentMode from "./routing"
