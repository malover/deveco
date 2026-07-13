import { afterEach, describe, expect, mock, test } from "bun:test"
import { LoginCancelledError, UnsupportedRegionError } from "@/plugin/deveco/errors"
import type { CallbackData, HttpResponse, TokenCheckResponse } from "@/plugin/deveco/types"

let mockServerInstance: {
  start: () => Promise<number>
  waitForCallback: (timeout: number) => Promise<CallbackData>
  stop: () => Promise<void>
  cancel: () => void
  getPort: () => number
}

let mockSaveAuthToDisk: (key: string, info: Record<string, unknown> | null) => Promise<void>
let mockExecShouldFail = false

mock.module("@/plugin/deveco/local-auth-server", () => ({
  LocalAuthServer: class MockLocalAuthServer {
    start() { return mockServerInstance.start() }
    waitForCallback(timeout: number) { return mockServerInstance.waitForCallback(timeout) }
    stop() { return mockServerInstance.stop() }
    cancel() { mockServerInstance.cancel() }
    getPort() { return mockServerInstance.getPort() }
  },
}))

mock.module("child_process", () => {
  const mockCp = {
    exec: function (...args: unknown[]) {
      const cb = args[args.length - 1]
      if (typeof cb !== "function") return
      if (mockExecShouldFail) {
        cb(new Error("exec failed"), "", "")
      } else {
        cb(null, "", "")
      }
    },
    spawn: () => ({ on: () => {}, kill: () => true, unref: () => {} }),
    fork: () => ({ on: () => {}, send: () => false, kill: () => true }),
    execSync: () => Buffer.from(""),
    execFileSync: () => Buffer.from(""),
    execFile: function (...args: unknown[]) {
      const cb = args[args.length - 1]
      if (typeof cb === "function") cb(null, "", "")
    },
    spawnSync: () => ({ pid: 0, output: [null, Buffer.from(""), Buffer.from("")], status: 0, signal: null }),
  }
  return { ...mockCp, default: mockCp }
})

mock.module("@/plugin/deveco/storage", () => ({
  saveAuthToDisk: (key: string, info: Record<string, unknown> | null) => mockSaveAuthToDisk(key, info),
  authFilePath: () => "/tmp/mock-auth.json",
  loadAccessTokenFromDisk: () => "",
  hasDevecoOAuthEntry: () => false,
}))

const { LoginService } = await import("@/plugin/deveco/login-service")
const { httpClient } = await import("@/plugin/deveco/http-client")
const { tokenStorage } = await import("@/plugin/deveco/token-storage")

function createJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString("base64url")
  const signature = Buffer.from("fake-signature").toString("base64url")
  return `${header}.${payloadStr}.${signature}`
}

const savedHttpClientGet = httpClient.get
const savedHttpClientParseJson = httpClient.parseJson
const savedTokenStorageSaveToken = tokenStorage.saveToken
const savedTokenStorageLoadToken = tokenStorage.loadToken
const savedTokenStorageClearToken = tokenStorage.clearToken

function makeServer(overrides?: Partial<typeof mockServerInstance>) {
  const defaults = {
    start: mock(() => Promise.resolve(12345)),
    waitForCallback: mock(() => Promise.resolve({ tempToken: "test-temp-token", siteId: "1" })),
    stop: mock(() => Promise.resolve()),
    cancel: mock(() => {}),
    getPort: mock(() => 12345),
  }
  return { ...defaults, ...overrides }
}

const defaultJwt = createJwt({ userId: "user-123", userName: "Alice" })
const defaultTokenCheck: TokenCheckResponse = {
  status: true,
  userInfo: {
    accessToken: "access-token-123",
    refreshToken: "refresh-token-456",
    nationalCode: "CN",
    realName: "true",
  },
}

function mockHttpClientForLogin(
  jwt: string = defaultJwt,
  tokenCheck: TokenCheckResponse = defaultTokenCheck,
  jwtStatus: number = 200,
  checkStatus: number = 200,
) {
  httpClient.get = mock((url: string) => {
    if (url.includes("temptoken")) {
      return Promise.resolve({ statusCode: jwtStatus, data: jwt, headers: {} } as HttpResponse)
    }
    if (url.includes("jwToken")) {
      return Promise.resolve({ statusCode: checkStatus, data: JSON.stringify(tokenCheck), headers: {} } as HttpResponse)
    }
    return Promise.resolve({ statusCode: 404, data: "", headers: {} } as HttpResponse)
  })
  httpClient.parseJson = mock(() => tokenCheck)
}

mockServerInstance = makeServer()
mockSaveAuthToDisk = mock(async () => {})

afterEach(() => {
  httpClient.get = savedHttpClientGet
  httpClient.parseJson = savedHttpClientParseJson
  tokenStorage.saveToken = savedTokenStorageSaveToken
  tokenStorage.loadToken = savedTokenStorageLoadToken
  tokenStorage.clearToken = savedTokenStorageClearToken
  mockServerInstance = makeServer()
  mockSaveAuthToDisk = mock(async () => {})
  mockExecShouldFail = false
})

describe("LoginService.parseJwt", () => {
  test("should parse valid JWT and extract userId, userName, exp, iat", () => {
    const service = new LoginService()
    const jwt = createJwt({ userId: "user-123", userName: "Alice", exp: 12345, iat: 67890 })
    const result = service.parseJwt(jwt)
    expect(result.userId).toBe("user-123")
    expect(result.userName).toBe("Alice")
    expect(result.exp).toBe(12345)
    expect(result.iat).toBe(67890)
  })

  test("should throw for tokens with wrong number of segments", () => {
    const service = new LoginService()
    expect(() => service.parseJwt("onlyone")).toThrow("Invalid jwtToken format")
    expect(() => service.parseJwt("header.payload")).toThrow("Invalid jwtToken format")
  })

  test("should default userId and userName to empty string when missing", () => {
    const service = new LoginService()
    const jwt = createJwt({ exp: 1 })
    const result = service.parseJwt(jwt)
    expect(result.userId).toBe("")
    expect(result.userName).toBe("")
  })
})

describe("LoginService.isLoggedIn", () => {
  test("should return true without checking storage when userInfo is set", async () => {
    mockHttpClientForLogin()
    tokenStorage.saveToken = mock(() => Promise.resolve())
    mockServerInstance = makeServer({
      waitForCallback: mock(() => Promise.resolve({ tempToken: "test-temp-token&siteId=1", siteId: "1" })),
    })
    const service = new LoginService()
    await service.login()

    const loadSpy = mock(() => Promise.resolve("should-not-be-called"))
    tokenStorage.loadToken = loadSpy
    expect(await service.isLoggedIn()).toBe(true)
    expect(loadSpy.mock.calls.length).toBe(0)
  })

  test("should return true when token exists in storage and userInfo is null", async () => {
    tokenStorage.loadToken = mock(() => Promise.resolve("stored-jwt-token"))
    const service = new LoginService()
    expect(await service.isLoggedIn()).toBe(true)
  })

  test("should return false when userInfo is null and no token in storage", async () => {
    tokenStorage.loadToken = mock(() => Promise.resolve(null))
    const service = new LoginService()
    expect(await service.isLoggedIn()).toBe(false)
  })
})

describe("LoginService.getUserInfo", () => {
  test("should return null when userInfo has not been set", () => {
    const service = new LoginService()
    expect(service.getUserInfo()).toBe(null)
  })
})

describe("LoginService.logout", () => {
  test("should clear token storage and call saveAuthToDisk with null", async () => {
    const clearSpy = mock(() => Promise.resolve())
    tokenStorage.clearToken = clearSpy
    const diskSpy = mock(async (key: string, info: Record<string, unknown> | null) => {
      expect(key).toBe("deveco")
      expect(info).toBe(null)
    })
    mockSaveAuthToDisk = diskSpy

    const service = new LoginService()
    await service.logout()

    expect(clearSpy.mock.calls.length).toBe(1)
    expect(service.getUserInfo()).toBe(null)
  })

  test("should not throw when saveAuthToDisk fails", async () => {
    tokenStorage.clearToken = mock(() => Promise.resolve())
    mockSaveAuthToDisk = mock(async () => { throw new Error("disk write failed") })

    const service = new LoginService()
    await service.logout()
    expect(service.getUserInfo()).toBe(null)
  })
})

describe("LoginService.cancel", () => {
  test("should do nothing when server is not initialized", () => {
    const service = new LoginService()
    service.cancel()
  })
})

describe("LoginService.login", () => {
  test("should return success result with userInfo on successful login flow", async () => {
    const stopSpy = mock(() => Promise.resolve())
    mockServerInstance = makeServer({
      waitForCallback: mock(() => Promise.resolve({ tempToken: "test-temp-token&siteId=1", siteId: "1" })),
      stop: stopSpy,
    })
    mockHttpClientForLogin()
    tokenStorage.saveToken = mock(() => Promise.resolve())

    const service = new LoginService()
    const result = await service.login()

    expect(result.success).toBe(true)
    expect(result.userInfo).toBeDefined()
    expect(result.userInfo!.userId).toBe("user-123")
    expect(result.userInfo!.userName).toBe("Alice")
    expect(result.userInfo!.accessToken).toBe("access-token-123")
    expect(result.userInfo!.refreshToken).toBe("refresh-token-456")
    expect(result.userInfo!.countryCode).toBe("CN")
    expect(result.userInfo!.language).toBe("zh_CN")
    expect(result.userInfo!.isRealName).toBe(true)
    expect(stopSpy.mock.calls.length).toBe(1)

    expect(await service.isLoggedIn()).toBe(true)
    expect(service.getUserInfo()!.userId).toBe("user-123")
  })

  test("should return cancelled result when LoginCancelledError is thrown", async () => {
    const stopSpy = mock(() => Promise.resolve())
    mockServerInstance = makeServer({
      waitForCallback: mock(() => Promise.reject(new LoginCancelledError("user cancelled"))),
      stop: stopSpy,
    })

    const service = new LoginService()
    const result = await service.login()

    expect(result.success).toBe(false)
    expect(result.cancelled).toBe(true)
    expect(result.error).toBe("user cancelled")
    expect(stopSpy.mock.calls.length).toBe(1)
  })

  test("should return unsupportedRegion result when UnsupportedRegionError is thrown", async () => {
    const stopSpy = mock(() => Promise.resolve())
    mockServerInstance = makeServer({
      waitForCallback: mock(() => Promise.reject(new UnsupportedRegionError("Unsupported region"))),
      stop: stopSpy,
    })

    const service = new LoginService()
    const result = await service.login()

    expect(result.success).toBe(false)
    expect(result.unsupportedRegion).toBe(true)
    expect(result.error).toBe("Sorry, only China site accounts are currently supported")
    expect(stopSpy.mock.calls.length).toBe(1)
  })

  test("should return error result when server start fails", async () => {
    mockServerInstance = makeServer({
      start: mock(() => Promise.reject(new Error("port in use"))),
    })

    const service = new LoginService()
    const result = await service.login()

    expect(result.success).toBe(false)
    expect(result.cancelled).toBeUndefined()
    expect(result.unsupportedRegion).toBeUndefined()
    expect(result.error).toBe("port in use")
  })

  test("should return error result when getJwtToken returns non-200 status", async () => {
    mockHttpClientForLogin(defaultJwt, defaultTokenCheck, 500, 200)

    const service = new LoginService()
    const result = await service.login()

    expect(result.success).toBe(false)
    expect(result.error).toBe("Failed to get jwtToken: 500")
  })

  test("should return error result when getJwtToken returns invalid JWT format", async () => {
    mockHttpClientForLogin("not-a-jwt", defaultTokenCheck)

    const service = new LoginService()
    const result = await service.login()

    expect(result.success).toBe(false)
    expect(result.error).toBe("Invalid jwtToken format")
  })

  test("should return error result when checkJwtToken returns non-200 status", async () => {
    mockHttpClientForLogin(defaultJwt, defaultTokenCheck, 200, 403)

    const service = new LoginService()
    const result = await service.login()

    expect(result.success).toBe(false)
    expect(result.error).toBe("Failed to check jwtToken: 403")
  })

  test("should return error result when checkJwtToken response has status false", async () => {
    mockHttpClientForLogin(defaultJwt, { status: false })

    const service = new LoginService()
    const result = await service.login()

    expect(result.success).toBe(false)
    expect(result.error).toBe("Invalid jwtToken: missing userInfo")
  })

  test("should return error result when checkJwtToken response has no userInfo", async () => {
    mockHttpClientForLogin(defaultJwt, { status: true })

    const service = new LoginService()
    const result = await service.login()

    expect(result.success).toBe(false)
    expect(result.error).toBe("Invalid jwtToken: missing userInfo")
  })

  test("should return error result and stop server when openLoginPage fails", async () => {
    mockExecShouldFail = true
    const stopSpy = mock(() => Promise.resolve())
    mockServerInstance = makeServer({ stop: stopSpy })
    mockHttpClientForLogin()
    tokenStorage.saveToken = mock(() => Promise.resolve())

    const service = new LoginService()
    const result = await service.login()

    expect(result.success).toBe(false)
    expect(result.error).toBe("Failed to open login page")
    expect(stopSpy.mock.calls.length).toBe(1)
  })

  test("should stop server in finally block even when login fails", async () => {
    const stopSpy = mock(() => Promise.resolve())
    mockServerInstance = makeServer({
      waitForCallback: mock(() => Promise.reject(new Error("timeout"))),
      stop: stopSpy,
    })

    const service = new LoginService()
    await service.login()

    expect(stopSpy.mock.calls.length).toBe(1)
  })
})

describe("LoginService.refreshToken", () => {
  test("should return new tokens on successful refresh", async () => {
    const tokenCheck: TokenCheckResponse = {
      status: true,
      userInfo: {
        accessToken: "new-access",
        refreshToken: "new-refresh",
        nationalCode: "CN",
        realName: "false",
      },
    }
    httpClient.get = mock(() => Promise.resolve({
      statusCode: 200,
      data: JSON.stringify(tokenCheck),
      headers: {},
    } as HttpResponse))
    httpClient.parseJson = mock(() => tokenCheck)

    const service = new LoginService()
    const result = await service.refreshToken("some.jwt.token")

    expect(result).not.toBe(null)
    expect(result!.accessToken).toBe("new-access")
    expect(result!.refreshToken).toBe("new-refresh")
  })

  test("should return null when HTTP response status is not 200", async () => {
    httpClient.get = mock(() => Promise.resolve({
      statusCode: 403,
      data: "",
      headers: {},
    } as HttpResponse))

    const service = new LoginService()
    expect(await service.refreshToken("some.jwt.token")).toBe(null)
  })

  test("should return null when response has status false", async () => {
    const invalidResponse: TokenCheckResponse = { status: false }
    httpClient.get = mock(() => Promise.resolve({
      statusCode: 200,
      data: JSON.stringify(invalidResponse),
      headers: {},
    } as HttpResponse))
    httpClient.parseJson = mock(() => invalidResponse)

    const service = new LoginService()
    expect(await service.refreshToken("some.jwt.token")).toBe(null)
  })

  test("should return null when response has status true but no userInfo", async () => {
    const noUserInfo: TokenCheckResponse = { status: true }
    httpClient.get = mock(() => Promise.resolve({
      statusCode: 200,
      data: JSON.stringify(noUserInfo),
      headers: {},
    } as HttpResponse))
    httpClient.parseJson = mock(() => noUserInfo)

    const service = new LoginService()
    expect(await service.refreshToken("some.jwt.token")).toBe(null)
  })

  test("should return null when httpClient.get throws", async () => {
    httpClient.get = mock(() => Promise.reject(new Error("network error")))

    const service = new LoginService()
    expect(await service.refreshToken("some.jwt.token")).toBe(null)
  })

  test("should default refreshToken to empty string when missing", async () => {
    const response: TokenCheckResponse = {
      status: true,
      userInfo: {
        accessToken: "access-only",
        nationalCode: "CN",
        realName: "false",
      },
    }
    httpClient.get = mock(() => Promise.resolve({
      statusCode: 200,
      data: JSON.stringify(response),
      headers: {},
    } as HttpResponse))
    httpClient.parseJson = mock(() => response)

    const service = new LoginService()
    const result = await service.refreshToken("some.jwt.token")

    expect(result!.accessToken).toBe("access-only")
    expect(result!.refreshToken).toBe("")
  })
})
