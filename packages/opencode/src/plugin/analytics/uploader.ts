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

interface AuthInfo {
  type: string
  access?: string
  refresh?: string
  expires?: number
  key?: string
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
  private isUploading = false
  private retryCount = 0
  private queueLength = 0

  constructor(config: Partial<AnalyticsConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  async restorePending(): Promise<void> {
    try {
      this.queueLength = (await getPendingEvents()).length
      if (this.queueLength) await this.writeLog(`Restored ${this.queueLength} pending events from disk`)
    } catch (error) {
      await this.writeLog(`Failed to restore pending events: ${error instanceof Error ? error.message : "unknown"}`)
    }
  }

  private async writeLog(message: string): Promise<void> {
    try {
      fs.mkdirSync(ANALYTICS_DIR, { recursive: true })
      fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${message}\n`, "utf8")
    } catch {
      // Analytics logging must never affect the TUI.
    }
  }

  async upload(submission: AnalyticsSubmission): Promise<boolean> {
    if (!this.config.enabled) return false
    try {
      this.queueLength = await enqueuePendingEvent(submission)
    } catch (error) {
      await this.writeLog(`Failed to persist event: ${error instanceof Error ? error.message : "unknown"}`)
      return false
    }
    if (this.queueLength >= this.config.batchSize) void this.flush()
    return true
  }

  private async resolveAuth(): Promise<string | null> {
    const authInfo = readAuthFromDisk("deveco")
    let authToken = ""
    let tokenExpires = 0
    let refreshToken = ""

    if (authInfo?.type === "oauth") {
      authToken = authInfo.access || ""
      tokenExpires = authInfo.expires || 0
      refreshToken = authInfo.refresh || ""
    } else if (authInfo?.type === "api") {
      authToken = authInfo.key || ""
    }

    if (!authToken) return null
    if (!tokenExpires || Date.now() < tokenExpires) return authToken
    if (!refreshToken) return null

    const refreshed = await devecoAuth.refreshToken()
    if (!refreshed) return null
    await saveAuthToDisk("deveco", {
      type: "oauth",
      access: refreshed.accessToken,
      refresh: refreshed.refreshToken,
      expires: Date.now() + ACCESS_TOKEN_EXPIRES_MS,
      isRealName: refreshed.isRealName,
    })
    return refreshed.accessToken
  }

  private recordFailure(): void {
    this.retryCount++
    if (this.retryCount >= this.config.maxRetries) this.retryCount = 0
  }

  async flush(): Promise<UploadResult> {
    if (this.isUploading) return { success: true }
    this.isUploading = true
    try {
      this.queueLength = (await getPendingEvents()).length
      if (!this.queueLength) return { success: true }

      const authToken = await this.resolveAuth()
      if (!authToken) return { success: false, error: "Authentication unavailable" }

      const batch = await preparePendingBatch(this.config.batchSize)
      const response = await fetch(this.config.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: authToken },
        body: JSON.stringify(batch.map((pending) => toHuaweiTracePayload(pending))),
      })
      if (!response.ok) {
        this.recordFailure()
        await this.writeLog(`Upload failed: HTTP ${response.status}, ${batch.length} event(s) retained`)
        return { success: false, error: `HTTP ${response.status}` }
      }

      this.queueLength = await ackPendingEvents(batch)
      this.retryCount = 0
      return { success: true }
    } catch (error) {
      this.recordFailure()
      const message = error instanceof Error ? error.message : "Upload failed"
      await this.writeLog(message)
      return { success: false, error: message }
    } finally {
      this.isUploading = false
    }
  }

  getQueueLength(): number {
    return this.queueLength
  }

  clearQueue(): void {
    this.queueLength = 0
    this.retryCount = 0
    void clearPendingEvents().catch(() => undefined)
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

export function clearAnalyticsQueue(): void {
  globalUploader.clearQueue()
}
