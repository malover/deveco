import { describe, expect, test } from "bun:test"
import { Effect, Schema } from "effect"
import { SessionStatus, Info, Event } from "../../src/session/status"
import { SessionID } from "../../src/session/schema"
import { testEffect } from "../lib/effect"

const sessionA = SessionID.make("session-status-a")
const sessionB = SessionID.make("session-status-b")

function decodeUnknown<S extends Schema.Top>(schema: S) {
  const decode = Schema.decodeUnknownSync(schema as never)
  return (input: unknown): Schema.Schema.Type<S> => decode(input) as Schema.Schema.Type<S>
}

describe("Info schema", () => {
  const decode = decodeUnknown(Info)

  test("accepts idle variant", () => {
    expect(decode({ type: "idle" })).toEqual({ type: "idle" })
  })

  test("accepts busy variant", () => {
    expect(decode({ type: "busy" })).toEqual({ type: "busy" })
  })

  test("accepts retry variant with minimal fields", () => {
    const input = { type: "retry", attempt: 2, message: "boom", next: 1000 }
    expect(decode(input)).toEqual(input)
  })

  test("accepts retry variant with action without link", () => {
    const input = {
      type: "retry",
      attempt: 1,
      message: "rate limited",
      next: 500,
      action: {
        reason: "rate limit",
        provider: "openai",
        title: "Retry in 5s",
        message: "wait",
        label: "OK",
      },
    }
    expect(decode(input)).toEqual(input)
  })

  test("accepts retry variant with action including optional link", () => {
    const input = {
      type: "retry",
      attempt: 3,
      message: "network down",
      next: 100,
      action: {
        reason: "network",
        provider: "anthropic",
        title: "Reconnect",
        message: "reconnect now",
        label: "Retry",
        link: "https://status.example",
      },
    }
    expect(decode(input)).toEqual(input)
  })

  test("rejects unknown type variant", () => {
    expect(() => decode({ type: "unknown" })).toThrow()
  })

  test("rejects negative attempt on retry", () => {
    expect(() => decode({ type: "retry", attempt: -1, message: "x", next: 0 })).toThrow()
  })

  test("rejects negative next on retry", () => {
    expect(() => decode({ type: "retry", attempt: 0, message: "x", next: -5 })).toThrow()
  })

  test("rejects retry with missing message", () => {
    expect(() => decode({ type: "retry", attempt: 0, next: 1 })).toThrow()
  })

  test("rejects retry with missing next", () => {
    expect(() => decode({ type: "retry", attempt: 0, message: "x" })).toThrow()
  })

  test("rejects action with required field missing", () => {
    expect(() =>
      decode({
        type: "retry",
        attempt: 0,
        message: "x",
        next: 0,
        action: { reason: "r", provider: "p" },
      }),
    ).toThrow()
  })

  test("round-trips idle through encode", () => {
    const encode = Schema.encodeUnknownSync(Info as never)
    const encoded = encode({ type: "idle" } as never)
    expect(encoded).toEqual({ type: "idle" })
  })
})

describe("Event definitions", () => {
  test("Status event exposes type and data shape", () => {
    expect(Event.Status.type).toBe("session.status")
    expect(Event.Status.data).toBeDefined()
  })

  test("Idle event exposes deprecated type", () => {
    expect(Event.Idle.type).toBe("session.idle")
    expect(Event.Idle.data).toBeDefined()
  })
})

describe("SessionStatus namespace", () => {
  test("re-exports Service, layer, defaultLayer, node, Info, Event", () => {
    expect(SessionStatus.Service).toBeDefined()
    expect(SessionStatus.layer).toBeDefined()
    expect(SessionStatus.defaultLayer).toBeDefined()
    expect(SessionStatus.node).toBeDefined()
    expect(SessionStatus.Info).toBeDefined()
    expect(SessionStatus.Event).toBeDefined()
  })
})

const it = testEffect(SessionStatus.defaultLayer)

describe("SessionStatus service", () => {
  describe("get", () => {
    it.instance("returns idle for unknown session", () =>
      Effect.gen(function* () {
        const status = yield* SessionStatus.Service
        const result = yield* status.get(sessionA)
        expect(result).toEqual({ type: "idle" })
      }),
    )
  })

  describe("list", () => {
    it.instance("returns empty map on fresh state", () =>
      Effect.gen(function* () {
        const status = yield* SessionStatus.Service
        const result = yield* status.list()
        expect(result.size).toBe(0)
      }),
    )

    it.instance("returns defensive copy of internal map", () =>
      Effect.gen(function* () {
        const status = yield* SessionStatus.Service
        yield* status.set(sessionA, { type: "busy" })
        const snapshot = yield* status.list()
        snapshot.delete(sessionA)
        const after = yield* status.list()
        expect(after.size).toBe(1)
        expect(after.get(sessionA)).toEqual({ type: "busy" })
      }),
    )
  })

  describe("set", () => {
    it.instance("stores busy and surfaces via get", () =>
      Effect.gen(function* () {
        const status = yield* SessionStatus.Service
        yield* status.set(sessionA, { type: "busy" })
        expect(yield* status.get(sessionA)).toEqual({ type: "busy" })
      }),
    )

    it.instance("stores retry without action", () =>
      Effect.gen(function* () {
        const status = yield* SessionStatus.Service
        const retry = { type: "retry" as const, attempt: 1, message: "transient", next: 42 }
        yield* status.set(sessionA, retry)
        expect(yield* status.get(sessionA)).toEqual(retry)
      }),
    )

    it.instance("stores retry with action including link", () =>
      Effect.gen(function* () {
        const status = yield* SessionStatus.Service
        const retry = {
          type: "retry" as const,
          attempt: 2,
          message: "rate limited",
          next: 100,
          action: {
            reason: "rate limit",
            provider: "deveco",
            title: "Wait",
            message: "please wait",
            label: "OK",
            link: "https://status.example",
          },
        }
        yield* status.set(sessionA, retry)
        expect(yield* status.get(sessionA)).toEqual(retry)
      }),
    )

    it.instance("removes entry on idle transition from busy", () =>
      Effect.gen(function* () {
        const status = yield* SessionStatus.Service
        yield* status.set(sessionA, { type: "busy" })
        yield* status.set(sessionA, { type: "idle" })
        expect(yield* status.get(sessionA)).toEqual({ type: "idle" })
        expect((yield* status.list()).size).toBe(0)
      }),
    )

    it.instance("removes entry on idle transition from retry", () =>
      Effect.gen(function* () {
        const status = yield* SessionStatus.Service
        yield* status.set(sessionA, { type: "retry", attempt: 1, message: "x", next: 1 })
        yield* status.set(sessionA, { type: "idle" })
        expect(yield* status.get(sessionA)).toEqual({ type: "idle" })
        expect((yield* status.list()).size).toBe(0)
      }),
    )

    it.instance("idle set on unknown session is a safe no-op", () =>
      Effect.gen(function* () {
        const status = yield* SessionStatus.Service
        yield* status.set(sessionA, { type: "idle" })
        expect(yield* status.get(sessionA)).toEqual({ type: "idle" })
        expect((yield* status.list()).size).toBe(0)
      }),
    )

    it.instance("busy overwrite stays busy", () =>
      Effect.gen(function* () {
        const status = yield* SessionStatus.Service
        yield* status.set(sessionA, { type: "busy" })
        yield* status.set(sessionA, { type: "busy" })
        const list = yield* status.list()
        expect(list.size).toBe(1)
        expect(list.get(sessionA)).toEqual({ type: "busy" })
      }),
    )

    it.instance("busy to retry updates entry", () =>
      Effect.gen(function* () {
        const status = yield* SessionStatus.Service
        yield* status.set(sessionA, { type: "busy" })
        const retry = { type: "retry" as const, attempt: 3, message: "wait", next: 99 }
        yield* status.set(sessionA, retry)
        expect(yield* status.get(sessionA)).toEqual(retry)
      }),
    )

    it.instance("retry to busy updates entry", () =>
      Effect.gen(function* () {
        const status = yield* SessionStatus.Service
        yield* status.set(sessionA, { type: "retry", attempt: 1, message: "x", next: 1 })
        yield* status.set(sessionA, { type: "busy" })
        expect(yield* status.get(sessionA)).toEqual({ type: "busy" })
      }),
    )

    it.instance("different sessions track independent state", () =>
      Effect.gen(function* () {
        const status = yield* SessionStatus.Service
        yield* status.set(sessionA, { type: "busy" })
        yield* status.set(sessionB, { type: "retry", attempt: 1, message: "x", next: 1 })
        expect(yield* status.get(sessionA)).toEqual({ type: "busy" })
        expect(yield* status.get(sessionB)).toMatchObject({ type: "retry" })
        yield* status.set(sessionA, { type: "idle" })
        expect(yield* status.get(sessionA)).toEqual({ type: "idle" })
        expect(yield* status.get(sessionB)).toMatchObject({ type: "retry" })
      }),
    )
  })
})
