import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Effect, Schema } from "effect"
import { SessionDebugState } from "@/session/debug-state"
import { Session } from "@/session/session"
import { PartID } from "@/session/schema"
import { define, type Context } from "./tool"
import DESCRIPTION from "./debug-exit.txt"

const Parameters = Schema.Struct({})

export const DebugExitTool = define(
  "debug_exit",
  Effect.gen(function* () {
    const debugState = yield* SessionDebugState.Service
    const session = yield* Session.Service

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (_params: {}, ctx: Context) =>
        Effect.gen(function* () {
          if (ctx.agent !== "debug") {
            return {
              title: "Debug mode unchanged",
              output: "This tool is only available to the debug agent. Debug mode was not changed.",
              metadata: {},
            }
          }

          const requestedBy = ctx.messages.findLast((message) => message.info.role === "user")
          const latest = (yield* session.messages({ sessionID: ctx.sessionID }).pipe(Effect.orDie)).findLast(
            (message) => message.info.role === "user",
          )
          if (!requestedBy || latest?.info.id !== requestedBy.info.id) {
            return {
              title: "Debug exit deferred",
              output:
                "A newer user message arrived after this exit request. Debug mode was not changed. Re-evaluate the latest user message before calling this tool again.",
              metadata: {},
            }
          }

          const info = yield* debugState.clear(ctx.sessionID)
          if (!info) {
            return {
              title: "Debug mode already inactive",
              output: "Debug mode is already inactive. Reply with a brief confirmation only.",
              metadata: {},
            }
          }

          yield* session.updatePart({
            id: PartID.ascending(),
            messageID: ctx.messageID,
            sessionID: ctx.sessionID,
            type: "debug-state",
            state: "cleared",
            condition: info.condition,
          } satisfies SessionV1.DebugStatePart)

          return {
            title: "Exited debug mode",
            output:
              "Debug mode exited. Do not continue debugging or call more tools in this turn. Reply with a brief confirmation only.",
            metadata: {},
          }
        }),
    }
  }),
)
