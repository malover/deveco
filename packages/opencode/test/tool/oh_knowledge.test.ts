import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { Cause, Effect, Exit, Layer } from "effect"
import { Auth } from "@/auth"
import { Agent } from "@/agent/agent"
import * as Truncate from "../../src/tool/truncate"
import * as Tool from "../../src/tool/tool"
import { OhKnowledgeTool, KNOWLEDGE_TOOL_ID } from "../../src/tool/oh_knowledge"
import { SessionID, MessageID } from "../../src/session/schema"

function dieMessage(exit: Exit.Exit<unknown, unknown>): string | undefined {
  if (!Exit.isFailure(exit)) return undefined
  return Cause.prettyErrors(exit.cause)[0]?.message
}

function isDieExit(exit: Exit.Exit<unknown, unknown>): boolean {
  if (!Exit.isFailure(exit)) return false
  return exit.cause.reasons.some(Cause.isDieReason)
}

const oauthInfo = new Auth.Oauth({
  type: "oauth",
  refresh: "test-refresh",
  access: "test-access-token",
  expires: 9_999_999_999,
})

const noAuth = Layer.mock(Auth.Service, {
  get: () => Effect.succeed(undefined),
  all: () => Effect.succeed({}),
  set: () => Effect.void,
  remove: () => Effect.void,
})

const apiAuth = Layer.mock(Auth.Service, {
  get: () =>
    Effect.succeed(new Auth.Api({ type: "api", key: "api-key-123" })),
  all: () => Effect.succeed({}),
  set: () => Effect.void,
  remove: () => Effect.void,
})

const validOauth = Layer.mock(Auth.Service, {
  get: () => Effect.succeed(oauthInfo),
  all: () => Effect.succeed({}),
  set: () => Effect.void,
  remove: () => Effect.void,
})

const mockAgent = Layer.mock(Agent.Service, {
  get: () =>
    Effect.succeed({
      name: "build",
      mode: "all",
      permission: [],
      options: {},
    } as Agent.Info),
  list: () => Effect.succeed([]),
  defaultInfo: () => Effect.die(new Error("unimplemented")),
  defaultAgent: () => Effect.die(new Error("unimplemented")),
  generate: () => Effect.die(new Error("unimplemented")),
})

const mockTruncate = Layer.mock(Truncate.Service, {
  cleanup: () => Effect.void,
  write: () => Effect.die(new Error("unimplemented")),
  output: (text: string) => Effect.succeed({ content: text, truncated: false } as const),
  limits: () => Effect.succeed({ maxLines: 2000, maxBytes: 50 * 1024 }),
})

const infraLayer = Layer.mergeAll(mockAgent, mockTruncate)

const ctx: Tool.Context = {
  sessionID: SessionID.make("ses_test"),
  messageID: MessageID.make("msg_test"),
  agent: "build",
  abort: new AbortController().signal,
  callID: "call-1",
  messages: [],
  ask: () => Effect.void,
  metadata: () => Effect.void,
}

function mockFetch(response: unknown, status = 200) {
  const original = globalThis.fetch
  globalThis.fetch = ((() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(response),
    })) as unknown) as typeof fetch
  return () => {
    globalThis.fetch = original
  }
}

function mockFetchError(error: Error) {
  const original = globalThis.fetch
  globalThis.fetch = ((() => Promise.reject(error)) as unknown) as typeof fetch
  return () => {
    globalThis.fetch = original
  }
}

async function initTool(authLayer: Layer.Layer<Auth.Service>) {
  const layer = Layer.mergeAll(authLayer, infraLayer)
  const info = await Effect.runPromise(OhKnowledgeTool.pipe(Effect.provide(layer)))
  const def = await Effect.runPromise(Tool.init(info).pipe(Effect.provide(layer)))
  return def
}

describe("KNOWLEDGE_TOOL_ID", () => {
  it("equals arkts_knowledge_search", () => {
    expect(KNOWLEDGE_TOOL_ID).toBe("arkts_knowledge_search")
  })
})

describe("OhKnowledgeTool", () => {
  it("has the correct tool id", () => {
    expect(OhKnowledgeTool.id).toBe("arkts_knowledge_search")
  })
})

describe("execute", () => {
  let restoreFetch: (() => void) | undefined

  beforeEach(() => {
    restoreFetch = undefined
  })

  afterEach(() => {
    if (restoreFetch) restoreFetch()
  })

  describe("auth validation", () => {
    it("throws when auth returns undefined (not logged in)", async () => {
      const def = await initTool(noAuth)
      const exit = await Effect.runPromiseExit(def.execute({ question: "What is ArkTS?" }, ctx))
      expect(Exit.isFailure(exit)).toBe(true)
      expect(dieMessage(exit)).toContain("Authorization fail")
    })

    it("throws when auth returns non-oauth type (api key)", async () => {
      const def = await initTool(apiAuth)
      const exit = await Effect.runPromiseExit(def.execute({ question: "What is ArkTS?" }, ctx))
      expect(Exit.isFailure(exit)).toBe(true)
      expect(dieMessage(exit)).toContain("Authorization fail")
    })
  })

  describe("success path with mark found", () => {
    it("returns knowledge text after the mark", async () => {
      const mark = "\u3010\u68C0\u7D22\u4FE1\u606F\u3011\uFF1A"
      const answerText = "ArkTS is a language for Harmony."
      const body = {
        code: 200,
        body: {
          code: 200,
          desc: "ok",
          answer: { prompt: `${mark}${answerText}` },
        },
      }
      restoreFetch = mockFetch(body)
      const def = await initTool(validOauth)
      const exit = await Effect.runPromiseExit(def.execute({ question: "What is ArkTS?" }, ctx))
      expect(Exit.isSuccess(exit)).toBe(true)
      if (Exit.isSuccess(exit)) {
        expect(exit.value.title).toContain("knowledge Search")
        expect(exit.value.output).toBe(answerText)
      }
    })

    it("extracts text when mark is in the middle of prompt", async () => {
      const mark = "\u3010\u68C0\u7D22\u4FE1\u606F\u3011\uFF1A"
      const preamble = "Some preamble text that should not appear."
      const answerText = "The @State decorator triggers re-render."
      const body = {
        code: 200,
        body: {
          code: 200,
          desc: "ok",
          answer: { prompt: `${preamble}\n${mark}${answerText}` },
        },
      }
      restoreFetch = mockFetch(body)
      const def = await initTool(validOauth)
      const exit = await Effect.runPromiseExit(def.execute({ question: "How does @State work?" }, ctx))
      expect(Exit.isSuccess(exit)).toBe(true)
      if (Exit.isSuccess(exit)) {
        expect(exit.value.output).toBe(answerText)
        expect(exit.value.output).not.toContain(preamble)
      }
    })

    it("truncates result to MAX_RESULT_LENGTH (5120 chars)", async () => {
      const mark = "\u3010\u68C0\u7D22\u4FE1\u606F\u3011\uFF1A"
      const longAnswer = "A".repeat(6000)
      const body = {
        code: 200,
        body: {
          code: 200,
          desc: "ok",
          answer: { prompt: `${mark}${longAnswer}` },
        },
      }
      restoreFetch = mockFetch(body)
      const def = await initTool(validOauth)
      const exit = await Effect.runPromiseExit(def.execute({ question: "Long answer?" }, ctx))
      expect(Exit.isSuccess(exit)).toBe(true)
      if (Exit.isSuccess(exit)) {
        expect(exit.value.output.length).toBe(5120)
      }
    })

    it("returns full text when result is within MAX_RESULT_LENGTH", async () => {
      const mark = "\u3010\u68C0\u7D22\u4FE1\u606F\u3011\uFF1A"
      const shortAnswer = "Short answer."
      const body = {
        code: 200,
        body: {
          code: 200,
          desc: "ok",
          answer: { prompt: `${mark}${shortAnswer}` },
        },
      }
      restoreFetch = mockFetch(body)
      const def = await initTool(validOauth)
      const exit = await Effect.runPromiseExit(def.execute({ question: "Short?" }, ctx))
      expect(Exit.isSuccess(exit)).toBe(true)
      if (Exit.isSuccess(exit)) {
        expect(exit.value.output).toBe(shortAnswer)
      }
    })
  })

  describe("success path without mark or answer", () => {
    it("returns no answer when mark is absent in prompt", async () => {
      const body = {
        code: 200,
        body: {
          code: 200,
          desc: "ok",
          answer: { prompt: "This prompt has no mark at all." },
        },
      }
      restoreFetch = mockFetch(body)
      const def = await initTool(validOauth)
      const exit = await Effect.runPromiseExit(def.execute({ question: "Unknown topic?" }, ctx))
      expect(Exit.isSuccess(exit)).toBe(true)
      if (Exit.isSuccess(exit)) {
        expect(exit.value.output).toBe("No answer found for question")
      }
    })

    it("returns no answer when body is undefined", async () => {
      const body = { code: 200, body: undefined }
      restoreFetch = mockFetch(body)
      const def = await initTool(validOauth)
      const exit = await Effect.runPromiseExit(def.execute({ question: "Empty?" }, ctx))
      expect(Exit.isSuccess(exit)).toBe(true)
      if (Exit.isSuccess(exit)) {
        expect(exit.value.output).toBe("No answer found for question")
      }
    })

    it("returns no answer when answer is undefined", async () => {
      const body = {
        code: 200,
        body: { code: 200, desc: "ok", answer: undefined },
      }
      restoreFetch = mockFetch(body)
      const def = await initTool(validOauth)
      const exit = await Effect.runPromiseExit(def.execute({ question: "No answer?" }, ctx))
      expect(Exit.isSuccess(exit)).toBe(true)
      if (Exit.isSuccess(exit)) {
        expect(exit.value.output).toBe("No answer found for question")
      }
    })

    it("returns no answer when prompt is empty string", async () => {
      const body = {
        code: 200,
        body: { code: 200, desc: "ok", answer: { prompt: "" } },
      }
      restoreFetch = mockFetch(body)
      const def = await initTool(validOauth)
      const exit = await Effect.runPromiseExit(def.execute({ question: "Empty prompt?" }, ctx))
      expect(Exit.isSuccess(exit)).toBe(true)
      if (Exit.isSuccess(exit)) {
        expect(exit.value.output).toBe("No answer found for question")
      }
    })

    it("returns no answer when prompt is undefined", async () => {
      const body = {
        code: 200,
        body: { code: 200, desc: "ok", answer: { prompt: undefined } },
      }
      restoreFetch = mockFetch(body)
      const def = await initTool(validOauth)
      const exit = await Effect.runPromiseExit(def.execute({ question: "Undefined prompt?" }, ctx))
      expect(Exit.isSuccess(exit)).toBe(true)
      if (Exit.isSuccess(exit)) {
        expect(exit.value.output).toBe("No answer found for question")
      }
    })
  })

  describe("error response path", () => {
    it("throws authorization error on error_code 4016", async () => {
      const body = { error_code: 4016, error_msg: "Token expired" }
      restoreFetch = mockFetch(body, 200)
      const def = await initTool(validOauth)
      const exit = await Effect.runPromiseExit(def.execute({ question: "Test?" }, ctx))
      expect(Exit.isFailure(exit)).toBe(true)
      expect(dieMessage(exit)).toContain("Authorization fail")
    })

    it("throws service error with message on other error_code", async () => {
      const body = { error_code: 5000, error_msg: "Internal server error" }
      restoreFetch = mockFetch(body, 200)
      const def = await initTool(validOauth)
      const exit = await Effect.runPromiseExit(def.execute({ question: "Test?" }, ctx))
      expect(Exit.isFailure(exit)).toBe(true)
      expect(dieMessage(exit)).toContain("Internal server error")
    })

    it("throws service error with Unknown error when error_msg is missing", async () => {
      const body = { error_code: 5000 }
      restoreFetch = mockFetch(body, 200)
      const def = await initTool(validOauth)
      const exit = await Effect.runPromiseExit(def.execute({ question: "Test?" }, ctx))
      expect(Exit.isFailure(exit)).toBe(true)
      expect(dieMessage(exit)).toContain("Unknown error")
    })
  })

  describe("unknown response format", () => {
    it("throws when response has neither code nor error_code", async () => {
      const body = { unexpected_field: "something" }
      restoreFetch = mockFetch(body, 200)
      const def = await initTool(validOauth)
      const exit = await Effect.runPromiseExit(def.execute({ question: "Test?" }, ctx))
      expect(Exit.isFailure(exit)).toBe(true)
      expect(dieMessage(exit)).toContain("Unknown response format")
    })

    it("throws unknown response when code is not 200 and no error_code", async () => {
      const body = { code: 302 }
      restoreFetch = mockFetch(body, 200)
      const def = await initTool(validOauth)
      const exit = await Effect.runPromiseExit(def.execute({ question: "Test?" }, ctx))
      expect(Exit.isFailure(exit)).toBe(true)
      expect(dieMessage(exit)).toContain("Unknown response format")
    })
  })

  describe("fetch failure", () => {
    it("dies with defect when fetch throws", async () => {
      restoreFetch = mockFetchError(new Error("Network unreachable"))
      const def = await initTool(validOauth)
      const exit = await Effect.runPromiseExit(def.execute({ question: "Test?" }, ctx))
      expect(Exit.isFailure(exit)).toBe(true)
      expect(isDieExit(exit)).toBe(true)
    })
  })
})
