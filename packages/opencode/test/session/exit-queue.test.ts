import { afterAll, afterEach, beforeAll, describe, expect, it, mock } from "bun:test"
import fs from "fs"
import path from "path"
import { Effect } from "effect"
import { Global } from "@opencode-ai/core/global"
import { LocalCrypto } from "@/security/local-crypto"
import { sessionChatIdMap } from "@/plugin/deveco"
import { loadAccessTokenFromDisk, layer, Service } from "@/session/exit-queue"

// Must match the frozen module-level constant in exit-queue.ts
const authFilePath = path.join(Global.Path.data, "auth.json")
const originalFetch = globalThis.fetch

// Preserve real auth file to avoid destroying user credentials
let originalAuthContent: string | null = null
let originalAuthExists = false

beforeAll(() => {
  try {
    originalAuthContent = fs.readFileSync(authFilePath, "utf-8")
    originalAuthExists = true
  } catch {
    originalAuthExists = false
  }
})

afterAll(() => {
  if (originalAuthExists && originalAuthContent !== null) {
    fs.writeFileSync(authFilePath, originalAuthContent, { mode: 0o600 })
  } else {
    try {
      fs.unlinkSync(authFilePath)
    } catch {}
  }
})

afterEach(() => {
  try {
    fs.unlinkSync(authFilePath)
  } catch {}
  globalThis.fetch = originalFetch
  sessionChatIdMap.clear()
})

function seedAuthProvider(devecoInfo: Record<string, unknown>) {
  const encrypted = LocalCrypto.encryptAuthData({ deveco: devecoInfo })
  fs.writeFileSync(authFilePath, JSON.stringify(encrypted), { mode: 0o600 })
}

function seedAuthData(data: Record<string, unknown>) {
  const encrypted = LocalCrypto.encryptAuthData(data)
  fs.writeFileSync(authFilePath, JSON.stringify(encrypted), { mode: 0o600 })
}

function seedRaw(content: string) {
  fs.writeFileSync(authFilePath, content)
}

// Build the service once — layer has no external dependencies
const svc = Effect.runSync(
  Effect.gen(function* () {
    return yield* Service
  }).pipe(Effect.provide(layer)),
)

// ──────────────────────────────────────────────────────────────────────────
// loadAccessTokenFromDisk
// ──────────────────────────────────────────────────────────────────────────

describe("loadAccessTokenFromDisk", () => {
  it("returns empty string when auth file does not exist", () => {
    try {
      fs.unlinkSync(authFilePath)
    } catch {}
    expect(loadAccessTokenFromDisk()).toBe("")
  })

  it("returns access token when file contains valid OAuth data", () => {
    seedAuthProvider({ type: "oauth", access: "my-access-token", refresh: "ref", expires: 99999 })
    expect(loadAccessTokenFromDisk()).toBe("my-access-token")
  })

  it("returns empty string when deveco entry is missing from auth data", () => {
    seedAuthData({ otherProvider: { type: "api", key: "k" } })
    expect(loadAccessTokenFromDisk()).toBe("")
  })

  it("returns empty string when deveco type is not oauth", () => {
    seedAuthProvider({ type: "api", key: "k" })
    expect(loadAccessTokenFromDisk()).toBe("")
  })

  it("returns empty string when access field is a non-string value", () => {
    seedAuthProvider({ type: "oauth", access: 12345, refresh: "r", expires: 0 })
    expect(loadAccessTokenFromDisk()).toBe("")
  })

  it("returns empty string when access field is missing entirely", () => {
    seedAuthProvider({ type: "oauth" })
    expect(loadAccessTokenFromDisk()).toBe("")
  })

  it("returns empty string when file content is invalid JSON", () => {
    seedRaw("not-valid-json{{{")
    expect(loadAccessTokenFromDisk()).toBe("")
  })

  it("returns empty string when decryption fails with malformed blob", () => {
    seedRaw(
      JSON.stringify({
        deveco: {
          type: "oauth",
          access: {
            version: 1,
            algorithm: "aes-256-gcm",
            ciphertext: "invalid-ciphertext!!!",
            iv: "AAAAAAAAAAAAAAAA",
            authTag: "AAAAAAAAAAAAAAAAAAAAAA",
            timeStamp: Date.now(),
          },
        },
      }),
    )
    expect(loadAccessTokenFromDisk()).toBe("")
  })
})

// ──────────────────────────────────────────────────────────────────────────
// exit
// ──────────────────────────────────────────────────────────────────────────

describe("exit", () => {
  interface CapturedRequest {
    url: string
    init: RequestInit | undefined
  }

  function installFetchMock(
    response?: Response | (() => Promise<Response>),
    errorToThrow?: unknown,
  ): CapturedRequest {
    const captured: CapturedRequest = { url: "", init: undefined }
    const mockFn = mock(async (url: string | URL | Request, init?: RequestInit) => {
      captured.url = String(url)
      captured.init = init ?? undefined
      if (errorToThrow !== undefined) throw errorToThrow
      const resp = response ?? new Response("ok")
      return typeof resp === "function" ? await resp() : resp
    })
    globalThis.fetch = mockFn as unknown as typeof globalThis.fetch
    return captured
  }

  it("sends POST with all headers when chatId and token exist", async () => {
    seedAuthProvider({ type: "oauth", access: "mytoken", refresh: "r", expires: 99999 })
    sessionChatIdMap.set("sess-1", "chat-1")
    const captured = installFetchMock()

    await Effect.runPromise(svc.exit("sess-1", "model/glm-5"))

    expect(captured.url).toContain("exitSessionQueue")
    expect(captured.url).toContain(encodeURIComponent("model/glm-5"))
    expect(captured.init?.method).toBe("POST")
    const headers = captured.init?.headers as Record<string, string>
    expect(headers["Content-Type"]).toBe("application/json")
    expect(headers["Session-Id"]).toBe("sess-1")
    expect(headers["Chat-Id"]).toBe("chat-1")
    expect(headers["authorization"]).toBe("Bearer mytoken")
  })

  it("omits Chat-Id header when chatId is not in map", async () => {
    seedAuthProvider({ type: "oauth", access: "tok", refresh: "r", expires: 99999 })
    const captured = installFetchMock()

    await Effect.runPromise(svc.exit("unknown-sess", "model1"))

    const headers = captured.init?.headers as Record<string, string>
    expect(headers["Chat-Id"]).toBeUndefined()
    expect(headers["authorization"]).toBe("Bearer tok")
    expect(headers["Session-Id"]).toBe("unknown-sess")
  })

  it("omits authorization header when no token exists on disk", async () => {
    try {
      fs.unlinkSync(authFilePath)
    } catch {}
    sessionChatIdMap.set("sess-2", "chat-2")
    const captured = installFetchMock()

    await Effect.runPromise(svc.exit("sess-2", "model1"))

    const headers = captured.init?.headers as Record<string, string>
    expect(headers["Chat-Id"]).toBe("chat-2")
    expect(headers["authorization"]).toBeUndefined()
    expect(headers["Session-Id"]).toBe("sess-2")
  })

  it("sends only base headers when both chatId and token are absent", async () => {
    try {
      fs.unlinkSync(authFilePath)
    } catch {}
    const captured = installFetchMock()

    await Effect.runPromise(svc.exit("bare-sess", "model1"))

    const headers = captured.init?.headers as Record<string, string>
    expect(headers["Content-Type"]).toBe("application/json")
    expect(headers["Session-Id"]).toBe("bare-sess")
    expect(headers["Chat-Id"]).toBeUndefined()
    expect(headers["authorization"]).toBeUndefined()
  })

  it("completes without error when fetch throws network error", async () => {
    try {
      fs.unlinkSync(authFilePath)
    } catch {}
    installFetchMock(undefined, new Error("Network is unreachable"))

    await expect(Effect.runPromise(svc.exit("err-sess", "model1"))).resolves.toBeUndefined()
  })

  it("wraps non-Error exception and completes gracefully", async () => {
    try {
      fs.unlinkSync(authFilePath)
    } catch {}
    installFetchMock(undefined, "string error")

    await expect(Effect.runPromise(svc.exit("str-sess", "model1"))).resolves.toBeUndefined()
  })

  it("encodes special characters in modelId via encodeURIComponent", async () => {
    try {
      fs.unlinkSync(authFilePath)
    } catch {}
    const captured = installFetchMock()

    const specialModelId = "model/special value&param=1"
    await Effect.runPromise(svc.exit("enc-sess", specialModelId))

    const encoded = encodeURIComponent(specialModelId)
    expect(captured.url).toContain(encoded)
    expect(captured.url).toContain("model%2Fspecial%20value%26param%3D1")
    expect(captured.url).not.toContain("model/special value&param=1")
  })

  it("completes when fetch returns 4xx/5xx status without error", async () => {
    try {
      fs.unlinkSync(authFilePath)
    } catch {}
    installFetchMock(new Response("Internal Server Error", { status: 500 }))

    await expect(Effect.runPromise(svc.exit("http-err", "model1"))).resolves.toBeUndefined()
  })
})
