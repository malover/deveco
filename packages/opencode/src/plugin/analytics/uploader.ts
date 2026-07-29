import fs from "fs"
import path from "path"
import { Global } from "@opencode-ai/core/global"
import { LocalCrypto } from "@/security/local-crypto"
import { ACCESS_TOKEN_EXPIRES_MS, devecoAuth, saveAuthToDisk } from "../deveco"
import {
  ackPendingEvents,
  clearPendingEvents,
  enqueuePendingEvent,
  getPendingEvents,
  preparePendingBatch,
} from "./storage"
import { DEFAULT_CONFIG } from "./types"
import type { AnalyticsConfig, AnalyticsSubmission, HuaweiTracePayload, QueuedAnalyticsSubmission } from "./types"

const ANALYTICS_DIR = path.join(Global.Path.data, "analytics", "log")
const LOG_FILE = path.join(ANALYTICS_DIR, "analytics.log")

export interface UploadResult {
  success: boolean
  error?: string
}

export interface AuthInfo {
  type: string
  access?: string
  refresh?: string
  expires?: number
  key?: string
}

export interface ResolveAnalyticsAuthInput {
  authInfo: AuthInfo | undefined
  now: number
  refreshToken(): Promise<{ accessToken: string; refreshToken: string; isRealName: boolean } | null>
  saveAuth(providerID: string, info: Record<string, unknown>): Promise<void>
  diagnostic(message: string): Promise<void>
}

async function safeDiagnostic(input: ResolveAnalyticsAuthInput, message: string): Promise<void> {
  try {
    await input.diagnostic(message)
  } catch {
    // Diagnostics must never affect authentication or uploads.
  }
}

function readAuthFromDisk(providerID: string): AuthInfo | undefined {
  try {
    const authFilePath = path.join(Global.Path.data, "auth.json")
    if (!fs.existsSync(authFilePath)) return undefined
    const encrypted = JSON.parse(fs.readFileSync(authFilePath, "utf8")) as Record<string, unknown>
    const data = LocalCrypto.decryptAuthData(encrypted)
    return data[providerID] as AuthInfo | undefined
  } catch {
    return undefined
  }
}

export async function resolveAnalyticsAuth(input: ResolveAnalyticsAuthInput): Promise<string | null> {
  const authInfo = input.authInfo
  const authToken =
    authInfo?.type === "oauth" ? authInfo.access || "" : authInfo?.type === "api" ? authInfo.key || "" : ""
  const tokenExpires = authInfo?.type === "oauth" ? authInfo.expires || 0 : 0

  if (!authToken) {
    await safeDiagnostic(input, "Authentication unavailable: access token missing")
    return null
  }
  if (!tokenExpires || input.now < tokenExpires) return authToken

  await safeDiagnostic(input, "JWT refresh attempt")
  const refreshed = await input.refreshToken()
  if (!refreshed) {
    await safeDiagnostic(input, "JWT refresh failed")
    return null
  }
  await input.saveAuth("deveco", {
    type: "oauth",
    access: refreshed.accessToken,
    refresh: refreshed.refreshToken,
    expires: input.now + ACCESS_TOKEN_EXPIRES_MS,
    isRealName: refreshed.isRealName,
  })
  await safeDiagnostic(input, "JWT refresh succeeded")
  return refreshed.accessToken
}

export function toHuaweiTracePayload(
  submission: QueuedAnalyticsSubmission,
  timestamp = Date.now(),
): HuaweiTracePayload {
  return {
    action: submission.action,
    detail: JSON.stringify(submission.event),
    timestamp,
  }
}

export class AnalyticsUploader {
  private readonly config: AnalyticsConfig
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private activeUpload: AbortController | null = null
  private isUploading = false
  private retryCount = 0
  private queueLength = 0
  private queueEpoch = 0

  constructor(config: Partial<AnalyticsConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  async restorePending(): Promise<void> {
    try {
      this.queueLength = (await getPendingEvents()).length
      if (this.queueLength) await this.writeLog(`Restored ${this.queueLength} pending events from disk`)
    } catch {
      await this.writeLog("Failed to restore pending events")
    }
  }

  private async writeLog(message: string): Promise<void> {
    try {
      fs.mkdirSync(ANALYTICS_DIR, { recursive: true, mode: 0o700 })
      fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${message}\n`, {
        encoding: "utf8",
        mode: 0o600,
      })
    } catch {
      // Analytics logging must never affect the TUI.
    }
  }

  async upload(submission: AnalyticsSubmission): Promise<boolean> {
    if (!this.config.enabled) return false
    try {
      this.queueLength = await enqueuePendingEvent(submission)
      await this.writeLog(`Analytics event queued: action=${submission.action}, count=${this.queueLength}`)
    } catch {
      await this.writeLog("Failed to persist event")
      return false
    }
    if (this.queueLength >= this.config.batchSize) void this.flush()
    return true
  }

  private async resolveAuth(): Promise<string | null> {
    return resolveAnalyticsAuth({
      authInfo: readAuthFromDisk("deveco"),
      now: Date.now(),
      refreshToken: () => devecoAuth.refreshToken(),
      saveAuth: saveAuthToDisk,
      diagnostic: (message) => this.writeLog(message),
    })
  }

  private recordFailure(): void {
    this.retryCount++
    if (this.retryCount >= this.config.maxRetries) this.retryCount = 0
  }

  async flush(): Promise<UploadResult> {
    if (this.isUploading) return { success: true }
    this.isUploading = true
    const epoch = this.queueEpoch
    let controller: AbortController | null = null
    try {
      this.queueLength = (await getPendingEvents()).length
      if (!this.queueLength) return { success: true }
      if (epoch !== this.queueEpoch) return { success: true }

      const authToken = await this.resolveAuth()
      if (!authToken) {
        await this.writeLog("Authentication unavailable: queued events retained")
        return { success: false, error: "Authentication unavailable" }
      }
      if (epoch !== this.queueEpoch) return { success: true }

      const batch = await preparePendingBatch(this.config.batchSize)
      if (epoch !== this.queueEpoch || batch.length === 0) return { success: true }
      await this.writeLog(`Uploading ${batch.length} event(s)`)
      controller = new AbortController()
      this.activeUpload = controller
      if (epoch !== this.queueEpoch) {
        controller.abort()
        return { success: true }
      }
      const response = await fetch(this.config.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: authToken },
        body: JSON.stringify(batch.map((pending) => toHuaweiTracePayload(pending))),
        signal: controller.signal,
      })
      if (epoch !== this.queueEpoch) return { success: true }
      if (!response.ok) {
        this.recordFailure()
        await this.writeLog(`Upload failed: HTTP ${response.status}, ${batch.length} event(s) retained`)
        return { success: false, error: `HTTP ${response.status}` }
      }

      this.queueLength = await ackPendingEvents(batch)
      this.retryCount = 0
      await this.writeLog(`Upload succeeded: HTTP ${response.status}, ${batch.length} event(s)`)
      return { success: true }
    } catch {
      if (epoch !== this.queueEpoch || controller?.signal.aborted) return { success: true }
      this.recordFailure()
      await this.writeLog("Upload failed: unexpected error, events retained")
      return { success: false, error: "Upload failed" }
    } finally {
      if (this.activeUpload === controller) this.activeUpload = null
      this.isUploading = false
    }
  }

  getQueueLength(): number {
    return this.queueLength
  }

  async clearQueue(): Promise<void> {
    this.queueEpoch++
    this.activeUpload?.abort()
    this.queueLength = 0
    this.retryCount = 0
    await clearPendingEvents().catch(() => undefined)
  }

  startPeriodicFlush(): void {
    if (this.flushTimer) return
    this.flushTimer = setInterval(() => void this.flush(), this.config.flushInterval)
    this.flushTimer.unref?.()
  }

  stopPeriodicFlush(): void {
    if (!this.flushTimer) return
    clearInterval(this.flushTimer)
    this.flushTimer = null
  }

  async shutdown(): Promise<void> {
    this.stopPeriodicFlush()
    if (this.queueLength > 0) await this.flush()
  }
}

export const globalUploader = new AnalyticsUploader()

export async function uploadAnalyticsEvent(submission: AnalyticsSubmission): Promise<boolean> {
  return globalUploader.upload(submission)
}

export async function flushAnalyticsEvents(): Promise<UploadResult> {
  return globalUploader.flush()
}

export async function clearAnalyticsQueue(): Promise<void> {
  await globalUploader.clearQueue()
}
