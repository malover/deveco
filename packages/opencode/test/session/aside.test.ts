import { describe, expect, test } from "bun:test"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { APICallError, LoadAPIKeyError } from "ai"
import { Provider } from "../../src/provider/provider"
import { AsideService } from "../../src/session/aside"

const providerID = "openai"

describe("session.aside.toBtwError", () => {
  test("classifies an invalid API key without exposing provider details", () => {
    const error = new APICallError({
      message: "Incorrect API key",
      url: "https://example.com/v1/responses",
      requestBodyValues: { apiKey: "do-not-leak" },
      statusCode: 401,
      responseHeaders: { "x-request-id": "secret-request-id" },
      responseBody: JSON.stringify({
        error: {
          message: "Incorrect API key: sk-secret",
          type: "invalid_request_error",
        },
      }),
      isRetryable: false,
    })

    expect(AsideService.toBtwError(error, providerID)).toEqual({
      code: "auth",
      message: "Incorrect API key",
    })
  })

  test("classifies a missing API key as authentication failure", () => {
    expect(AsideService.toBtwError(new LoadAPIKeyError({ message: "API key not found" }), providerID)).toEqual({
      code: "auth",
      message: "API key not found",
    })
  })

  test("classifies quota and rate limit failures", () => {
    expect(
      AsideService.toBtwError(
        {
          type: "error",
          error: {
            code: "insufficient_quota",
          },
        },
        providerID,
      ),
    ).toEqual({
      code: "quota",
      message: "Quota exceeded. Check your plan and billing details.",
    })

    expect(
      AsideService.toBtwError(
        new APICallError({
          message: "Too many requests",
          url: "https://example.com/v1/responses",
          requestBodyValues: {},
          statusCode: 429,
          isRetryable: true,
        }),
        providerID,
      ),
    ).toEqual({
      code: "rate_limit",
      message: "Too many requests",
    })
  })

  test("classifies model lookup and context overflow failures", () => {
    expect(
      AsideService.toBtwError(
        new Provider.ModelNotFoundError({
          providerID: ProviderV2.ID.make(providerID),
          modelID: ModelV2.ID.make("missing-model"),
        }),
        providerID,
      ),
    ).toEqual({
      code: "model_not_found",
      message: "Model not found: openai/missing-model.",
    })

    expect(
      AsideService.toBtwError(
        {
          type: "error",
          error: {
            code: "context_length_exceeded",
          },
        },
        providerID,
      ),
    ).toEqual({
      code: "context_overflow",
      message: "Input exceeds context window of this model",
    })
  })

  test("preserves the standard unknown error message without its stack", () => {
    const error = new Error("upstream details")
    error.stack = "secret stack"

    expect(AsideService.toBtwError(error, providerID)).toEqual({
      code: "unknown",
      message: "upstream details",
    })
  })
})
