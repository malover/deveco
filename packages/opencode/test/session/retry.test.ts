import { describe, expect, test } from "bun:test"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import type { NamedError } from "@opencode-ai/core/util/error"
import { APICallError } from "ai"
import { setTimeout as sleep } from "node:timers/promises"
import { Duration, Effect, Exit, Layer, Schedule, Schema } from "effect"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { SessionRetry } from "../../src/session/retry"
import { MessageV2 } from "../../src/session/message-v2"
import { ProviderError } from "../../src/provider/error"
import { SessionID } from "../../src/session/schema"
import { SessionStatus } from "../../src/session/status"
import { testEffect } from "../lib/effect"
import { provideTmpdirInstance } from "../fixture/fixture"
import { ProviderV2 } from "@opencode-ai/core/provider"

const providerID = ProviderV2.ID.make("test")
const retryProvider = "test"
const it = testEffect(Layer.mergeAll(SessionStatus.defaultLayer, CrossSpawnSpawner.defaultLayer))

function apiError(headers?: Record<string, string>): SessionV1.APIError {
  return Schema.decodeUnknownSync(SessionV1.APIError.Schema)(
    new SessionV1.APIError({
      message: "boom",
      isRetryable: true,
      responseHeaders: headers,
    }).toObject(),
  )
}

function wrap(message: unknown): ReturnType<NamedError["toObject"]> {
  return { name: "", data: { message } }
}

describe("session.retry.delay", () => {
  test("caps delay at 30 seconds when headers missing", () => {
    const error = apiError()
    const delays = Array.from({ length: 10 }, (_, index) => SessionRetry.delay(index + 1, error))
    expect(delays).toStrictEqual([2000, 4000, 8000, 16000, 30000, 30000, 30000, 30000, 30000, 30000])
  })

  test("prefers retry-after-ms when shorter than exponential", () => {
    const error = apiError({ "retry-after-ms": "1500" })
    expect(SessionRetry.delay(4, error)).toBe(1500)
  })

  test("uses retry-after seconds when reasonable", () => {
    const error = apiError({ "retry-after": "30" })
    expect(SessionRetry.delay(3, error)).toBe(30000)
  })

  test("accepts http-date retry-after values", () => {
    const date = new Date(Date.now() + 20000).toUTCString()
    const error = apiError({ "retry-after": date })
    const d = SessionRetry.delay(1, error)
    expect(d).toBeGreaterThanOrEqual(19000)
    expect(d).toBeLessThanOrEqual(20000)
  })

  test("ignores invalid retry hints", () => {
    const error = apiError({ "retry-after": "not-a-number" })
    expect(SessionRetry.delay(1, error)).toBe(2000)
  })

  test("ignores malformed date retry hints", () => {
    const error = apiError({ "retry-after": "Invalid Date String" })
    expect(SessionRetry.delay(1, error)).toBe(2000)
  })

  test("ignores past date retry hints", () => {
    const pastDate = new Date(Date.now() - 5000).toUTCString()
    const error = apiError({ "retry-after": pastDate })
    expect(SessionRetry.delay(1, error)).toBe(2000)
  })

  test("uses retry-after values even when exceeding 10 minutes with headers", () => {
    const error = apiError({ "retry-after": "50" })
    expect(SessionRetry.delay(1, error)).toBe(50000)

    const longError = apiError({ "retry-after-ms": "700000" })
    expect(SessionRetry.delay(1, longError)).toBe(700000)
  })

  test("caps oversized header delays to the runtime timer limit", () => {
    const error = apiError({ "retry-after-ms": "999999999999" })
    expect(SessionRetry.delay(1, error)).toBe(SessionRetry.RETRY_MAX_DELAY)
  })

  it.instance("policy updates retry status and increments attempts", () =>
    Effect.gen(function* () {
      const sessionID = SessionID.make("session-retry-test")
      const error = apiError({ "retry-after-ms": "0" })
      const status = yield* SessionStatus.Service

      const step = yield* Schedule.toStepWithMetadata(
        SessionRetry.policy({
          provider: "test",
          parse: Schema.decodeUnknownSync(SessionV1.APIError.Schema),
          set: (info) =>
            status.set(sessionID, {
              type: "retry",
              attempt: info.attempt,
              message: info.message,
              next: info.next,
            }),
        }),
      )
      yield* step(error)
      yield* step(error)

      expect(yield* status.get(sessionID)).toMatchObject({
        type: "retry",
        attempt: 2,
        message: "boom",
      })
    }),
  )

it.live("policy gives each error category its own retry budget (QueueError → 403)", () =>
    provideTmpdirInstance(() =>
      Effect.gen(function* () {
        const sessionID = SessionID.make("session-retry-category-test")
        const status = yield* SessionStatus.Service

        const queueErr = Schema.decodeUnknownSync(SessionV1.QueueError.Schema)(
          new SessionV1.QueueError({
            position: 1,
            message: "position 1 in queue",
          }).toObject(),
        )

        const rateLimitErr = Schema.decodeUnknownSync(SessionV1.APIError.Schema)(
          new SessionV1.APIError({
            message: "Rate limit exceeded",
            statusCode: 403,
            isRetryable: false,
            responseBody: JSON.stringify({ error: { type: "UserRateLimit", message: "Rate limit exceeded" } }),
          }).toObject(),
        )

        const setCalls: Array<{ attempt: number; message: string }> = []

        const step = yield* Schedule.toStep(
          SessionRetry.policy({
            provider: "deveco",
            parse: (e: unknown) => e as ReturnType<NamedError["toObject"]>,
            set: (info) =>
              Effect.gen(function* () {
                setCalls.push({ attempt: info.attempt, message: info.message })
                yield* status.set(sessionID, {
                  type: "retry",
                  attempt: info.attempt,
                  message: info.message,
                  next: info.next,
                })
              }),
          }),
        )

        const now = Date.now()

        const r1 = yield* step(now, queueErr)
        expect(r1[0]).toBe(1)
        expect(Duration.toMillis(r1[1])).toBe(5000)

        // Category change resets categoryAttempt to 1, so delay is delays[0]=10s
        // (old bug used global meta.attempt=2, yielding delays[1]=20s)
        const r2 = yield* step(now + 5000, rateLimitErr)
        expect(r2[0]).toBe(2)
        expect(Duration.toMillis(r2[1])).toBe(10_000)

        const r3 = yield* step(now + 15_000, rateLimitErr)
        expect(r3[0]).toBe(3)
        expect(Duration.toMillis(r3[1])).toBe(20_000)

        // categoryAttempt=3, 3 > 3 is false → still retrying (3rd retry)
        const r4 = yield* step(now + 35_000, rateLimitErr)
        expect(r4[0]).toBe(4)
        expect(Duration.toMillis(r4[1])).toBe(30_000)

        // categoryAttempt=4, 4 > maxAttempts=3 → stop
        const r5 = yield* Effect.exit(step(now + 65_000, rateLimitErr))
        expect(Exit.isFailure(r5)).toBe(true)

        expect(setCalls).toHaveLength(4)
        expect(setCalls[0].attempt).toBe(1)
        expect(setCalls[1].attempt).toBe(2)
        expect(setCalls[2].attempt).toBe(3)
        expect(setCalls[3].attempt).toBe(4)
      }),
    ),
  )
})

describe("session.retry.retryable", () => {
  test("maps too_many_requests json messages", () => {
    const error = wrap(JSON.stringify({ type: "error", error: { type: "too_many_requests" } }))
    expect(SessionRetry.retryable(error, retryProvider)).toEqual({ message: "Too Many Requests" })
  })

  test("maps overloaded provider codes", () => {
    const error = wrap(JSON.stringify({ code: "resource_exhausted" }))
    expect(SessionRetry.retryable(error, retryProvider)).toEqual({ message: "Provider is overloaded" })
  })

  test("does not retry unknown json messages", () => {
    const error = wrap(JSON.stringify({ error: { message: "no_kv_space" } }))
    expect(SessionRetry.retryable(error, retryProvider)).toBeUndefined()
  })

  test("does not throw on numeric error codes", () => {
    const error = wrap(JSON.stringify({ type: "error", error: { code: 123 } }))
    const result = SessionRetry.retryable(error, retryProvider)
    expect(result).toBeUndefined()
  })

  test("returns undefined for non-json message", () => {
    const error = wrap("not-json")
    expect(SessionRetry.retryable(error, retryProvider)).toBeUndefined()
  })

  test("retries plain text rate limit errors from Alibaba", () => {
    const msg =
      "Upstream error from Alibaba: Request rate increased too quickly. To ensure system stability, please adjust your client logic to scale requests more smoothly over time."
    const error = wrap(msg)
    expect(SessionRetry.retryable(error, retryProvider)).toEqual({ message: msg })
  })

  test("retries plain text rate limit errors", () => {
    const msg = "Rate limit exceeded, please try again later"
    const error = wrap(msg)
    expect(SessionRetry.retryable(error, retryProvider)).toEqual({ message: msg })
  })

  test("retries too many requests in plain text", () => {
    const msg = "Too many requests, please slow down"
    const error = wrap(msg)
    expect(SessionRetry.retryable(error, retryProvider)).toEqual({ message: msg })
  })

  test("retries transport timeout errors", () => {
    const request = MessageV2.fromError(new ProviderError.HeaderTimeoutError(10000), { providerID })
    expect(SessionV1.APIError.isInstance(request)).toBe(true)
    expect(SessionRetry.retryable(request, retryProvider)).toEqual({
      message: "Provider response headers timed out after 10000ms",
    })
  })

  test("retries websocket stream transport errors", () => {
    const request = MessageV2.fromError(
      new ProviderError.ResponseStreamError("WebSocket closed before response.completed (code 1006: Connection ended)"),
      { providerID },
    )
    expect(SessionV1.APIError.isInstance(request)).toBe(true)
    expect(SessionRetry.retryable(request, retryProvider)).toEqual({
      message: "WebSocket closed before response.completed (code 1006: Connection ended)",
    })
  })

  test("does not retry context overflow errors", () => {
    const error = new SessionV1.ContextOverflowError({
      message: "Input exceeds context window of this model",
      responseBody: '{"error":{"code":"context_length_exceeded"}}',
    }).toObject()

    expect(SessionRetry.retryable(error, retryProvider)).toBeUndefined()
  })

  test("retries 500 errors even when isRetryable is false", () => {
    const error = Schema.decodeUnknownSync(SessionV1.APIError.Schema)(
      new SessionV1.APIError({
        message: "Internal server error",
        isRetryable: false,
        statusCode: 500,
        responseBody: '{"type":"api_error","message":"Internal server error"}',
      }).toObject(),
    )

    expect(SessionRetry.retryable(error, retryProvider)).toEqual({ message: "Internal server error" })
  })

  test("retries 502 bad gateway errors", () => {
    const error = Schema.decodeUnknownSync(SessionV1.APIError.Schema)(
      new SessionV1.APIError({
        message: "Bad gateway",
        isRetryable: false,
        statusCode: 502,
      }).toObject(),
    )

    expect(SessionRetry.retryable(error, retryProvider)).toEqual({ message: "Bad gateway" })
  })

  test("retries 503 service unavailable errors", () => {
    const error = Schema.decodeUnknownSync(SessionV1.APIError.Schema)(
      new SessionV1.APIError({
        message: "Service unavailable",
        isRetryable: false,
        statusCode: 503,
      }).toObject(),
    )

    expect(SessionRetry.retryable(error, retryProvider)).toEqual({ message: "Service unavailable" })
  })

  test("does not retry 4xx errors when isRetryable is false", () => {
    const error = Schema.decodeUnknownSync(SessionV1.APIError.Schema)(
      new SessionV1.APIError({
        message: "Bad request",
        isRetryable: false,
        statusCode: 400,
      }).toObject(),
    )

    expect(SessionRetry.retryable(error, retryProvider)).toBeUndefined()
  })

  test("retries ZlibError decompression failures", () => {
    const error = Schema.decodeUnknownSync(SessionV1.APIError.Schema)(
      new SessionV1.APIError({
        message: "Response decompression failed",
        isRetryable: true,
        metadata: { code: "ZlibError" },
      }).toObject(),
    )

    const retryable = SessionRetry.retryable(error, retryProvider)
    expect(retryable).toBeDefined()
    expect(retryable).toEqual({ message: "Response decompression failed" })
  })

  test("maps free limits to Go upsell action", () => {
    const error = Schema.decodeUnknownSync(SessionV1.APIError.Schema)(
      new SessionV1.APIError({
        message: "Free usage exceeded",
        isRetryable: true,
        statusCode: 429,
        responseBody: JSON.stringify({
          type: "error",
          error: { type: "FreeUsageLimitError", message: "Free usage exceeded" },
        }),
      }).toObject(),
    )

    expect(SessionRetry.retryable(error, "opencode")).toEqual({
      message: SessionRetry.GO_UPSELL_MESSAGE,
      action: {
        reason: "free_tier_limit",
        provider: "opencode",
        title: "Free limit reached",
        message: "Subscribe to OpenCode Go for reliable access to the best open-source models, starting at $5/month.",
        label: "subscribe",
        link: SessionRetry.GO_UPSELL_URL,
      },
    })
  })

  test("maps Go subscription limits to workspace PAYG upsell", () => {
    const error = Schema.decodeUnknownSync(SessionV1.APIError.Schema)(
      new SessionV1.APIError({
        message: "Subscription quota exceeded. You can continue using free models.",
        isRetryable: true,
        statusCode: 429,
        responseHeaders: {
          "retry-after": "19380",
        },
        responseBody: JSON.stringify({
          type: "error",
          error: {
            type: "GoUsageLimitError",
            message: "Subscription quota exceeded. You can continue using free models.",
          },
          metadata: {
            workspace: "wrk_01K6XGM22R6FM8JVABE9XDQXGH",
            limitName: "5 hour",
          },
        }),
      }).toObject(),
    )

    expect(SessionRetry.retryable(error, "opencode-go")).toEqual({
      message:
        "5 hour usage limit reached. It will reset in 5 hours 23 minutes. To continue using this model now, enable usage from your available balance - https://opencode.ai/workspace/wrk_01K6XGM22R6FM8JVABE9XDQXGH/go",
      action: {
        reason: "account_rate_limit",
        provider: "opencode-go",
        title: "Go limit reached",
        message:
          "5 hour usage limit reached. It will reset in 5 hours 23 minutes. To continue using this model now, enable usage from your available balance",
        label: "open settings",
        link: "https://opencode.ai/workspace/wrk_01K6XGM22R6FM8JVABE9XDQXGH/go",
      },
    })
  })

  test("maps Go subscription limits without limit metadata", () => {
    const error = Schema.decodeUnknownSync(SessionV1.APIError.Schema)(
      new SessionV1.APIError({
        message: "Subscription quota exceeded. You can continue using free models.",
        isRetryable: true,
        statusCode: 429,
        responseHeaders: {
          "retry-after": "900",
        },
        responseBody: JSON.stringify({
          type: "error",
          error: {
            type: "GoUsageLimitError",
            message: "Subscription quota exceeded. You can continue using free models.",
          },
          metadata: {
            workspace: "wrk_01K6XGM22R6FM8JVABE9XDQXGH",
          },
        }),
      }).toObject(),
    )

    expect(SessionRetry.retryable(error, "opencode-go")?.action?.message).toBe(
      "Usage limit reached. It will reset in 15 minutes. To continue using this model now, enable usage from your available balance",
    )
  })
})

describe("session.message-v2.fromError", () => {
  test.concurrent(
    "converts ECONNRESET socket errors to retryable APIError",
    async () => {
      using server = Bun.serve({
        port: 0,
        idleTimeout: 8,
        async fetch(_req) {
          return new Response(
            new ReadableStream({
              async pull(controller) {
                controller.enqueue("Hello,")
                await sleep(10000)
                controller.enqueue(" World!")
                controller.close()
              },
            }),
            { headers: { "Content-Type": "text/plain" } },
          )
        },
      })

      const error = await fetch(new URL("/", server.url.origin))
        .then((res) => res.text())
        .catch((e) => e)

      const result = MessageV2.fromError(error, { providerID })

      expect(SessionV1.APIError.isInstance(result)).toBe(true)
      if (!SessionV1.APIError.isInstance(result)) throw new Error("expected APIError")
      expect(result.data.isRetryable).toBe(true)
      expect(result.data.message).toBe("Connection reset by server")
      expect(result.data.metadata?.code).toBe("ECONNRESET")
      expect(result.data.metadata?.message).toInclude("socket connection")
    },
    15_000,
  )

  test("ECONNRESET socket error is retryable", () => {
    const error = Schema.decodeUnknownSync(SessionV1.APIError.Schema)(
      new SessionV1.APIError({
        message: "Connection reset by server",
        isRetryable: true,
        metadata: { code: "ECONNRESET", message: "The socket connection was closed unexpectedly" },
      }).toObject(),
    )

    const retryable = SessionRetry.retryable(error, retryProvider)
    expect(retryable).toBeDefined()
    expect(retryable).toEqual({ message: "Connection reset by server" })
  })

  test("marks OpenAI 404 status codes as retryable", () => {
    const error = new APICallError({
      message: "boom",
      url: "https://api.openai.com/v1/chat/completions",
      requestBodyValues: {},
      statusCode: 404,
      responseHeaders: { "content-type": "application/json" },
      responseBody: '{"error":"boom"}',
      isRetryable: false,
    })
    const result = MessageV2.fromError(error, { providerID: ProviderV2.ID.make("openai") })
    if (!SessionV1.APIError.isInstance(result)) throw new Error("expected APIError")
    expect(result.data.isRetryable).toBe(true)
  })

  test("converts OpenAI server_error stream chunks to retryable APIError", () => {
    const result = MessageV2.fromError(
      {
        message: JSON.stringify({
          type: "error",
          sequence_number: 2,
          error: {
            type: "server_error",
            code: "server_error",
            message: "An error occurred while processing your request.",
            param: null,
          },
        }),
      },
      { providerID: ProviderV2.ID.make("openai") },
    )

    expect(SessionV1.APIError.isInstance(result)).toBe(true)
    if (!SessionV1.APIError.isInstance(result)) throw new Error("expected APIError")
    expect(result.data.isRetryable).toBe(true)
    expect(SessionRetry.retryable(result, retryProvider)).toEqual({
      message: "An error occurred while processing your request.",
    })
  })
})

describe("session.retry.delay edge cases", () => {
  test("returns queue retry delay when isQueue is true", () => {
    const d = SessionRetry.delay(1, undefined, true)
    expect(d).toBe(SessionRetry.QUEUE_RETRY_DELAY)
  })

  test("returns queue delay even with error and headers present", () => {
    const error = apiError({ "retry-after-ms": "100" })
    const d = SessionRetry.delay(1, error, true)
    expect(d).toBe(SessionRetry.QUEUE_RETRY_DELAY)
  })

  test("computes exponential backoff when no error provided", () => {
    expect(SessionRetry.delay(1)).toBe(2000)
    expect(SessionRetry.delay(2)).toBe(4000)
    expect(SessionRetry.delay(3)).toBe(8000)
    expect(SessionRetry.delay(4)).toBe(16000)
    expect(SessionRetry.delay(5)).toBe(30000)
    expect(SessionRetry.delay(6)).toBe(30000)
  })

  test("uses retry-after-ms when retry-after-ms and retry-after both present", () => {
    const error = apiError({ "retry-after-ms": "1000", "retry-after": "50" })
    expect(SessionRetry.delay(1, error)).toBe(1000)
  })

  test("falls back to exponential when retry-after-ms is garbage and no retry-after", () => {
    const error = apiError({ "retry-after-ms": "garbage" })
    expect(SessionRetry.delay(1, error)).toBe(2000)
  })

  test("falls back to exponential when retry-after is garbage", () => {
    const error = apiError({ "retry-after": "garbage" })
    expect(SessionRetry.delay(1, error)).toBe(2000)
  })

  test("caps retry-after seconds based delay to max int32", () => {
    const error = apiError({ "retry-after": "99999999" })
    expect(SessionRetry.delay(1, error)).toBe(SessionRetry.RETRY_MAX_DELAY)
  })
})

describe("session.retry.retryable queue and rate limit errors", () => {
  test("returns queue error message", () => {
    const error = new SessionV1.QueueError({
      position: 3,
      message: "Queued for processing",
    }).toObject()
    const result = SessionRetry.retryable(error, retryProvider)
    expect(result).toEqual({ message: "Queued for processing" })
  })

  test("returns model service rate limit with fixed delays", () => {
    const error = new SessionV1.ModelServiceRateLimitError({
      message: "Model rate limited",
    }).toObject()
    const result = SessionRetry.retryable(error, retryProvider)
    expect(result).toEqual({
      message: "Model rate limited",
      maxAttempts: 3,
      delays: [10_000, 20_000, 30_000],
    })
  })
})

describe("session.retry.retryable 403 UserRateLimit", () => {
  test("returns maxAttempts and delays for 403 UserRateLimit", () => {
    const error = Schema.decodeUnknownSync(SessionV1.APIError.Schema)(
      new SessionV1.APIError({
        message: "Rate limit exceeded",
        isRetryable: false,
        statusCode: 403,
        responseBody: JSON.stringify({ error: { type: "UserRateLimit", message: "Rate limit exceeded" } }),
      }).toObject(),
    )
    const result = SessionRetry.retryable(error, retryProvider)
    expect(result).toEqual({
      message: "Rate limit exceeded",
      maxAttempts: 3,
      delays: [10_000, 20_000, 30_000],
    })
  })

  test("falls back to default message when body.error.message is missing", () => {
    const error = Schema.decodeUnknownSync(SessionV1.APIError.Schema)(
      new SessionV1.APIError({
        message: "Default msg",
        isRetryable: false,
        statusCode: 403,
        responseBody: JSON.stringify({ error: { type: "UserRateLimit" } }),
      }).toObject(),
    )
    const result = SessionRetry.retryable(error, retryProvider)
    expect(result).toEqual({
      message: "Default msg",
      maxAttempts: 3,
      delays: [10_000, 20_000, 30_000],
    })
  })

  test("does not match 403 when body is not JSON", () => {
    const error = Schema.decodeUnknownSync(SessionV1.APIError.Schema)(
      new SessionV1.APIError({
        message: "Forbidden",
        isRetryable: false,
        statusCode: 403,
        responseBody: "not json",
      }).toObject(),
    )
    const result = SessionRetry.retryable(error, retryProvider)
    expect(result).toBeUndefined()
  })

  test("does not match 403 when error type is not UserRateLimit", () => {
    const error = Schema.decodeUnknownSync(SessionV1.APIError.Schema)(
      new SessionV1.APIError({
        message: "Other 403",
        isRetryable: false,
        statusCode: 403,
        responseBody: JSON.stringify({ error: { type: "OtherError" } }),
      }).toObject(),
    )
    const result = SessionRetry.retryable(error, retryProvider)
    expect(result).toBeUndefined()
  })

  test("does not match 403 when responseBody is empty", () => {
    const error = Schema.decodeUnknownSync(SessionV1.APIError.Schema)(
      new SessionV1.APIError({
        message: "Forbidden",
        isRetryable: false,
        statusCode: 403,
      }).toObject(),
    )
    const result = SessionRetry.retryable(error, retryProvider)
    expect(result).toBeUndefined()
  })
})

describe("session.retry.retryable GoUsageLimitError resetIn branches", () => {
  const makeGoLimitError = (retryAfterSeconds: number, workspace = "wrk_test", limitName = "Daily") =>
    Schema.decodeUnknownSync(SessionV1.APIError.Schema)(
      new SessionV1.APIError({
        message: "Quota exceeded",
        isRetryable: true,
        statusCode: 429,
        responseHeaders: { "retry-after": String(retryAfterSeconds) },
        responseBody: JSON.stringify({
          type: "error",
          error: { type: "GoUsageLimitError" },
          metadata: { workspace, limitName },
        }),
      }).toObject(),
    )

  test("returns days and hours when retryAfter exceeds 1 day with hours", () => {
    const error = makeGoLimitError(90000, "wrk_a", "Weekly")
    const result = SessionRetry.retryable(error, "opencode")
    expect(result?.action?.reason).toBe("account_rate_limit")
    expect(result?.action?.message).toBe(
      "Weekly usage limit reached. It will reset in 1 day 1 hour. To continue using this model now, enable usage from your available balance",
    )
  })

  test("returns days only when retryAfter is exactly 1 day", () => {
    const error = makeGoLimitError(86400, "wrk_b", "Monthly")
    const result = SessionRetry.retryable(error, "opencode")
    expect(result?.action?.message).toContain("1 day")
    expect(result?.action?.message).not.toContain("hour")
  })

  test("returns hours and minutes when retryAfter exceeds 1 hour with minutes", () => {
    const error = makeGoLimitError(5400, "wrk_c", "Hourly")
    const result = SessionRetry.retryable(error, "opencode")
    expect(result?.action?.message).toContain("1 hour 30 minutes")
  })

  test("returns hours only when minutes are zero", () => {
    const error = makeGoLimitError(3600, "wrk_d", "Hourly")
    const result = SessionRetry.retryable(error, "opencode")
    expect(result?.action?.message).toContain("1 hour")
    expect(result?.action?.message).not.toContain("minute")
  })

  test("returns minutes only when under 1 hour", () => {
    const error = makeGoLimitError(300, "wrk_e", "15 min")
    const result = SessionRetry.retryable(error, "opencode")
    expect(result?.action?.message).toContain("5 minutes")
  })

  test("returns 'less than a minute' when retryAfter rounds to zero seconds", () => {
    const error = makeGoLimitError(1, "wrk_f", "Short")
    const result = SessionRetry.retryable(error, "opencode")
    expect(result?.action?.message).toContain("1 minute")
  })

  test("returns 'less than a minute' when retryAfter exceeds zero but rounds to zero minutes", () => {
    const error = Schema.decodeUnknownSync(SessionV1.APIError.Schema)(
      new SessionV1.APIError({
        message: "Quota exceeded",
        isRetryable: true,
        statusCode: 429,
        responseHeaders: { "retry-after": "0.5" },
        responseBody: JSON.stringify({
          type: "error",
          error: { type: "GoUsageLimitError" },
          metadata: { workspace: "wrk_g", limitName: "Tiny" },
        }),
      }).toObject(),
    )
    const result = SessionRetry.retryable(error, "opencode")
    expect(result?.action?.message).toContain("1 minute")
  })

  test("handles missing retry-after header by returning empty resetIn", () => {
    const error = Schema.decodeUnknownSync(SessionV1.APIError.Schema)(
      new SessionV1.APIError({
        message: "Quota exceeded",
        isRetryable: true,
        statusCode: 429,
        responseBody: JSON.stringify({
          type: "error",
          error: { type: "GoUsageLimitError" },
          metadata: { workspace: "wrk_h", limitName: "X" },
        }),
      }).toObject(),
    )
    const result = SessionRetry.retryable(error, "opencode")
    expect(result?.action?.message).toBe(
      "X usage limit reached. It will reset in . To continue using this model now, enable usage from your available balance",
    )
  })

  test("uses plural for days when value > 1", () => {
    const error = makeGoLimitError(172800, "wrk_i", "BiWeekly")
    const result = SessionRetry.retryable(error, "opencode")
    expect(result?.action?.message).toContain("2 days")
  })

  test("uses plural for hours when value > 1", () => {
    const error = makeGoLimitError(7200, "wrk_j", "Long")
    const result = SessionRetry.retryable(error, "opencode")
    expect(result?.action?.message).toContain("2 hours")
  })

  test("uses 'Generic usage limit' when limitName is empty", () => {
    const error = Schema.decodeUnknownSync(SessionV1.APIError.Schema)(
      new SessionV1.APIError({
        message: "Quota exceeded",
        isRetryable: true,
        statusCode: 429,
        responseHeaders: { "retry-after": "60" },
        responseBody: JSON.stringify({
          type: "error",
          error: { type: "GoUsageLimitError" },
          metadata: { workspace: "wrk_k" },
        }),
      }).toObject(),
    )
    const result = SessionRetry.retryable(error, "opencode")
    expect(result?.action?.message).toContain("Usage limit reached")
  })

  test("builds correct workspace link", () => {
    const error = makeGoLimitError(300, "wrk_xyz", "Daily")
    const result = SessionRetry.retryable(error, "opencode")
    expect(result?.action?.link).toBe("https://opencode.ai/workspace/wrk_xyz/go")
  })
})

describe("session.retry.retryable Overloaded branch", () => {
  test("returns 'Provider is overloaded' when message contains Overloaded", () => {
    const error = Schema.decodeUnknownSync(SessionV1.APIError.Schema)(
      new SessionV1.APIError({
        message: "Overloaded server",
        isRetryable: true,
        statusCode: 503,
      }).toObject(),
    )
    const result = SessionRetry.retryable(error, retryProvider)
    expect(result).toEqual({ message: "Provider is overloaded" })
  })

  test("returns original message when Overloaded is not present", () => {
    const error = Schema.decodeUnknownSync(SessionV1.APIError.Schema)(
      new SessionV1.APIError({
        message: "Something else",
        isRetryable: true,
        statusCode: 500,
      }).toObject(),
    )
    const result = SessionRetry.retryable(error, retryProvider)
    expect(result).toEqual({ message: "Something else" })
  })
})

describe("session.retry.retryable JSON error codes", () => {
  test("matches error type too_many_requests", () => {
    const error = wrap(JSON.stringify({ type: "error", error: { type: "too_many_requests" } }))
    expect(SessionRetry.retryable(error, retryProvider)).toEqual({ message: "Too Many Requests" })
  })

  test("matches exhausted code in code field", () => {
    const error = wrap(JSON.stringify({ code: "resource_exhausted" }))
    expect(SessionRetry.retryable(error, retryProvider)).toEqual({ message: "Provider is overloaded" })
  })

  test("matches unavailable code in code field", () => {
    const error = wrap(JSON.stringify({ code: "service_unavailable" }))
    expect(SessionRetry.retryable(error, retryProvider)).toEqual({ message: "Provider is overloaded" })
  })

  test("matches rate_limit in nested error.code", () => {
    const error = wrap(JSON.stringify({ type: "error", error: { code: "api_rate_limit_exceeded" } }))
    expect(SessionRetry.retryable(error, retryProvider)).toEqual({ message: "Rate Limited" })
  })

  test("returns undefined for unrecognized json objects", () => {
    const error = wrap(JSON.stringify({ code: "random_error" }))
    expect(SessionRetry.retryable(error, retryProvider)).toBeUndefined()
  })

  test("returns undefined for array JSON", () => {
    const error = wrap(JSON.stringify([1, 2, 3]))
    expect(SessionRetry.retryable(error, retryProvider)).toBeUndefined()
  })

  test("returns undefined for null JSON value", () => {
    const error = wrap(JSON.stringify(null))
    expect(SessionRetry.retryable(error, retryProvider)).toBeUndefined()
  })

  test("returns undefined for non-string message", () => {
    const error = wrap(12345)
    expect(SessionRetry.retryable(error, retryProvider)).toBeUndefined()
  })

  test("returns undefined for undefined message", () => {
    const error = wrap(undefined)
    expect(SessionRetry.retryable(error, retryProvider)).toBeUndefined()
  })
})
