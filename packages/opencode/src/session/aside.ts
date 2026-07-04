import { EventV2Bridge } from "@/event-v2-bridge"
import { BtwEvent } from "@/server/tui-event"
import { Session } from "@/session/session"
import { MessageV2 } from "@/session/message-v2"
import { LLM } from "@/session/llm"
import { Provider } from "@/provider/provider"
import { Agent } from "@/agent/agent"
import { Config } from "@/config/config"
import { SessionID, MessageID } from "@/session/schema"
import { Cause, Context, Effect, Layer, Stream } from "effect"
import BTW_SYSTEM_PROMPT from "./prompt/btw.txt"

export type BtwInput = {
  sessionID: SessionID
  asideID: string
  text: string
  model?: string
}

export interface Interface {
  readonly btw: (input: BtwInput) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/AsideService") {}

const TOOL_RESULT_TRUNCATE_LENGTH = 8000

const live = Layer.effect(
  Service,
  Effect.gen(function* () {
    const events = yield* EventV2Bridge.Service
    const session = yield* Session.Service
    const llm = yield* LLM.Service
    const agent = yield* Agent.Service
    const provider = yield* Provider.Service

    const btw = Effect.fn("AsideService.btw")(function* (input: BtwInput) {
      const { sessionID, asideID, text } = input

      // Read-only snapshot of session messages
      const rawMessages = yield* session.messages({ sessionID })

      yield* events.publish(BtwEvent.Start, {
        asideID,
        sessionID,
        question: text,
      })

      yield* Effect.logInfo("AsideService.btw starting", { sessionID, asideID })

      // Resolve model: use provided model string or session's current agent model
      const defaultAgentName = yield* agent.defaultAgent()
      const currentAgentName = rawMessages.findLast((m) => m.info.role === "user")?.info.agent ?? defaultAgentName
      const agentInfo = yield* agent.get(currentAgentName)

      let model: Provider.Model
      if (input.model) {
        const [providerID, modelID] = input.model.split("/")
        model = yield* provider.getModel(providerID as any, modelID as any)
      } else if (agentInfo.model) {
        model = yield* provider.getModel(agentInfo.model.providerID, agentInfo.model.modelID)
      } else {
        const defaultModel = yield* provider.defaultModel()
        model = yield* provider.getModel(defaultModel.providerID, defaultModel.modelID)
      }

      // Map to provider messages using the existing toModelMessages function
      const modelMessages = yield* Effect.promise(() =>
        MessageV2.toModelMessages(rawMessages, model, { toolOutputMaxChars: TOOL_RESULT_TRUNCATE_LENGTH }),
      )

      const stream = llm.stream({
        user: {
          id: MessageID.ascending(),
          sessionID,
          role: "user" as const,
          time: { created: Date.now() },
          agent: currentAgentName,
          model: { providerID: model.providerID, modelID: model.id },
        },
        sessionID,
        model,
        agent: agentInfo,
        system: [BTW_SYSTEM_PROMPT],
        messages: [
          ...modelMessages,
          { role: "user" as const, content: text },
        ],
        tools: {},
        toolChoice: "none",
      })

      yield* stream.pipe(
        Stream.runForEach((event) => {
          if (event.type === "text-delta") {
            return events.publish(BtwEvent.Delta, {
              asideID,
              text: event.text,
            })
          }
          return Effect.void
        }),
      )

      yield* events.publish(BtwEvent.Complete, { asideID })
    })

    return Service.of({
      btw: (input) =>
        btw(input).pipe(
          Effect.catchCause((cause) =>
            Effect.gen(function* () {
              yield* Effect.logError("AsideService error", { cause })
              yield* events.publish(BtwEvent.Error, {
                asideID: input.asideID,
                message: Cause.pretty(cause),
              })
            }),
          ),
        ),
    })
  }),
)

export const defaultLayer = live.pipe(
  Layer.provide(EventV2Bridge.defaultLayer),
  Layer.provide(Session.defaultLayer),
  Layer.provide(LLM.defaultLayer),
  Layer.provide(Agent.defaultLayer),
  Layer.provide(Config.defaultLayer),
  Layer.provide(Provider.defaultLayer),
)

export * as AsideService from "./aside"
