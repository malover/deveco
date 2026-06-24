import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"

void mock.module("@/effect/app-runtime", () => ({
  AppRuntime: {
    runPromise: async () => {},
    dispose: async () => {},
  },
}))

import {
  DEVECO_API_URL,
  DEVECO_DEFAULTS,
  DEVECO_PROVIDER_CONFIG,
} from "../../src/plugin/deveco-models"

const DEVECO_NPM = "@ai-sdk/openai-compatible"
const DEVECO_PROVIDER_ID = "deveco"

function makeApiModelConfig(m: {
  model_id: string
  thinking_mode?: string
  tool_call_mode?: string
  context_window?: number
  output?: string | number
  input_modalities?: string[]
}, id: number) {
  return {
    id,
    model_id: m.model_id,
    thinking_mode: m.thinking_mode,
    tool_call_mode: m.tool_call_mode,
    context_window: m.context_window,
    output: m.output,
    input_modalities: m.input_modalities,
  }
}

function makeValidApiResponse(overrides?: {
  code?: number
  models?: Array<{
    model_id: string
    thinking_mode?: string
    tool_call_mode?: string
    context_window?: number
    output?: string | number
    input_modalities?: string[]
  }>
  taskDefaultModelMap?: Record<string, string>
  groups?: Array<{
    protocol?: string
    group_name?: string
    model_configs?: Array<{
      model_id: string
      thinking_mode?: string
      tool_call_mode?: string
      context_window?: number
      output?: string | number
      input_modalities?: string[]
    }>
    task_default_model_map?: Record<string, string>
  }>
}) {
  const code = overrides?.code ?? 200
  if (overrides?.groups) {
    return {
      code,
      body: {
        version: 1,
        inner_models: overrides.groups.map((g, gi) => ({
          protocol: g.protocol ?? "openai",
          group_name: g.group_name ?? `group-${gi}`,
          model_configs: (g.model_configs ?? []).map((m, mi) => makeApiModelConfig(m, gi * 100 + mi + 1)),
          ...(g.task_default_model_map ? { task_default_model_map: g.task_default_model_map } : {}),
        })),
      },
    }
  }
  const configs = overrides?.models ?? [
    { model_id: "glm-5", thinking_mode: "on", tool_call_mode: "tool_calls", context_window: 202752, output: 131072, input_modalities: ["text"] },
  ]
  const taskMap = overrides?.taskDefaultModelMap
  return {
    code,
    body: {
      version: 1,
      inner_models: [
        {
          protocol: "openai",
          group_name: "default",
          model_configs: configs.map((m, i) => makeApiModelConfig(m, i + 1)),
          ...(taskMap ? { task_default_model_map: taskMap } : {}),
        },
      ],
    },
  }
}

function mockFetch(fn: (input: URL | RequestInfo, init?: RequestInit | BunFetchRequestInit) => Promise<Response>): typeof globalThis.fetch {
  return fn as typeof globalThis.fetch
}

let freshModule: typeof import("../../src/plugin/deveco-models")
let testCounter = 0

async function loadFresh() {
  mock.module("@/effect/app-runtime", () => ({
    AppRuntime: { runPromise: async () => {}, dispose: async () => {} },
  }))
  freshModule = (await import(`../../src/plugin/deveco-models?fresh=${++testCounter}`)) as typeof freshModule
  return freshModule
}

describe("static exports", () => {
  test("DEVECO_DEFAULTS provider metadata and model entries", () => {
    const provider = DEVECO_DEFAULTS.provider
    expect(provider.id).toBe(DEVECO_PROVIDER_ID)
    expect(provider.name).toBe("DevEco Code")
    expect(provider.npm).toBe(DEVECO_NPM)
    expect(provider.api).toBe(DEVECO_API_URL)
    expect(provider.env).toEqual([])

    const glm5 = provider.models["glm-5"]!
    expect(glm5.id).toBe("glm-5")
    expect(glm5.reasoning).toBe(true)
    expect(glm5.tool_call).toBe(true)
    expect(glm5.limit.context).toBe(202752)
    expect(glm5.limit.output).toBe(131072)
    expect(glm5.modalities!.input).toEqual(["text"])
    expect(glm5.cost!.input).toBe(0)
    expect(glm5.provider!.npm).toBe(DEVECO_NPM)

    const qwen = provider.models["Qwen2.5-VL-72B"]!
    expect(qwen.reasoning).toBe(false)
    expect(qwen.modalities!.input).toEqual(["text", "image"])
    expect(qwen.limit.context).toBe(32768)
  })

  test("DEVECO_DEFAULTS.taskDefaultModelMap has expected entries", () => {
    const map = DEVECO_DEFAULTS.taskDefaultModelMap
    expect(map.small_model).toBe("glm-5")
    expect(map.ui_verification).toBe("Qwen3_VL_235B_A22B_Instruct")
    expect(map.blacklist).toBe("Qwen2.5-VL-72B")
  })

  test("DEVECO_PROVIDER_CONFIG equals DEVECO_DEFAULTS.provider", () => {
    expect(DEVECO_PROVIDER_CONFIG).toBe(DEVECO_DEFAULTS.provider)
  })
})

describe("getDevecoProviderConfig", () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("falls back to defaults filtered by blacklist on HTTP error", async () => {
    const mod = await loadFresh()
    globalThis.fetch = mockFetch(async () => new Response("error", { status: 500 }))
    const result = await mod.getDevecoProviderConfig("token")
    expect(result.id).toBe(DEVECO_PROVIDER_ID)
    expect(Object.keys(result.models)).not.toContain("Qwen2.5-VL-72B")
    expect(result.models["glm-5"]).toBeDefined()
  })

  test("falls back to defaults filtered by blacklist on empty API models", async () => {
    const mod = await loadFresh()
    globalThis.fetch = mockFetch(async () =>
      Response.json({ code: 200, body: { version: 1, inner_models: [] } })
    )
    const result = await mod.getDevecoProviderConfig("token")
    expect(Object.keys(result.models)).not.toContain("Qwen2.5-VL-72B")
    expect(result.models["glm-5"]).toBeDefined()
  })

  test("falls back to defaults on non-200 code in response body", async () => {
    const mod = await loadFresh()
    globalThis.fetch = mockFetch(async () =>
      Response.json({ code: 403, body: { version: 1, inner_models: [] } })
    )
    const result = await mod.getDevecoProviderConfig("token")
    expect(Object.keys(result.models)).not.toContain("Qwen2.5-VL-72B")
  })

  test("falls back to defaults on network error (fetch throws)", async () => {
    const mod = await loadFresh()
    globalThis.fetch = mockFetch(async () => { throw new Error("ECONNREFUSED") })
    const result = await mod.getDevecoProviderConfig("token")
    expect(result.id).toBe(DEVECO_PROVIDER_ID)
    expect(result.models["glm-5"]).toBeDefined()
  })

  test("falls back to defaults on malformed JSON that fails schema validation", async () => {
    const mod = await loadFresh()
    globalThis.fetch = mockFetch(async () => Response.json({ unexpected: "shape" }))
    const result = await mod.getDevecoProviderConfig("token")
    expect(result.models["glm-5"]).toBeDefined()
  })

  test("fallback does not cache — subsequent call still fetches", async () => {
    const mod = await loadFresh()
    let callCount = 0
    globalThis.fetch = mockFetch(async () => {
      callCount++
      throw new Error("network error")
    })
    await mod.getDevecoProviderConfig("token")
    expect(callCount).toBe(1)
    await mod.getDevecoProviderConfig("token")
    expect(callCount).toBe(2)
  })

  test("maps API model configs and filters by task blacklist", async () => {
    const mod = await loadFresh()
    const apiResponse = makeValidApiResponse({
      models: [
        { model_id: "reasoning-model", thinking_mode: "on", tool_call_mode: "tool_calls", context_window: 200000, output: 8000 },
        { model_id: "basic-model", thinking_mode: "off", tool_call_mode: "auto", context_window: 4096, output: "2048" },
        { model_id: "no-thinking-no-tool", context_window: 8192 },
        { model_id: "bad-output-model", output: "not-a-number", context_window: 16384 },
        { model_id: "vl-model", input_modalities: ["text", "image"], tool_call_mode: "tool_calls" },
        { model_id: "empty-mods-model", input_modalities: [], tool_call_mode: "tool_calls" },
        { model_id: "blacklisted-model", tool_call_mode: "tool_calls" },
      ],
      taskDefaultModelMap: {
        small_model: "reasoning-model",
        blacklist: "blacklisted-model",
      },
    })
    globalThis.fetch = mockFetch(async () => Response.json(apiResponse))

    const result = await mod.getDevecoProviderConfig("test-token")

    expect(result.id).toBe(DEVECO_PROVIDER_ID)
    expect(result.models["reasoning-model"]!.reasoning).toBe(true)
    expect(result.models["reasoning-model"]!.tool_call).toBe(true)
    expect(result.models["reasoning-model"]!.limit.context).toBe(200000)
    expect(result.models["reasoning-model"]!.limit.output).toBe(8000)
    expect(result.models["reasoning-model"]!.modalities!.input).toEqual(["text"])

    expect(result.models["basic-model"]!.reasoning).toBe(false)
    expect(result.models["basic-model"]!.tool_call).toBe(false)
    expect(result.models["basic-model"]!.limit.output).toBe(2048)

    expect(result.models["no-thinking-no-tool"]!.reasoning).toBe(false)
    expect(result.models["no-thinking-no-tool"]!.tool_call).toBe(false)
    expect(result.models["no-thinking-no-tool"]!.limit.context).toBe(8192)
    expect(result.models["no-thinking-no-tool"]!.limit.output).toBe(8192)

    expect(result.models["bad-output-model"]!.limit.output).toBe(8192)

    expect(result.models["vl-model"]!.modalities!.input).toEqual(["text", "image"])
    expect(result.models["vl-model"]!.limit.context).toBe(32768)

    expect(result.models["empty-mods-model"]!.modalities!.input).toEqual(["text"])

    expect(Object.keys(result.models)).not.toContain("blacklisted-model")
  })

  test("uses empty blacklist when API has no taskDefaultModelMap (no models filtered)", async () => {
    const mod = await loadFresh()
    const apiResponse = makeValidApiResponse({
      models: [
        { model_id: "model-a", tool_call_mode: "tool_calls" },
        { model_id: "Qwen2.5-VL-72B", tool_call_mode: "tool_calls" },
      ],
    })
    globalThis.fetch = mockFetch(async () => Response.json(apiResponse))
    const result = await mod.getDevecoProviderConfig("token")
    expect(result.models["model-a"]).toBeDefined()
    expect(result.models["Qwen2.5-VL-72B"]).toBeDefined()
  })

  test("extracts taskDefaultModelMap from non-first group", async () => {
    const mod = await loadFresh()
    const apiResponse = makeValidApiResponse({
      groups: [
        {
          group_name: "models",
          model_configs: [{ model_id: "model-x", tool_call_mode: "tool_calls" }],
        },
        {
          group_name: "tasks",
          model_configs: [],
          task_default_model_map: { small_model: "model-x", blacklist: "model-y" },
        },
      ],
    })
    globalThis.fetch = mockFetch(async () => Response.json(apiResponse))
    const result = await mod.getDevecoProviderConfig("token")
    expect(result.models["model-x"]).toBeDefined()
    const map = mod.getTaskDefaultModelMap()
    expect(map.small_model).toBe("model-x")
  })

  test("caches result and skips API on subsequent calls", async () => {
    const mod = await loadFresh()
    let callCount = 0
    globalThis.fetch = mockFetch(async () => {
      callCount++
      return Response.json(makeValidApiResponse())
    })
    const first = await mod.getDevecoProviderConfig("token")
    expect(callCount).toBe(1)
    const second = await mod.getDevecoProviderConfig("token")
    expect(callCount).toBe(1)
    expect(second).toBe(first)
  })

  test("sends authorization and content-type headers", async () => {
    const mod = await loadFresh()
    let capturedHeaders: Headers | undefined
    globalThis.fetch = mockFetch(async (_input, init) => {
      capturedHeaders = new Headers(init?.headers as Record<string, string> | undefined)
      return Response.json(makeValidApiResponse())
    })
    await mod.getDevecoProviderConfig("my-token")
    expect(capturedHeaders!.get("Authorization")).toBe("Bearer my-token")
    expect(capturedHeaders!.get("Content-Type")).toBe("application/json")
  })
})

describe("getTaskDefaultModelMap", () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("returns DEVECO_DEFAULTS.taskDefaultModelMap when cache is empty", async () => {
    const mod = await loadFresh()
    const map = mod.getTaskDefaultModelMap()
    expect(map.small_model).toBe("glm-5")
    expect(map.blacklist).toBe("Qwen2.5-VL-72B")
  })

  test("returns cached map after successful API fetch", async () => {
    const mod = await loadFresh()
    globalThis.fetch = mockFetch(async () =>
      Response.json(makeValidApiResponse({
        taskDefaultModelMap: { small_model: "api-model", blacklist: "bad-model" },
      }))
    )
    await mod.getDevecoProviderConfig("token")
    const map = mod.getTaskDefaultModelMap()
    expect(map.small_model).toBe("api-model")
    expect(map.blacklist).toBe("bad-model")
  })
})
