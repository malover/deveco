import { Effect } from "effect"

async function log(effect: Effect.Effect<void>) {
  const { AppRuntime } = await import("@/effect/app-runtime")
  return AppRuntime.runPromise(effect)
}
import { loginService } from "./login-service"
import { tokenStorage } from "./token-storage"
import { loadAccessTokenFromDisk, loadIsRealNameFromDisk, saveAuthToDisk } from "./storage"
import type { DevEcoSession, LoginResult } from "./types"

export class DevEcoAuth {
  async isLoggedIn(): Promise<boolean> {
    return loginService.isLoggedIn()
  }

  async getSession(): Promise<DevEcoSession | null> {
    const userInfo = loginService.getUserInfo()
    if (userInfo) {
      const now = Date.now()
      return {
        ...userInfo,
        createdAt: now,
        expiresAt: now + 30 * 24 * 60 * 60 * 1000,
      }
    }
    const jwtToken = await tokenStorage.loadToken()
    if (jwtToken) {
      try {
        const parsed = loginService.parseJwt(jwtToken)
        if (parsed.userId) {
          // When restoring from jwtToken only (no userInfo in memory),
          // accessToken may be stored in auth.json — read it from disk
          const accessToken = loadAccessTokenFromDisk()
          return {
            userId: parsed.userId,
            userName: parsed.userName ?? "",
            accessToken,
            refreshToken: "",
            jwtToken,
            countryCode: "",
            language: "",
            isRealName: loadIsRealNameFromDisk() ?? false,
            ...(() => { const now = Date.now(); return { createdAt: now, expiresAt: now + 30 * 24 * 60 * 60 * 1000 } })(),
          }
        }
      } catch (err) {
        // ignore parse errors — session may not be available from disk token
        await log(Effect.logWarning("failed to parse jwtToken when restoring session from disk", {
          service: "deveco",
          error: err instanceof Error ? err.message : String(err),
        }))
      }
    }
    return null
  }

  async login(): Promise<LoginResult> {
    return loginService.login()
  }

  cancel(): void {
    loginService.cancel()
  }

  async logout(): Promise<void> {
    return loginService.logout()
  }

  /**
   * 检查 token 是否过期
   * @param expires 过期时间戳（毫秒）
   * @returns true 表示已过期
   */
  isTokenExpired(expires: number): boolean {
    return Date.now() >= expires
  }

  /**
   * 检查存储的 JWT token 是否已过期。
   * 用于启动时快速判断用户凭证是否失效，无需发起网络请求。
   * @returns true 表示 JWT 已过期，false 表示仍有效，null 表示未找到 token 或解析失败
   */
  async isJwtExpired(): Promise<boolean | null> {
    const jwtToken = await tokenStorage.loadToken()
    if (!jwtToken) return null
    try {
      const parsed = loginService.parseJwt(jwtToken)
      if (parsed.exp) return Date.now() >= parsed.exp * 1000
      return null
    } catch {
      return null
    }
  }

  /**
   * 刷新 accessToken
   * @returns 刷新成功返回新的 token 信息，失败返回 null
   */
  async refreshToken(): Promise<{ accessToken: string; refreshToken: string; isRealName: boolean } | null> {
    const userInfo = this.getUserInfo()
    const jwtToken = userInfo?.jwtToken ?? (await tokenStorage.loadToken())
    if (!jwtToken) return null

    // If the JWT token itself has expired, refreshing will always fail — skip the
    // HTTP request and return null so the caller can prompt re-login.
    try {
      const parsed = loginService.parseJwt(jwtToken)
      if (parsed.exp && Date.now() >= parsed.exp * 1000) {
        await log(Effect.logWarning('refreshToken skipped: JWT token has expired, user needs to re-login', { service: 'deveco' }))
        return null
      }
    } catch {
      // JWT parse failure — let the server decide if it's still valid
    }

    const newTokens = await loginService.refreshToken(jwtToken)
    if (!newTokens) return null

    if (userInfo) {
      userInfo.accessToken = newTokens.accessToken
      userInfo.refreshToken = newTokens.refreshToken
      userInfo.isRealName = newTokens.isRealName
    } else {
      // Cold start: no userInfo in memory — reconstruct from refresh response + JWT
      try {
        loginService.setUserInfoFromTokens(newTokens, jwtToken)
      } catch {
        // JWT parse failure — isRealName still available via loadIsRealNameFromDisk() or checkRealName()
      }
    }

    return newTokens
  }

  /**
   * Check real-name verification status via API.
   * Persists the result to auth.json when verified (one-way: false → true).
   * @returns true if verified, false if not, null if no token or check failed
   */
  async checkRealName(): Promise<boolean | null> {
    const jwtToken = await tokenStorage.loadToken()
    if (!jwtToken) return null
    const result = await loginService.checkRealName(jwtToken)
    if (result === true) {
      await saveAuthToDisk("deveco", { isRealName: true })
    }
    return result
  }

  private getUserInfo() {
    return loginService.getUserInfo()
  }

  /**
   * 获取当前登录用户的 userId，供 AgreementService 使用。
   * 优先从内存中的 userInfo 取，其次从持久化的 jwtToken 解析。
   * 解析失败返回 null（不抛出错误）。
   */
  async getUserId(): Promise<string | null> {
    const userInfo = this.getUserInfo()
    if (userInfo?.userId) return userInfo.userId
    const jwtToken = await tokenStorage.loadToken()
    if (!jwtToken) return null
    try {
      const parsed = loginService.parseJwt(jwtToken)
      return parsed.userId || null
    } catch (err) {
      await log(Effect.logWarning("failed to parse jwtToken for userId", { service: "deveco", error: err instanceof Error ? err.message : String(err) }))
      return null
    }
  }
}

export const devecoAuth = new DevEcoAuth()
