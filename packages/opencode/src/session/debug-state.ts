import { Database } from "@opencode-ai/core/database/database"
import { KeyedMutex } from "@opencode-ai/core/effect/keyed-mutex"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { EventV2 } from "@opencode-ai/core/event"
import { EventTable } from "@opencode-ai/core/event/sql"
import { EventV2Bridge } from "@/event-v2-bridge"
import { and, desc, eq } from "drizzle-orm"
import { Effect, Layer, Context, Option, Schema } from "effect"
import { SessionID } from "./schema"

export const Info = Schema.Struct({
  condition: Schema.String,
  agent: Schema.String,
  mode: Schema.String,
})
export type Info = typeof Info.Type

export const Event = {
  Updated: EventV2.define({
    type: "session.debug-state",
    sync: {
      version: 1,
      aggregate: "sessionID",
    },
    schema: {
      sessionID: SessionID,
      state: Schema.Literals(["set", "cleared"]),
      condition: Schema.String,
      agent: Schema.String,
      mode: Schema.optional(Schema.String),
    },
  }),
}

export interface Interface {
  readonly get: (sessionID: SessionID) => Effect.Effect<Info | undefined>
  readonly enter: (
    sessionID: SessionID,
    input: Info,
  ) => Effect.Effect<{ readonly info: Info; readonly entered: boolean }>
  readonly set: (sessionID: SessionID, input: Info) => Effect.Effect<Info>
  readonly clear: (sessionID: SessionID) => Effect.Effect<Info | undefined>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionDebugState") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const events = yield* EventV2Bridge.Service
    const { db } = yield* Database.Service
    const locks = KeyedMutex.makeUnsafe<SessionID>()
    const decode = Schema.decodeUnknownOption(Event.Updated.data)

    const read = Effect.fn("SessionDebugState.read")(function* (sessionID: SessionID) {
      const row = yield* db
        .select({ data: EventTable.data })
        .from(EventTable)
        .where(
          and(
            eq(EventTable.aggregate_id, sessionID),
            eq(EventTable.type, EventV2.versionedType(Event.Updated.type, 1)),
          ),
        )
        .orderBy(desc(EventTable.seq))
        .limit(1)
        .get()
        .pipe(Effect.orDie)
      if (!row) return undefined
      const data = decode(row.data)
      if (Option.isNone(data) || data.value.state === "cleared") return undefined
      return {
        condition: data.value.condition,
        agent: data.value.agent,
        // Debug state events created before the originating mode was recorded
        // can only fall back to the default primary mode.
        mode: data.value.mode ?? (data.value.agent === "debug" ? "build" : data.value.agent),
      }
    })

    const get = Effect.fn("SessionDebugState.get")((sessionID: SessionID) => locks.withLock(sessionID)(read(sessionID)))

    const enter = Effect.fn("SessionDebugState.enter")((sessionID: SessionID, input: Info) =>
      locks.withLock(sessionID)(
        Effect.gen(function* () {
          const existing = yield* read(sessionID)
          if (existing) return { info: existing, entered: false }
          const info = Info.make(input)
          yield* events.publish(Event.Updated, { sessionID, state: "set", ...info })
          return { info, entered: true }
        }),
      ),
    )

    const set = Effect.fn("SessionDebugState.set")((sessionID: SessionID, input: Info) =>
      locks.withLock(sessionID)(
        Effect.gen(function* () {
          const info = Info.make(input)
          yield* events.publish(Event.Updated, { sessionID, state: "set", ...info })
          return info
        }),
      ),
    )

    const clear = Effect.fn("SessionDebugState.clear")((sessionID: SessionID) =>
      locks.withLock(sessionID)(
        Effect.gen(function* () {
          const info = yield* read(sessionID)
          if (!info) return undefined
          yield* events.publish(Event.Updated, { sessionID, state: "cleared", ...info })
          return info
        }),
      ),
    )

    return Service.of({ get, enter, set, clear })
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(EventV2Bridge.defaultLayer), Layer.provide(Database.defaultLayer))

export const node = LayerNode.make(layer, [EventV2Bridge.node, Database.node])

export * as SessionDebugState from "./debug-state"
