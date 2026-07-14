import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test"
import type { Mock } from "bun:test"
import type { UserInfo, LoginResult, JwtPayload } from "@/plugin/deveco/types"
import { loginService } from "@/plugin/deveco/login-service"
import { tokenStorage } from "@/plugin/deveco/token-storage"

function createJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString("base64url")
  const signature = Buffer.from("fake-signature").toString("base64url")
  return `${header}.${payloadStr}.${signature}`
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

let mockLoginServiceMethods: {
  isLoggedIn: () => Promise<boolean>
  getUserInfo: () => UserInfo | null
  login: () => Promise<LoginResult>
  cancel: () => void
  logout: () => Promise<void>
  parseJwt: (token: string) => JwtPayload
  refreshToken: (jwtToken: string) => Promise<{ accessToken: string; refreshToken: string; isRealName: boolean } | null>
  setUserInfoFromTokens: (tokens: { accessToken: string; refreshToken: string; isRealName: boolean }, jwtToken: string) => void
}

let mockTokenStorageLoadToken: Mock<() => Promise<string | null>>
let mockLoadAccessTokenFromDisk: Mock<() => string>

const storage = await import("@/plugin/deveco/storage")

const { DevEcoAuth } = await import("@/plugin/deveco/auth")

const defaultParseJwt = (token: string): JwtPayload => {
  const parts = token.split(".")
  if (parts.length !== 3) throw new Error("Invalid jwtToken format")
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"))
  return { userId: payload.userId ?? "", userName: payload.userName ?? "", exp: payload.exp, iat: payload.iat }
}

const sampleUserInfo: UserInfo = {
  userId: "user-123",
  userName: "Alice",
  accessToken: "access-token-123",
  refreshToken: "refresh-token-456",
  jwtToken: createJwt({ userId: "user-123", userName: "Alice" }),
  countryCode: "CN",
  language: "zh_CN",
  isRealName: true,
}

function resetMocks() {
  mockLoginServiceMethods = {
    isLoggedIn: mock(() => Promise.resolve(false)),
    getUserInfo: mock(() => null as UserInfo | null),
    login: mock(() => Promise.resolve({ success: true } as LoginResult)),
    cancel: mock(() => {}),
    logout: mock(() => Promise.resolve()),
    parseJwt: mock(defaultParseJwt),
    refreshToken: mock(() => Promise.resolve(null)),
    setUserInfoFromTokens: mock(() => {}),
  }
  mockTokenStorageLoadToken = mock(() => Promise.resolve(null as string | null))
  mockLoadAccessTokenFromDisk = mock(() => "")
  spyOn(loginService, "isLoggedIn").mockImplementation(() => mockLoginServiceMethods.isLoggedIn())
  spyOn(loginService, "getUserInfo").mockImplementation(() => mockLoginServiceMethods.getUserInfo())
  spyOn(loginService, "login").mockImplementation(() => mockLoginServiceMethods.login())
  spyOn(loginService, "cancel").mockImplementation(() => mockLoginServiceMethods.cancel())
  spyOn(loginService, "logout").mockImplementation(() => mockLoginServiceMethods.logout())
  spyOn(loginService, "parseJwt").mockImplementation((token: string) => mockLoginServiceMethods.parseJwt(token))
  spyOn(loginService, "refreshToken").mockImplementation((jwtToken: string) =>
    mockLoginServiceMethods.refreshToken(jwtToken),
  )
  spyOn(loginService, "setUserInfoFromTokens").mockImplementation((tokens, jwtToken) =>
    mockLoginServiceMethods.setUserInfoFromTokens(tokens, jwtToken),
  )
  spyOn(tokenStorage, "loadToken").mockImplementation(() => mockTokenStorageLoadToken())
  spyOn(tokenStorage, "saveToken").mockImplementation(async () => {})
  spyOn(tokenStorage, "clearToken").mockImplementation(async () => {})
  spyOn(storage, "loadAccessTokenFromDisk").mockImplementation(() => mockLoadAccessTokenFromDisk())
  spyOn(storage, "loadIsRealNameFromDisk").mockImplementation(() => null)
}

beforeEach(resetMocks)
afterEach(() => {
  mock.restore()
})

describe("DevEcoAuth.getSession", () => {
  test("returns session from userInfo, skips token storage and disk", async () => {
    mockLoginServiceMethods.getUserInfo = mock(() => sampleUserInfo)
    const auth = new DevEcoAuth()
    const before = Date.now()
    const session = await auth.getSession()
    const after = Date.now()
    expect(session!.userId).toBe("user-123")
    expect(session!.accessToken).toBe("access-token-123")
    expect(session!.createdAt).toBeGreaterThanOrEqual(before)
    expect(session!.createdAt).toBeLessThanOrEqual(after)
    expect(session!.expiresAt - session!.createdAt).toBe(THIRTY_DAYS_MS)
    expect(mockTokenStorageLoadToken.mock.calls.length).toBe(0)
    expect(mockLoadAccessTokenFromDisk.mock.calls.length).toBe(0)
  })

  test("returns session from jwtToken + disk accessToken when userInfo is null", async () => {
    const jwtToken = createJwt({ userId: "user-from-jwt", userName: "JwtUser" })
    mockLoginServiceMethods.getUserInfo = mock(() => null)
    mockTokenStorageLoadToken = mock(() => Promise.resolve(jwtToken))
    mockLoadAccessTokenFromDisk = mock(() => "disk-access-token")
    const auth = new DevEcoAuth()
    const session = await auth.getSession()
    expect(session!.userId).toBe("user-from-jwt")
    expect(session!.userName).toBe("JwtUser")
    expect(session!.accessToken).toBe("disk-access-token")
    expect(session!.refreshToken).toBe("")
    expect(session!.countryCode).toBe("")
    expect(session!.language).toBe("")
    expect(session!.isRealName).toBe(false)
    expect(session!.expiresAt - session!.createdAt).toBe(THIRTY_DAYS_MS)
    expect(mockLoginServiceMethods.parseJwt).toHaveBeenCalledWith(jwtToken)
  })

  test("returns null when parsed userId is empty", async () => {
    const jwtToken = createJwt({ userName: "NoIdUser" })
    mockLoginServiceMethods.getUserInfo = mock(() => null)
    mockTokenStorageLoadToken = mock(() => Promise.resolve(jwtToken))
    const auth = new DevEcoAuth()
    const session = await auth.getSession()
    expect(session).toBe(null)
  })

  test("returns null when parseJwt throws", async () => {
    mockLoginServiceMethods.getUserInfo = mock(() => null)
    mockTokenStorageLoadToken = mock(() => Promise.resolve("some.jwt.token"))
    mockLoginServiceMethods.parseJwt = mock(() => {
      throw new Error("Invalid jwtToken format")
    })
    const auth = new DevEcoAuth()
    const session = await auth.getSession()
    expect(session).toBe(null)
  })

  test("returns null when no userInfo and no jwtToken in storage", async () => {
    mockLoginServiceMethods.getUserInfo = mock(() => null)
    mockTokenStorageLoadToken = mock(() => Promise.resolve(null))
    const auth = new DevEcoAuth()
    const session = await auth.getSession()
    expect(session).toBe(null)
  })
})

describe("DevEcoAuth.refreshToken", () => {
  test("updates userInfo tokens when userInfo exists and refresh succeeds", async () => {
    const userInfo: UserInfo = { ...sampleUserInfo }
    const newTokens = { accessToken: "new-access", refreshToken: "new-refresh", isRealName: true }
    mockLoginServiceMethods.getUserInfo = mock(() => userInfo)
    mockLoginServiceMethods.refreshToken = mock(() => Promise.resolve(newTokens))
    const auth = new DevEcoAuth()
    const result = await auth.refreshToken()
    expect(result).toEqual(newTokens)
    expect(userInfo.accessToken).toBe("new-access")
    expect(userInfo.refreshToken).toBe("new-refresh")
    expect(mockLoginServiceMethods.refreshToken).toHaveBeenCalledWith(userInfo.jwtToken)
  })

  test("returns null when userInfo.jwtToken is empty (no fallback to storage via ??)", async () => {
    const userInfo: UserInfo = { ...sampleUserInfo, jwtToken: "" }
    mockLoginServiceMethods.getUserInfo = mock(() => userInfo)
    const auth = new DevEcoAuth()
    const result = await auth.refreshToken()
    expect(result).toBe(null)
  })

  test("returns new tokens from storage jwtToken when userInfo is null", async () => {
    const jwtToken = createJwt({ userId: "user-2", userName: "StorageUser" })
    const newTokens = { accessToken: "new-access-2", refreshToken: "new-refresh-2", isRealName: true }
    mockLoginServiceMethods.getUserInfo = mock(() => null)
    mockTokenStorageLoadToken = mock(() => Promise.resolve(jwtToken))
    mockLoginServiceMethods.refreshToken = mock(() => Promise.resolve(newTokens))
    const auth = new DevEcoAuth()
    const result = await auth.refreshToken()
    expect(result).toEqual(newTokens)
    expect(mockLoginServiceMethods.refreshToken).toHaveBeenCalledWith(jwtToken)
  })

  test("returns null when no userInfo and no jwtToken in storage", async () => {
    mockLoginServiceMethods.getUserInfo = mock(() => null)
    mockTokenStorageLoadToken = mock(() => Promise.resolve(null))
    const auth = new DevEcoAuth()
    const result = await auth.refreshToken()
    expect(result).toBe(null)
  })

  test("does not mutate userInfo when refreshToken returns null", async () => {
    const userInfo: UserInfo = { ...sampleUserInfo }
    mockLoginServiceMethods.getUserInfo = mock(() => userInfo)
    mockLoginServiceMethods.refreshToken = mock(() => Promise.resolve(null))
    const auth = new DevEcoAuth()
    const result = await auth.refreshToken()
    expect(result).toBe(null)
    expect(userInfo.accessToken).toBe("access-token-123")
    expect(userInfo.refreshToken).toBe("refresh-token-456")
  })
})

describe("DevEcoAuth.getUserId", () => {
  test("returns userId from userInfo, skips token storage", async () => {
    mockLoginServiceMethods.getUserInfo = mock(() => sampleUserInfo)
    const auth = new DevEcoAuth()
    const result = await auth.getUserId()
    expect(result).toBe("user-123")
    expect(mockTokenStorageLoadToken.mock.calls.length).toBe(0)
  })

  test("falls through to jwtToken when userInfo.userId is empty", async () => {
    const userInfo: UserInfo = { ...sampleUserInfo, userId: "" }
    const jwtToken = createJwt({ userId: "jwt-fallback-user" })
    mockLoginServiceMethods.getUserInfo = mock(() => userInfo)
    mockTokenStorageLoadToken = mock(() => Promise.resolve(jwtToken))
    const auth = new DevEcoAuth()
    const result = await auth.getUserId()
    expect(result).toBe("jwt-fallback-user")
  })

  test("returns userId from parsed jwtToken when userInfo is null", async () => {
    const jwtToken = createJwt({ userId: "jwt-user", userName: "JwtName" })
    mockLoginServiceMethods.getUserInfo = mock(() => null)
    mockTokenStorageLoadToken = mock(() => Promise.resolve(jwtToken))
    const auth = new DevEcoAuth()
    const result = await auth.getUserId()
    expect(result).toBe("jwt-user")
    expect(mockLoginServiceMethods.parseJwt).toHaveBeenCalledWith(jwtToken)
  })

  test("returns null when no userInfo and no jwtToken in storage", async () => {
    mockLoginServiceMethods.getUserInfo = mock(() => null)
    mockTokenStorageLoadToken = mock(() => Promise.resolve(null))
    const auth = new DevEcoAuth()
    const result = await auth.getUserId()
    expect(result).toBe(null)
  })

  test("returns null when parseJwt throws", async () => {
    mockLoginServiceMethods.getUserInfo = mock(() => null)
    mockTokenStorageLoadToken = mock(() => Promise.resolve("invalid-token"))
    mockLoginServiceMethods.parseJwt = mock(() => {
      throw new Error("Invalid jwtToken format")
    })
    const auth = new DevEcoAuth()
    const result = await auth.getUserId()
    expect(result).toBe(null)
  })

  test("returns null when parsed userId is empty", async () => {
    const jwtToken = createJwt({ userName: "NoIdUser" })
    mockLoginServiceMethods.getUserInfo = mock(() => null)
    mockTokenStorageLoadToken = mock(() => Promise.resolve(jwtToken))
    const auth = new DevEcoAuth()
    const result = await auth.getUserId()
    expect(result).toBe(null)
  })
})
