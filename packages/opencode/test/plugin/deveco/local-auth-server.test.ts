import { afterEach, describe, expect, mock, test } from "bun:test"
import http from "http"
import { LocalAuthServer } from "@/plugin/deveco/local-auth-server"
import { LoginCancelledError, UnsupportedRegionError } from "@/plugin/deveco/errors"
import type { CallbackData } from "@/plugin/deveco/types"

const BASE_URL = "https://example.com"
const SUCCESS_URL = "success/page"
const FAILED_URL = "failed/page"
const CLIENT_SECRET = "test-secret"

mock.module("@/effect/app-runtime", () => ({
  AppRuntime: {
    runPromise: async () => {},
  },
}))

let nextPort = 45000
function getUniquePort(): number {
  return nextPort++
}

async function setupServer(): Promise<{ server: LocalAuthServer; port: number }> {
  const port = getUniquePort()
  const server = new LocalAuthServer(port, CLIENT_SECRET, BASE_URL, SUCCESS_URL, FAILED_URL)
  return { server, port: await server.start() }
}

function makeRequest(
  port: number,
  path: string,
  method: string = "GET",
  body?: string,
  timeoutMs: number = 5000,
): Promise<{ statusCode: number; headers: Record<string, string | string[] | undefined>; body: string } | null> {
  return new Promise((resolve) => {
    const options: http.RequestOptions = {
      hostname: "127.0.0.1",
      port,
      path,
      method,
      headers: {
        Connection: "close",
        ...(body
          ? { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) }
          : {}),
      },
    }
    const timer = setTimeout(() => {
      req.destroy()
      resolve(null)
    }, timeoutMs)
    const req = http.request(options, (res) => {
      clearTimeout(timer)
      let data = ""
      res.on("data", (chunk: Buffer) => {
        data += chunk.toString()
      })
      res.on("end", () => {
        resolve({
          statusCode: res!.statusCode ?? 0,
          headers: res!.headers as Record<string, string | string[] | undefined>,
          body: data,
        })
      })
    })
    req.on("error", () => {
      clearTimeout(timer)
      resolve(null)
    })
    if (body) req.write(body)
    req.end()
  })
}

function getHeader(headers: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const value = headers[key.toLowerCase()]
  if (typeof value === "string") return value
  if (Array.isArray(value)) return value[0]
  return undefined
}

function trackRejection(promise: Promise<CallbackData>, errorClass: Function, message?: string): Promise<void> {
  return promise.then(
    () => { expect.unreachable("should have rejected") },
    (err) => {
      expect(err).toBeInstanceOf(errorClass)
      if (message !== undefined) expect((err as Error).message).toBe(message)
    },
  )
}

describe("LocalAuthServer", () => {
  let server: LocalAuthServer | null = null

  afterEach(async () => {
    if (server) {
      await server.stop()
      server = null
    }
  })

  describe("start", () => {
    test("starts on specified port", async () => {
      const port = getUniquePort()
      server = new LocalAuthServer(port, CLIENT_SECRET, BASE_URL, SUCCESS_URL, FAILED_URL)
      expect(await server.start()).toBe(port)
      expect(server.getPort()).toBe(port)
    })

    test("falls back to next available port when primary is blocked", async () => {
      const blocker = http.createServer(() => {})
      await new Promise<void>((resolve) => blocker.listen(34567, "127.0.0.1", () => resolve()))
      server = new LocalAuthServer(34567, CLIENT_SECRET, BASE_URL, SUCCESS_URL, FAILED_URL)
      const actualPort = await server.start()
      expect(actualPort).not.toBe(34567)
      expect([34568, 34569, 34570]).toContain(actualPort)
      blocker.close()
    })

    test("throws when all fallback ports are in use", async () => {
      const blockers: http.Server[] = []
      for (const p of [34567, 34568, 34569, 34570]) {
        const s = http.createServer(() => {})
        blockers.push(s)
        await new Promise<void>((resolve) => s.listen(p, "127.0.0.1", () => resolve()))
      }
      server = new LocalAuthServer(34567, CLIENT_SECRET, BASE_URL, SUCCESS_URL, FAILED_URL)
      try {
        await server.start()
        expect.unreachable("should have thrown")
      } catch (err) {
        expect((err as Error).message).toContain("All ports are in use")
      } finally {
        for (const s of blockers) s.close()
        server = null
      }
    })
  })

  describe("callback handling", () => {
    test("valid GET: resolves CallbackData + 302 to success URL", async () => {
      const { server: srv, port } = await setupServer()
      server = srv
      const promise = server.waitForCallback()
      const res = await makeRequest(port, `/callback?code=${CLIENT_SECRET}&tempToken=myToken&siteId=1`)
      expect(await promise).toEqual({ tempToken: "myToken", siteId: "1" })
      expect(res!.statusCode).toBe(302)
      expect(getHeader(res!.headers, "location")).toBe(`${BASE_URL}/${SUCCESS_URL}`)
    })

    test("valid GET with quit param: resolves with quit + 302 to success URL", async () => {
      const { server: srv, port } = await setupServer()
      server = srv
      const promise = server.waitForCallback()
      const res = await makeRequest(port, `/callback?code=${CLIENT_SECRET}&tempToken=tk&siteId=1&quit=value`)
      expect(await promise).toEqual({ tempToken: "tk", siteId: "1", quit: "value" })
      expect(res!.statusCode).toBe(302)
      expect(getHeader(res!.headers, "location")).toBe(`${BASE_URL}/${SUCCESS_URL}`)
    })

    test("valid POST with body params: resolves CallbackData + 302 to success URL", async () => {
      const { server: srv, port } = await setupServer()
      server = srv
      const promise = server.waitForCallback()
      const res = await makeRequest(port, "/callback", "POST", `code=${CLIENT_SECRET}&tempToken=postToken&siteId=1`)
      expect(await promise).toEqual({ tempToken: "postToken", siteId: "1" })
      expect(res!.statusCode).toBe(302)
      expect(getHeader(res!.headers, "location")).toBe(`${BASE_URL}/${SUCCESS_URL}`)
    })

    test("POST with empty body: uses URL params + 302 to success URL", async () => {
      const { server: srv, port } = await setupServer()
      server = srv
      const promise = server.waitForCallback()
      const res = await makeRequest(port, `/callback?code=${CLIENT_SECRET}&tempToken=urlParam&siteId=1`, "POST", "")
      expect(await promise).toEqual({ tempToken: "urlParam", siteId: "1" })
      expect(res!.statusCode).toBe(302)
      expect(getHeader(res!.headers, "location")).toBe(`${BASE_URL}/${SUCCESS_URL}`)
    })

    test("quit=true: LoginCancelledError + 302 to failed URL", async () => {
      const { server: srv, port } = await setupServer()
      server = srv
      const promise = server.waitForCallback()
      const tracked = trackRejection(promise, LoginCancelledError, "Login cancelled by user")
      const res = await makeRequest(port, `/callback?code=${CLIENT_SECRET}&quit=true`)
      await tracked
      expect(res!.statusCode).toBe(302)
      expect(getHeader(res!.headers, "location")).toBe(`${BASE_URL}/${FAILED_URL}`)
    })

    test("quit=access_denied: LoginCancelledError('Access denied') + 302 to failed URL", async () => {
      const { server: srv, port } = await setupServer()
      server = srv
      const promise = server.waitForCallback()
      const tracked = trackRejection(promise, LoginCancelledError, "Access denied by user")
      const res = await makeRequest(port, `/callback?code=${CLIENT_SECRET}&quit=access_denied`)
      await tracked
      expect(res!.statusCode).toBe(302)
      expect(getHeader(res!.headers, "location")).toBe(`${BASE_URL}/${FAILED_URL}`)
    })

    test("POST quit=true: LoginCancelledError + 302 to failed URL", async () => {
      const { server: srv, port } = await setupServer()
      server = srv
      const promise = server.waitForCallback()
      const tracked = trackRejection(promise, LoginCancelledError, "Login cancelled by user")
      const res = await makeRequest(port, "/callback", "POST", `code=${CLIENT_SECRET}&quit=true`)
      await tracked
      expect(res!.statusCode).toBe(302)
      expect(getHeader(res!.headers, "location")).toBe(`${BASE_URL}/${FAILED_URL}`)
    })

    test("missing tempToken: Error + 302 to failed URL", async () => {
      const { server: srv, port } = await setupServer()
      server = srv
      const promise = server.waitForCallback()
      const tracked = trackRejection(promise, Error, "Login cancelled by user")
      const res = await makeRequest(port, `/callback?code=${CLIENT_SECRET}&siteId=1`)
      await tracked
      expect(res!.statusCode).toBe(302)
      expect(getHeader(res!.headers, "location")).toBe(`${BASE_URL}/${FAILED_URL}`)
    })

    test("missing siteId: Error + 302 to failed URL", async () => {
      const { server: srv, port } = await setupServer()
      server = srv
      const promise = server.waitForCallback()
      const tracked = trackRejection(promise, Error, "Login cancelled by user")
      const res = await makeRequest(port, `/callback?code=${CLIENT_SECRET}&tempToken=tk`)
      await tracked
      expect(res!.statusCode).toBe(302)
      expect(getHeader(res!.headers, "location")).toBe(`${BASE_URL}/${FAILED_URL}`)
    })

    test("unsupported region: UnsupportedRegionError + 302 to failed URL", async () => {
      const { server: srv, port } = await setupServer()
      server = srv
      const promise = server.waitForCallback()
      const tracked = trackRejection(promise, UnsupportedRegionError, "Unsupported region")
      const res = await makeRequest(port, `/callback?code=${CLIENT_SECRET}&tempToken=tk&siteId=2`)
      await tracked
      expect(res!.statusCode).toBe(302)
      expect(getHeader(res!.headers, "location")).toBe(`${BASE_URL}/${FAILED_URL}`)
    })

    test("code mismatch: callback ignored, connection hangs", async () => {
      const { server: srv, port } = await setupServer()
      server = srv
      const promise = server.waitForCallback()
      promise.catch(() => {})
      expect(await makeRequest(port, `/callback?code=wrong&tempToken=tk&siteId=1`, "GET", undefined, 500)).toBeNull()
      server.cancel()
    })

    test("missing code: callback ignored, connection hangs", async () => {
      const { server: srv, port } = await setupServer()
      server = srv
      const promise = server.waitForCallback()
      promise.catch(() => {})
      expect(await makeRequest(port, `/callback?tempToken=tk&siteId=1`, "GET", undefined, 500)).toBeNull()
      server.cancel()
    })

    test("non-callback path: 404 Not Found", async () => {
      const { server: srv, port } = await setupServer()
      server = srv
      const res = await makeRequest(port, "/other-path")
      expect(res!.statusCode).toBe(404)
      expect(res!.body).toBe("Not Found")
    })
  })

  describe("waitForCallback timeout", () => {
    test("rejects with timeout error when no callback arrives", async () => {
      const { server: srv, port } = await setupServer()
      server = srv
      await trackRejection(server.waitForCallback(500), Error, "Callback timeout")
    })
  })

  describe("cancel", () => {
    test("rejects waitForCallback with LoginCancelledError", async () => {
      const { server: srv, port } = await setupServer()
      server = srv
      const promise = server.waitForCallback()
      const tracked = trackRejection(promise, LoginCancelledError, "Login cancelled by user")
      server.cancel()
      await tracked
    })

    test("safe when no callback is pending", () => {
      const port = getUniquePort()
      server = new LocalAuthServer(port, CLIENT_SECRET, BASE_URL, SUCCESS_URL, FAILED_URL)
      server.cancel()
      server = null
    })

    test("idempotent: second cancel is a no-op", async () => {
      const { server: srv, port } = await setupServer()
      server = srv
      const promise = server.waitForCallback()
      const tracked = trackRejection(promise, LoginCancelledError, "Login cancelled by user")
      server.cancel()
      server.cancel()
      await tracked
    })
  })

  describe("stop", () => {
    test("resolves immediately when server was never started", async () => {
      const port = getUniquePort()
      server = new LocalAuthServer(port, CLIENT_SECRET, BASE_URL, SUCCESS_URL, FAILED_URL)
      await server.stop()
      server = null
    })

    test("closes the server: subsequent requests fail", async () => {
      const { server: srv, port } = await setupServer()
      server = srv
      await server.stop()
      server = null
      expect(await makeRequest(port, "/callback")).toBeNull()
    })

    test("clears timeout: waitForCallback promise stays pending after stop", async () => {
      const { server: srv, port } = await setupServer()
      server = srv
      const promise = server.waitForCallback(200)
      let settled = false
      promise.then(() => { settled = true }, () => { settled = true })
      await server.stop()
      server = null
      await new Promise((r) => setTimeout(r, 300))
      expect(settled).toBe(false)
    })
  })
})
