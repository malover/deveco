import fs from "fs"
import path from "path"
import { Global } from "@opencode-ai/core/global"
import { LocalCrypto } from "@/security/local-crypto"
import { ACCESS_TOKEN_EXPIRES_MS, devecoAuth, saveAuthToDisk } from "../deveco"
import { redactAnalyticsEventPaths } from "./path-redaction"
import {
  ackPendingEvents,
  clearPendingEvents,
  enqueuePendingEvent,
  getAnalyticsMagpieEnabled,
  getOrCreatePathRedactionSalt,
  getPendingEvents,
  isMagpieAnalyticsEvent,
  preparePendingBatch,
  removePendingEvent,
} from "./storage"
import type { EnqueuedMagpieAnalyticsEvent, PendingMagpieAnalyticsEvent } from "./storage"
import { DEFAULT_CONFIG, MAGPIE_ANALYTICS_ACTION } from "./types"
import type { AnalyticsConfig, AnalyticsEvent, HuaweiTracePayload } from "./types"

const ANALYTICS_DIR = path.join(Global.Path.data, "analytics", "log")
const LOG_FILE = path.join(ANALYTICS_DIR, "analytics-magpie.log")

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

export interface ResolveMagpieAnalyticsAuthInput {
  authInfo: AuthInfo | undefined
  now: number
  refreshToken(): Promise<{ accessToken: string; refreshToken: string; isRealName: boolean } | null>
  saveAuth(providerID: string, info: Record<string, unknown>): Promise<void>
  diagnostic(message: string): Promise<void>
}

export interface UploaderDependencies {
  enqueuePendingEvent(event: AnalyticsEvent, maxQueueSize: number): Promise<EnqueuedMagpieAnalyticsEvent>
  removePendingEvent(queueId: string): Promise<number>
  clearPendingEvents(): Promise<void>
  getPendingEvents(): Promise<PendingMagpieAnalyticsEvent[]>
  preparePendingBatch(limit: number): Promise<PendingMagpieAnalyticsEvent[]>
  ackPendingEvents(uploaded: readonly PendingMagpieAnalyticsEvent[]): Promise<number>
  redactEvent(event: AnalyticsEvent): Promise<AnalyticsEvent>
  isEnabled(): Promise<boolean>
  getAuthToken(): Promise<string | null>
  fetch: typeof globalThis.fetch
}

async function safeDiagnostic(input: ResolveMagpieAnalyticsAuthInput, message: string): Promise<void> {
  try {
    await input.diagnostic(message)
  } catch {
    // Magpie diagnostics must never affect authentication or product behavior.
  }
}

async function writeMagpieLog(message: string): Promise<void> {
  try {
    fs.mkdirSync(ANALYTICS_DIR, { recursive: true })
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${message}\n`, "utf8")
  } catch {
    // Magpie logging must never affect the DevEco Code process.
  }
}

function readAuthFromDisk(providerID: string): AuthInfo | undefined {
  try {
    const encrypted = JSON.parse(fs.readFileSync(path.join(Global.Path.data, "auth.json"), "utf8")) as Record<
      string,
      unknown
    >
    return LocalCrypto.decryptAuthData(encrypted)[providerID] as AuthInfo | undefined
  } catch {
    return undefined
  }
}

export async function resolveMagpieAnalyticsAuth(input: ResolveMagpieAnalyticsAuthInput): Promise<string | null> {
  const authInfo = input.authInfo
  if (authInfo?.type === "api") {
    if (authInfo.key) return authInfo.key
    await safeDiagnostic(input, "Authentication unavailable: access token missing")
    return null
  }
  if (authInfo?.type !== "oauth") {
    await safeDiagnostic(input, "Authentication unavailable: access token missing")
    return null
  }

  const tokenExpires = authInfo.expires || 0
  if (authInfo.access && (!tokenExpires || input.now < tokenExpires)) return authInfo.access

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

const defaultDependencies: UploaderDependencies = {
  enqueuePendingEvent,
  removePendingEvent,
  clearPendingEvents,
  getPendingEvents,
  preparePendingBatch,
  ackPendingEvents,
  redactEvent: async (event) =>
    redactAnalyticsEventPaths(event, {
      salt: await getOrCreatePathRedactionSalt(),
    }),
  isEnabled: getAnalyticsMagpieEnabled,
  getAuthToken: () =>
    resolveMagpieAnalyticsAuth({
      authInfo: readAuthFromDisk("deveco"),
      now: Date.now(),
      refreshToken: () => devecoAuth.refreshToken(),
      saveAuth: saveAuthToDisk,
      diagnostic: writeMagpieLog,
    }),
  fetch: globalThis.fetch,
}

export function transformMagpieAnalyticsEvent(event: AnalyticsEvent, timestamp = Date.now()): HuaweiTracePayload {
  if (!isMagpieAnalyticsEvent(event)) throw new Error("Invalid Magpie analytics event")
  return {
    action: MAGPIE_ANALYTICS_ACTION,
    detail: JSON.stringify(event),
    timestamp,
  }
}

export const toHuaweiTracePayload = transformMagpieAnalyticsEvent

export class MagpieAnalyticsUploader {
  private readonly config: AnalyticsConfig
  private readonly dependencies: UploaderDependencies
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private abortController: AbortController | null = null
  private activeFlush: Promise<UploadResult> | null = null
  private enablePromise: Promise<void> | null = null
  private retryCount = 0
  private queueLength = 0
  private generation = 0
  private disabled = true
  private restored = false
  private shuttingDown = false

  constructor(config: Partial<AnalyticsConfig> = {}, dependencies: Partial<UploaderDependencies> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.dependencies = { ...defaultDependencies, ...dependencies }
  }

  private async writeLog(message: string): Promise<void> {
    await writeMagpieLog(message)
  }

  private async readEnabled(): Promise<boolean> {
    try {
      return await this.dependencies.isEnabled()
    } catch {
      await this.writeLog("Failed to read Magpie switch; using the default enabled state")
      return true
    }
  }

  async restorePending(): Promise<void> {
    try {
      this.queueLength = (await this.dependencies.getPendingEvents()).length
      this.restored = true
      if (this.queueLength) await this.writeLog(`Restored ${this.queueLength} pending event(s) from disk`)
    } catch {
      this.queueLength = 0
      await this.writeLog("Failed to restore pending events")
    }
  }

  private async activate(): Promise<void> {
    const generation = ++this.generation
    this.disabled = false
    this.shuttingDown = false
    try {
      const queueLength = (await this.dependencies.getPendingEvents()).length
      if (this.disabled || generation !== this.generation) return
      this.queueLength = queueLength
      this.restored = true
      if (queueLength) await this.writeLog(`Restored ${queueLength} pending event(s) from disk`)
      if (this.disabled || generation !== this.generation) return
      this.startPeriodicFlush()
    } catch {
      if (this.disabled || generation !== this.generation) return
      this.queueLength = 0
      await this.writeLog("Failed to restore pending events")
      this.startPeriodicFlush()
    }
  }

  async enable(): Promise<void> {
    if (!this.config.enabled) return
    if (!this.disabled && this.restored) {
      this.startPeriodicFlush()
      return
    }
    if (this.enablePromise) return this.enablePromise

    const activation = this.activate()
    this.enablePromise = activation
    try {
      await activation
    } finally {
      if (this.enablePromise === activation) this.enablePromise = null
    }
  }

  async disableAndClear(): Promise<void> {
    this.disabled = true
    this.restored = false
    this.generation++
    this.enablePromise = null
    this.stopPeriodicFlush()
    this.cancelRetry()
    this.abortController?.abort()
    this.abortController = null
    this.queueLength = 0
    this.retryCount = 0
    try {
      await this.dependencies.clearPendingEvents()
    } catch {
      await this.writeLog("Failed to clear Magpie pending events while disabling")
    }
  }

  async upload(event: AnalyticsEvent): Promise<boolean> {
    const generation = await this.admitUpload()
    if (generation === undefined || !(await this.persistEvent(event, generation))) return false
    if (this.queueLength >= this.config.batchSize) await this.flush()
    return true
  }

  private async admitUpload(): Promise<number | undefined> {
    if (!this.config.enabled || this.shuttingDown) return undefined
    const admissionGeneration = this.generation
    const enabled = await this.readEnabled()
    if (this.shuttingDown || admissionGeneration !== this.generation) return undefined
    if (!enabled) {
      await this.disableAndClear()
      return undefined
    }
    if (this.disabled) await this.enable()
    return this.disabled || this.shuttingDown ? undefined : this.generation
  }

  private async persistEvent(event: AnalyticsEvent, generation: number): Promise<boolean> {
    try {
      const redacted = await this.dependencies.redactEvent(event)
      if (this.disabled || generation !== this.generation) return false
      const enqueued = await this.dependencies.enqueuePendingEvent(redacted, this.config.maxQueueSize)
      if (this.disabled || generation !== this.generation) {
        await this.dependencies.removePendingEvent(enqueued.queueId).catch(() => undefined)
        return false
      }
      this.queueLength = enqueued.queueLength
      await this.writeLog(`Magpie event queued: count=${this.queueLength}`)
    } catch {
      await this.writeLog("Failed to redact or persist Magpie event")
      return false
    }
    return true
  }

  private cancelRetry(): void {
    if (!this.retryTimer) return
    clearTimeout(this.retryTimer)
    this.retryTimer = null
  }

  private scheduleRetry(): void {
    if (this.disabled || this.shuttingDown || this.retryTimer || this.config.maxRetries <= 0) return
    if (this.retryCount > this.config.maxRetries) {
      this.retryCount = 0
      void this.writeLog("Magpie retry limit reached; durable pending events retained for the next flush cycle")
      return
    }

    const delay = this.config.retryDelay * 2 ** Math.min(Math.max(0, this.retryCount - 1), 10)
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      if (this.disabled || this.shuttingDown) return
      void this.flush()
    }, delay)
    this.retryTimer.unref?.()
  }

  private async recordFailure(message: string): Promise<void> {
    this.retryCount++
    await this.writeLog(message)
    this.scheduleRetry()
  }

  private async flushOnce(): Promise<UploadResult> {
    if (this.disabled) return { success: true }
    if (!(await this.readEnabled())) {
      await this.disableAndClear()
      return { success: true }
    }

    const generation = this.generation
    const batch = await this.dependencies.preparePendingBatch(this.config.batchSize)
    this.queueLength = (await this.dependencies.getPendingEvents()).length
    if (!batch.length) return { success: true }

    const authToken = await this.dependencies.getAuthToken()
    if (!authToken) {
      await this.recordFailure("Authentication unavailable: Magpie pending events retained")
      return { success: false, error: "Authentication unavailable" }
    }
    if (this.disabled || generation !== this.generation) return { success: true }

    const payload = await Promise.all(
      batch.map(async (pending) => transformMagpieAnalyticsEvent(await this.dependencies.redactEvent(pending.event))),
    )
    if (this.disabled || generation !== this.generation) return { success: true }

    const controller = new AbortController()
    this.abortController = controller
    const response = await this.dependencies.fetch(this.config.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", authorization: authToken },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    if (this.abortController === controller) this.abortController = null
    if (this.disabled || generation !== this.generation) return { success: true }
    if (!response.ok) {
      await this.recordFailure(`Magpie upload failed: HTTP ${response.status}, ${batch.length} event(s) retained`)
      return { success: false, error: `HTTP ${response.status}` }
    }

    this.queueLength = await this.dependencies.ackPendingEvents(batch)
    this.retryCount = 0
    this.cancelRetry()
    await this.writeLog(`Magpie upload succeeded: HTTP ${response.status}, ${batch.length} event(s)`)
    return { success: true }
  }

  async flush(): Promise<UploadResult> {
    if (this.disabled) return { success: true }
    if (this.activeFlush) return this.activeFlush
    this.cancelRetry()

    const running = this.flushOnce().catch(async (error) => {
      if (this.disabled || (error instanceof Error && error.name === "AbortError")) return { success: true }
      const message = error instanceof Error ? error.message : String(error)
      await this.recordFailure(`Magpie upload failed: ${message}; pending events retained`)
      return { success: false, error: message }
    })
    this.activeFlush = running
    try {
      return await running
    } finally {
      if (this.activeFlush === running) this.activeFlush = null
      this.abortController = null
    }
  }

  getQueueLength(): number {
    return this.queueLength
  }

  startPeriodicFlush(): void {
    if (this.disabled || this.shuttingDown || this.flushTimer) return
    this.flushTimer = setInterval(() => {
      if (this.retryTimer) return
      void this.flush()
    }, this.config.flushInterval)
    this.flushTimer.unref?.()
  }

  stopPeriodicFlush(): void {
    if (!this.flushTimer) return
    clearInterval(this.flushTimer)
    this.flushTimer = null
  }

  async shutdown(): Promise<void> {
    this.stopPeriodicFlush()
    this.cancelRetry()
    this.shuttingDown = true
    if (this.activeFlush) {
      this.disabled = true
      this.generation++
      this.abortController?.abort()
      this.abortController = null
      return
    }
    if (!this.disabled && this.queueLength > 0) await this.flushOnce().catch(() => ({ success: false }))
    this.disabled = true
    this.generation++
    this.abortController?.abort()
    this.abortController = null
  }
}

export const globalUploader = new MagpieAnalyticsUploader()

export async function uploadAnalyticsEvent(event: AnalyticsEvent): Promise<boolean> {
  return globalUploader.upload(event)
}

export async function flushAnalyticsEvents(): Promise<UploadResult> {
  return globalUploader.flush()
}

export async function enableAnalyticsMagpie(): Promise<void> {
  return globalUploader.enable()
}

export async function disableAnalyticsMagpie(): Promise<void> {
  return globalUploader.disableAndClear()
}
