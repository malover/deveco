import { afterAll, afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import type { UserInfo } from "@/plugin/deveco/types"
import { ACCESS_TOKEN_EXPIRES_MS, PROVIDER_ID } from "@/plugin/deveco/types"
import type { AuthOAuthResult, Hooks, PluginInput } from "@opencode-ai/plugin"
import { GlobalBus } from "@/bus/global"
import { AppRuntime } from "@/effect/app-runtime"
import { devecoAuth } from "@/plugin/deveco/auth"
import { sessionChatIdMap } from "@/plugin/deveco/session"

// 真实 @/auth 导出 OAUTH_DUMMY_KEY = "opencode-oauth-dummy-key"，与测试断言一致，无需 mock。
// 真实 @opencode-ai/core/global 模块副作用（创建数据目录）安全，auth-plugin 本身不消费其值。
// 真实 @/bus/global：spyOn(GlobalBus, "emit") 替换 emit 行为，天然隔离。
// 真实 @/effect/app-runtime：spyOn(AppRuntime, "runPromise") 拦截 Effect 执行。
// 真实 @/plugin/deveco/auth：spyOn(devecoAuth, "login") 隔离登录行为。
// 真实 @/plugin/deveco/session：sessionChatIdMap 是可变 Map，测试直接操作同一个 Map 实例。
// 真实 @/plugin/deveco/token-refresh：先 spyOn ensureValidToken，再动态导入 auth-plugin，
// 让 auth-plugin 的 ESM live binding 读取被 spy 包装后的导出。

let improvementEnabled = true
const tokenRefresh = await import("@/plugin/deveco/token-refresh")
const privacySettings = await import("@/cli/deveco-privacy-settings")
const readToolImprovementEnabledSpy = spyOn(privacySettings, "readToolImprovementEnabled").mockImplementation(() =>
  Promise.resolve(improvementEnabled),
)
const { DevEcoAuthPlugin } = await import("@/plugin/deveco/auth-plugin")

type AuthCallbackResult =
  | { type: "success"; provider?: string; refresh: string; access: string; expires: number }
  | { type: "failed"; error?: string }

let capturedFetchCall: { input: RequestInfo | URL; init?: RequestInit } | null = null
let originalGlobalFetch: typeof globalThis.fetch
let globalBusEmitCalls: Array<{ event: string; payload: unknown }> = []

const devecAuthLoginSpy = spyOn(devecoAuth, "login")
const devecAuthRefreshTokenSpy = spyOn(devecoAuth, "refreshToken")
const globalBusEmitSpy = spyOn(GlobalBus, "emit")
const appRuntimeRunPromiseSpy = spyOn(AppRuntime, "runPromise")
const ensureValidTokenSpy = spyOn(tokenRefresh, "ensureValidToken")

const sampleUserInfo: UserInfo = {
  userId: "user-123",
  userName: "Alice",
  accessToken: "access-token-123",
  refreshToken: "refresh-token-456",
  jwtToken: "jwt-token-789",
  countryCode: "CN",
  language: "zh_CN",
  isRealName: true,
}

const minimalPluginInput: PluginInput = {
  client: {} as PluginInput["client"],
  project: {} as PluginInput["project"],
  directory: "",
  worktree: "",
  experimental_workspace: { register: () => {} },
  serverUrl: new URL("http://localhost:3000"),
  $: {} as PluginInput["$"],
}

beforeEach(() => {
  capturedFetchCall = null
  sessionChatIdMap.clear()
  globalBusEmitCalls = []
  improvementEnabled = true
  devecAuthLoginSpy.mockResolvedValue({ success: true, userInfo: sampleUserInfo })
  devecAuthRefreshTokenSpy.mockResolvedValue(null)
  globalBusEmitSpy.mockReset().mockImplementation(((_eventName: "event", event: any) => {
    globalBusEmitCalls.push({ event: "event", payload: event })
    return false
  }) as typeof GlobalBus.emit)
  appRuntimeRunPromiseSpy.mockReset().mockResolvedValue(undefined)
  ensureValidTokenSpy.mockReset().mockResolvedValue(null)
  originalGlobalFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedFetchCall = { input, init }
    return new Response("mock response", { status: 200 })
  }) as unknown as typeof globalThis.fetch
})

afterEach(() => {
  globalThis.fetch = originalGlobalFetch
})

afterAll(() => {
  globalBusEmitSpy.mockRestore()
  appRuntimeRunPromiseSpy.mockRestore()
  devecAuthLoginSpy.mockRestore()
  devecAuthRefreshTokenSpy.mockRestore()
  ensureValidTokenSpy.mockRestore()
  readToolImprovementEnabledSpy.mockRestore()
})

async function getFetchFn(
  getAuth: () => Promise<Record<string, unknown> | null>,
): Promise<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>> {
  const hooks: Hooks = await DevEcoAuthPlugin(minimalPluginInput)
  const result = await hooks.auth!.loader!(getAuth as never, PROVIDER_ID as never)
  if (!result.fetch) throw new Error("loader returned no fetch function")
  return result.fetch
}

async function getAuthorizeCallback(): Promise<() => Promise<AuthCallbackResult>> {
  const hooks: Hooks = await DevEcoAuthPlugin(minimalPluginInput)
  const method = hooks.auth!.methods[0]
  const authorizeResult = await (method.authorize as () => Promise<AuthOAuthResult>)()
  if (authorizeResult.method !== "auto") throw new Error("expected auto method")
  return authorizeResult.callback as () => Promise<AuthCallbackResult>
}

const validOauthAuth: Record<string, unknown> = {
  type: "oauth",
  access: "valid-access-token",
  expires: Date.now() + 100000,
}

const testUrl = "https://api.devecostudio.huawei.com/v2/chat/completions"

describe("DevEcoAuthPlugin", () => {
  test("should return hooks with provider ID and one oauth method", async () => {
    const hooks: Hooks = await DevEcoAuthPlugin(minimalPluginInput)
    expect(hooks.auth!.provider).toBe(PROVIDER_ID)
    expect(hooks.auth!.methods).toHaveLength(1)
    expect(hooks.auth!.methods[0].type).toBe("oauth")
    expect(hooks.auth!.methods[0].label).toBe("Login with Huawei DevEco Account")
  })
})

describe("loader", () => {
  test("should return empty object when getAuth returns null", async () => {
    const hooks: Hooks = await DevEcoAuthPlugin(minimalPluginInput)
    const result = await hooks.auth!.loader!(() => Promise.resolve(null) as never, PROVIDER_ID as never)
    expect(result.apiKey).toBeUndefined()
    expect(result.fetch).toBeUndefined()
  })

  test("should return apiKey and fetch when getAuth returns auth info", async () => {
    const hooks: Hooks = await DevEcoAuthPlugin(minimalPluginInput)
    const result = await hooks.auth!.loader!(() => Promise.resolve(validOauthAuth) as never, PROVIDER_ID as never)
    expect(result.apiKey).toBe("opencode-oauth-dummy-key")
    expect(typeof result.fetch).toBe("function")
  })
})

describe("fetch authorization header handling", () => {
  test("should remove auth headers from Headers instance and merge remaining into final headers", async () => {
    const fetchFn = await getFetchFn(() => Promise.resolve(validOauthAuth))
    await fetchFn(testUrl, {
      headers: new Headers({ authorization: "Bearer old-token", "x-custom": "custom-value" }),
      body: JSON.stringify({ stream: true }),
    })
    const finalHeaders = capturedFetchCall!.init!.headers as Headers
    expect(finalHeaders.get("authorization")).toBe("Bearer valid-access-token")
    expect(finalHeaders.get("x-custom")).toBe("custom-value")
  })

  test("should remove auth entries from array headers and merge remaining", async () => {
    const fetchFn = await getFetchFn(() => Promise.resolve(validOauthAuth))
    await fetchFn(testUrl, {
      headers: [
        ["authorization", "Bearer old-token"],
        ["x-custom", "custom-value"],
      ] as [string, string][],
      body: JSON.stringify({ stream: true }),
    })
    const finalHeaders = capturedFetchCall!.init!.headers as Headers
    expect(finalHeaders.get("authorization")).toBe("Bearer valid-access-token")
    expect(finalHeaders.get("x-custom")).toBe("custom-value")
  })

  test("should remove auth keys from Record headers and merge remaining", async () => {
    const fetchFn = await getFetchFn(() => Promise.resolve(validOauthAuth))
    await fetchFn(testUrl, {
      headers: { authorization: "Bearer old-token", "x-custom": "custom-value" },
      body: JSON.stringify({ stream: true }),
    })
    const finalHeaders = capturedFetchCall!.init!.headers as Headers
    expect(finalHeaders.get("authorization")).toBe("Bearer valid-access-token")
    expect(finalHeaders.get("x-custom")).toBe("custom-value")
  })

  test("should set default headers when init has no headers", async () => {
    const fetchFn = await getFetchFn(() => Promise.resolve(validOauthAuth))
    await fetchFn(testUrl)
    const finalHeaders = capturedFetchCall!.init!.headers as Headers
    expect(finalHeaders.get("authorization")).toBe("Bearer valid-access-token")
    expect(finalHeaders.get("lang")).toBe("en")
    expect(finalHeaders.get("Chat-Id")).toBeTruthy()
  })

  test("should not call ensureValidToken when token is valid and not expired", async () => {
    ensureValidTokenSpy.mockResolvedValue("should-not-be-called")
    const fetchFn = await getFetchFn(() => Promise.resolve(validOauthAuth))
    await fetchFn(testUrl)
    expect(ensureValidTokenSpy.mock.calls.length).toBe(0)
  })
})

describe("fetch tool improvement consent header", () => {
  test("sets improvement consent on Huawei OAuth inference requests", async () => {
    improvementEnabled = true
    const fetchFn = await getFetchFn(() => Promise.resolve(validOauthAuth))
    await fetchFn("https://cn.devecostudio.huawei.com/sse/codeGenie/maas/v2/chat/completions", {
      body: JSON.stringify({ stream: true }),
    })
    expect((capturedFetchCall!.init!.headers as Headers).get("X-DevEco-Improvement-Enabled")).toBe("true")
  })

  test("does not send improvement consent to non-Huawei inference URLs", async () => {
    const fetchFn = await getFetchFn(() => Promise.resolve(validOauthAuth))
    await fetchFn("https://example.com/v2/chat/completions", { body: JSON.stringify({ stream: true }) })
    expect((capturedFetchCall!.init!.headers as Headers).get("X-DevEco-Improvement-Enabled")).toBeNull()
  })

  test("does not send improvement consent for api-key auth", async () => {
    const fetchFn = await getFetchFn(() => Promise.resolve({ type: "api", key: "sk-test" }))
    await fetchFn("https://cn.devecostudio.huawei.com/sse/codeGenie/maas/v2/chat/completions", {
      body: JSON.stringify({ stream: true }),
    })
    expect((capturedFetchCall!.init!.headers as Headers).get("X-DevEco-Improvement-Enabled")).toBeNull()
  })

  test("sends the same consent value for non-streaming inference", async () => {
    improvementEnabled = true
    const fetchFn = await getFetchFn(() => Promise.resolve(validOauthAuth))
    await fetchFn("https://cn.devecostudio.huawei.com/sse/codeGenie/maas/v2/chat/completions", {
      body: JSON.stringify({ stream: false }),
    })
    expect((capturedFetchCall!.init!.headers as Headers).get("X-DevEco-Improvement-Enabled")).toBe("true")
  })

  test("local false overrides a caller supplied true value", async () => {
    improvementEnabled = false
    const fetchFn = await getFetchFn(() => Promise.resolve(validOauthAuth))
    await fetchFn("https://cn.devecostudio.huawei.com/sse/codeGenie/maas/v2/chat/completions", {
      headers: { "X-DevEco-Improvement-Enabled": "true" },
      body: JSON.stringify({ stream: true }),
    })
    expect((capturedFetchCall!.init!.headers as Headers).get("X-DevEco-Improvement-Enabled")).toBe("false")
  })
})

describe("fetch token refresh", () => {
  test("should call ensureValidToken and use refreshed token when expired", async () => {
    const expiredAuth: Record<string, unknown> = {
      type: "oauth",
      access: "expired-token",
      expires: Date.now() - 1000,
    }
    ensureValidTokenSpy.mockResolvedValue("refreshed-token")
    const fetchFn = await getFetchFn(() => Promise.resolve(expiredAuth))
    await fetchFn(testUrl)
    const finalHeaders = capturedFetchCall!.init!.headers as Headers
    expect(finalHeaders.get("authorization")).toBe("Bearer refreshed-token")
    expect(ensureValidTokenSpy.mock.calls.length).toBe(1)
  })

  test("should call ensureValidToken when access token is empty", async () => {
    const emptyAccessAuth: Record<string, unknown> = {
      type: "oauth",
      access: "",
      expires: Date.now() + 100000,
    }
    ensureValidTokenSpy.mockResolvedValue("new-token")
    const fetchFn = await getFetchFn(() => Promise.resolve(emptyAccessAuth))
    await fetchFn(testUrl)
    const finalHeaders = capturedFetchCall!.init!.headers as Headers
    expect(finalHeaders.get("authorization")).toBe("Bearer new-token")
    expect(ensureValidTokenSpy.mock.calls.length).toBe(1)
  })

  test("should return 401 and emit GlobalBus event when ensureValidToken fails for expired token", async () => {
    const expiredAuth: Record<string, unknown> = {
      type: "oauth",
      access: "expired-token",
      expires: Date.now() - 1000,
    }
    ensureValidTokenSpy.mockResolvedValue(null)
    const fetchFn = await getFetchFn(() => Promise.resolve(expiredAuth))
    const response = await fetchFn(testUrl)
    expect(response.status).toBe(401)
    expect(capturedFetchCall).toBe(null)
    const body = (await response.json()) as Record<string, unknown>
    expect(body.error).toContain("re-login")
    expect(globalBusEmitCalls.length).toBe(1)
    expect(globalBusEmitCalls[0].event).toBe("event")
    const emitPayload = globalBusEmitCalls[0].payload as {
      directory: string
      payload: { type: string; properties: Record<string, string> }
    }
    expect(emitPayload.directory).toBe("global")
    expect(emitPayload.payload.type).toBe("auth.token_refresh_failed")
    expect(emitPayload.payload.properties.providerID).toBe("deveco")
  })

  test("should not refresh or set Bearer when auth type is not oauth", async () => {
    const apiAuth: Record<string, unknown> = { type: "api", key: "sk-test" }
    ensureValidTokenSpy.mockResolvedValue(null)
    const fetchFn = await getFetchFn(() => Promise.resolve(apiAuth))
    await fetchFn(testUrl)
    const finalHeaders = capturedFetchCall!.init!.headers as Headers
    expect(finalHeaders.get("authorization")).toBe(null)
    expect(ensureValidTokenSpy.mock.calls.length).toBe(0)
  })

  test("should not set Bearer when getAuth returns null inside fetch", async () => {
    let callCount = 0
    const fetchFn = await getFetchFn(() => {
      callCount++
      return Promise.resolve(callCount === 1 ? validOauthAuth : null)
    })
    await fetchFn(testUrl)
    const finalHeaders = capturedFetchCall!.init!.headers as Headers
    expect(finalHeaders.get("authorization")).toBe(null)
    expect(finalHeaders.get("lang")).toBe("en")
  })
})

describe("fetch Chat-Id and Session-Id", () => {
  test("should use sessionChatIdMap value when x-deveco-session header is present", async () => {
    sessionChatIdMap.set("session-abc", "chat-def")
    const fetchFn = await getFetchFn(() => Promise.resolve(validOauthAuth))
    await fetchFn(testUrl, { headers: new Headers({ "x-deveco-session": "session-abc" }) })
    const finalHeaders = capturedFetchCall!.init!.headers as Headers
    expect(finalHeaders.get("Chat-Id")).toBe("chat-def")
    expect(finalHeaders.get("Session-Id")).toBe("session-abc")
  })

  test("should use sessionChatIdMap value when x-session-affinity header is present", async () => {
    sessionChatIdMap.set("session-xyz", "chat-mnp")
    const fetchFn = await getFetchFn(() => Promise.resolve(validOauthAuth))
    await fetchFn(testUrl, { headers: new Headers({ "x-session-affinity": "session-xyz" }) })
    const finalHeaders = capturedFetchCall!.init!.headers as Headers
    expect(finalHeaders.get("Chat-Id")).toBe("chat-mnp")
    expect(finalHeaders.get("Session-Id")).toBe("session-xyz")
  })

  test("should generate random Chat-Id when no sessionId in headers", async () => {
    const fetchFn = await getFetchFn(() => Promise.resolve(validOauthAuth))
    await fetchFn(testUrl)
    const finalHeaders = capturedFetchCall!.init!.headers as Headers
    const chatId = finalHeaders.get("Chat-Id")!
    expect(chatId.length).toBe(32)
    expect(chatId).toMatch(/^[0-9a-f]{32}$/)
  })

  test("should generate random Chat-Id but still set Session-Id when sessionId is not in map", async () => {
    const fetchFn = await getFetchFn(() => Promise.resolve(validOauthAuth))
    await fetchFn(testUrl, { headers: new Headers({ "x-deveco-session": "unknown-session" }) })
    const finalHeaders = capturedFetchCall!.init!.headers as Headers
    const chatId = finalHeaders.get("Chat-Id")!
    expect(chatId.length).toBe(32)
    expect(chatId).toMatch(/^[0-9a-f]{32}$/)
    expect(finalHeaders.get("Session-Id")).toBe("unknown-session")
  })
})

describe("fetch URL rewriting", () => {
  test("should rewrite URL path for non-streaming request", async () => {
    const fetchFn = await getFetchFn(() => Promise.resolve(validOauthAuth))
    await fetchFn(testUrl, { body: JSON.stringify({ stream: false }) })
    const input = capturedFetchCall!.input
    expect(input instanceof URL).toBe(true)
    expect((input as URL).pathname).toBe("/v2/no-stream/chat/completions")
  })

  test("should rewrite URL for non-streaming request with URL instance input", async () => {
    const fetchFn = await getFetchFn(() => Promise.resolve(validOauthAuth))
    await fetchFn(new URL(testUrl), { body: JSON.stringify({ stream: false }) })
    const input = capturedFetchCall!.input
    expect(input instanceof URL).toBe(true)
    expect((input as URL).pathname).toBe("/v2/no-stream/chat/completions")
  })

  test("should not rewrite URL for streaming request", async () => {
    const fetchFn = await getFetchFn(() => Promise.resolve(validOauthAuth))
    await fetchFn(testUrl, { body: JSON.stringify({ stream: true }) })
    expect(capturedFetchCall!.input).toBe(testUrl)
  })

  test("should rewrite URL when stream key is absent from body", async () => {
    const fetchFn = await getFetchFn(() => Promise.resolve(validOauthAuth))
    await fetchFn(testUrl, { body: JSON.stringify({ model: "test" }) })
    const input = capturedFetchCall!.input
    expect(input instanceof URL).toBe(true)
    expect((input as URL).pathname).toBe("/v2/no-stream/chat/completions")
  })

  test("should not rewrite URL when init has no body", async () => {
    const fetchFn = await getFetchFn(() => Promise.resolve(validOauthAuth))
    await fetchFn(testUrl, { method: "POST" })
    expect(capturedFetchCall!.input).toBe(testUrl)
  })

  test("should not rewrite URL when init.body is not a string", async () => {
    const fetchFn = await getFetchFn(() => Promise.resolve(validOauthAuth))
    await fetchFn(testUrl, { body: new Uint8Array([1, 2, 3]) })
    expect(capturedFetchCall!.input).toBe(testUrl)
  })

  test("should not rewrite URL when JSON.parse fails on body", async () => {
    const fetchFn = await getFetchFn(() => Promise.resolve(validOauthAuth))
    await fetchFn(testUrl, { body: "invalid json{{{" })
    expect(capturedFetchCall!.input).toBe(testUrl)
  })

  test("should strip trailing slash before rewriting for non-streaming request", async () => {
    const fetchFn = await getFetchFn(() => Promise.resolve(validOauthAuth))
    await fetchFn("https://api.devecostudio.huawei.com/v2/chat/completions/", {
      body: JSON.stringify({ stream: false }),
    })
    const input = capturedFetchCall!.input
    expect(input instanceof URL).toBe(true)
    expect((input as URL).pathname).toBe("/v2/no-stream/chat/completions")
  })
})

describe("authorize callback", () => {
  test("should return success when login succeeds with userInfo", async () => {
    devecAuthLoginSpy.mockResolvedValue({ success: true, userInfo: sampleUserInfo })
    const callback = await getAuthorizeCallback()
    const before = Date.now()
    const result = await callback()
    const after = Date.now()
    expect(result.type).toBe("success")
    const r = result as AuthCallbackResult & {
      type: "success"
      access: string
      refresh: string
      expires: number
      provider: string
    }
    expect(r.provider).toBe(PROVIDER_ID)
    expect(r.access).toBe("access-token-123")
    expect(r.refresh).toBe("refresh-token-456")
    expect(r.expires).toBeGreaterThanOrEqual(before + ACCESS_TOKEN_EXPIRES_MS)
    expect(r.expires).toBeLessThanOrEqual(after + ACCESS_TOKEN_EXPIRES_MS)
  })

  test("should return failed with error when login succeeds but userInfo is undefined", async () => {
    devecAuthLoginSpy.mockResolvedValue({ success: true })
    const callback = await getAuthorizeCallback()
    const result = await callback()
    expect(result.type).toBe("failed")
    expect((result as AuthCallbackResult & { type: "failed"; error: string }).error).toBe(
      "Login succeeded but no access token received",
    )
  })

  test("should return failed with error when userInfo has empty accessToken", async () => {
    const userInfoWithEmptyTokens: UserInfo = { ...sampleUserInfo, accessToken: "", refreshToken: "" }
    devecAuthLoginSpy.mockResolvedValue({ success: true, userInfo: userInfoWithEmptyTokens })
    const callback = await getAuthorizeCallback()
    const result = await callback()
    expect(result.type).toBe("failed")
    expect((result as AuthCallbackResult & { type: "failed"; error: string }).error).toBe(
      "Login succeeded but no access token received",
    )
  })

  test("should return failed without error when login is cancelled", async () => {
    devecAuthLoginSpy.mockResolvedValue({ success: false, cancelled: true })
    const callback = await getAuthorizeCallback()
    const result = await callback()
    expect(result.type).toBe("failed")
    expect((result as AuthCallbackResult & { type: "failed" }).error).toBeUndefined()
  })

  test("should return failed with region error when unsupportedRegion", async () => {
    devecAuthLoginSpy.mockResolvedValue({ success: false, unsupportedRegion: true })
    const callback = await getAuthorizeCallback()
    const result = await callback()
    expect(result.type).toBe("failed")
    expect((result as AuthCallbackResult & { type: "failed"; error: string }).error).toContain("China site")
  })

  test("should return failed without error when login fails without unsupportedRegion", async () => {
    devecAuthLoginSpy.mockResolvedValue({ success: false })
    const callback = await getAuthorizeCallback()
    const result = await callback()
    expect(result.type).toBe("failed")
    expect((result as AuthCallbackResult & { type: "failed" }).error).toBeUndefined()
  })
})
