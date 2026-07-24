import { randomUUID } from "crypto"
import fs from "fs/promises"
import path from "path"
import { Flock } from "@opencode-ai/core/util/flock"
import { Global } from "@opencode-ai/core/global"
import { LocalCrypto } from "@/security/local-crypto"
import { ANALYTICS_ACTION } from "./types"
import type {
  AiCodeAttributionEvent,
  AiSessionEvent,
  AnalyticsQueueSubmission,
  AnalyticsTransportFields,
  QueuedAnalyticsSubmission,
  TuiUsageDailyEvent,
  ToolExecution,
  ToolSummary,
} from "./types"

const ANALYTICS_FILE = "analytics.json"
const DEVICE_ID_FILE = "device-id.json"
export const ANALYTICS_SCHEMA_VERSION = 14
export const ANALYTICS_MAX_PENDING_EVENTS = 1000

export interface AnalyticsStorage {
  schemaVersion: typeof ANALYTICS_SCHEMA_VERSION
  pendingEvents: PendingAnalyticsEvent[]
  lastFlush: number
}

export type PendingAnalyticsEvent = QueuedAnalyticsSubmission & {
  queueId: string
  sealed: boolean
}

function getAnalyticsDir(): string {
  return path.join(Global.Path.data, "analytics")
}

function getAnalyticsFilePath(): string {
  return path.join(getAnalyticsDir(), ANALYTICS_FILE)
}

function storageLock(): string {
  return `analytics:${getAnalyticsFilePath()}`
}

function createStorage(): AnalyticsStorage {
  return {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    pendingEvents: [],
    lastFlush: Date.now(),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value)
  return actual.length === expected.length && actual.every((key) => expected.includes(key))
}

function isToolSummary(value: unknown): value is ToolSummary {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["name", "count"]) &&
    typeof value.name === "string" &&
    typeof value.count === "number"
  )
}

function isToolExecution(value: unknown): value is ToolExecution {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["toolName", "duration", "isSuccess", "timestamp"]) &&
    typeof value.toolName === "string" &&
    typeof value.duration === "number" &&
    typeof value.isSuccess === "boolean" &&
    typeof value.timestamp === "number"
  )
}

function isAiSessionEvent(value: unknown): value is AiSessionEvent {
  if (!isRecord(value)) return false
  if (
    !hasExactKeys(value, [
      "sourceType",
      "sourceVersion",
      "os_arch",
      "os_name",
      "os_version",
      "providerId",
      "modelId",
      "sessionid",
      "messageId",
      "agentName",
      "projectId",
      "bundleName",
      "modifiedFileCount",
      "totalAdditions",
      "totalDeletions",
      "operations",
      "toolExecutions",
      "totalElapsed",
      "firstResultElapsed",
    ])
  )
    return false

  const operations = value.operations
  if (
    !isRecord(operations) ||
    !hasExactKeys(operations, ["builtinTools", "mcpTools", "skillTools"]) ||
    !Array.isArray(operations.builtinTools) ||
    !operations.builtinTools.every(isToolSummary) ||
    !Array.isArray(operations.mcpTools) ||
    !operations.mcpTools.every(isToolSummary) ||
    !Array.isArray(operations.skillTools) ||
    !operations.skillTools.every(isToolSummary)
  )
    return false

  return (
    value.sourceType === "DevEco-Code-Cli" &&
    typeof value.sourceVersion === "string" &&
    typeof value.os_arch === "string" &&
    typeof value.os_name === "string" &&
    typeof value.os_version === "string" &&
    typeof value.providerId === "string" &&
    typeof value.modelId === "string" &&
    typeof value.sessionid === "string" &&
    typeof value.messageId === "string" &&
    typeof value.agentName === "string" &&
    typeof value.projectId === "string" &&
    typeof value.bundleName === "string" &&
    typeof value.modifiedFileCount === "number" &&
    typeof value.totalAdditions === "number" &&
    typeof value.totalDeletions === "number" &&
    Array.isArray(value.toolExecutions) &&
    value.toolExecutions.every(isToolExecution) &&
    typeof value.totalElapsed === "number" &&
    typeof value.firstResultElapsed === "number"
  )
}

function isAnalyticsTransportFields(value: unknown): value is AnalyticsTransportFields {
  return isRecord(value) && typeof value.uid === "string"
}

function isTuiUsageDailyEvent(value: unknown): value is TuiUsageDailyEvent {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["sourceType", "sourceVersion", "os_arch", "os_name", "os_version", "statDate", "isStartup"]) &&
    value.sourceType === "DevEco-Code-Cli" &&
    typeof value.sourceVersion === "string" &&
    typeof value.os_arch === "string" &&
    typeof value.os_name === "string" &&
    typeof value.os_version === "string" &&
    typeof value.statDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value.statDate) &&
    typeof value.isStartup === "boolean"
  )
}

function isLineCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
}

function isAiCodeAttributionEvent(value: unknown): value is AiCodeAttributionEvent {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "projectId",
      "aiGeneratedLines",
      "humanGeneratedLines",
      "unknownGeneratedLines",
      "totalGeneratedLines",
    ]) ||
    typeof value.projectId !== "string" ||
    !isLineCount(value.aiGeneratedLines) ||
    !isLineCount(value.humanGeneratedLines) ||
    !isLineCount(value.unknownGeneratedLines) ||
    !isLineCount(value.totalGeneratedLines)
  )
    return false

  return (
    value.totalGeneratedLines > 0 &&
    value.totalGeneratedLines === value.aiGeneratedLines + value.humanGeneratedLines + value.unknownGeneratedLines
  )
}

function isPendingAnalyticsEvent(value: unknown): value is PendingAnalyticsEvent {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["action", "event", "uid", "queueId", "sealed"]) ||
    !isAnalyticsTransportFields(value) ||
    typeof value.queueId !== "string" ||
    typeof value.sealed !== "boolean"
  )
    return false

  if (value.action === ANALYTICS_ACTION.AI_SESSION) return isAiSessionEvent(value.event)
  if (value.action === ANALYTICS_ACTION.AI_CODE_ATTRIBUTION) return isAiCodeAttributionEvent(value.event)
  if (value.action === ANALYTICS_ACTION.TUI_USAGE) return isTuiUsageDailyEvent(value.event)
  return false
}

function createPendingEvent(submission: AnalyticsQueueSubmission): PendingAnalyticsEvent {
  return {
    ...submission,
    uid: randomUUID(),
    queueId: randomUUID(),
    sealed: false,
  }
}

function parseStorage(value: unknown): { storage: AnalyticsStorage; needsSave: boolean } {
  if (!isRecord(value)) return { storage: createStorage(), needsSave: false }
  if (value.schemaVersion !== ANALYTICS_SCHEMA_VERSION) {
    return { storage: createStorage(), needsSave: true }
  }

  const source = Array.isArray(value.pendingEvents) ? value.pendingEvents : []
  const pendingEvents = source.filter(isPendingAnalyticsEvent).slice(-ANALYTICS_MAX_PENDING_EVENTS)
  return {
    storage: {
      schemaVersion: ANALYTICS_SCHEMA_VERSION,
      pendingEvents,
      lastFlush: typeof value.lastFlush === "number" ? value.lastFlush : Date.now(),
    },
    needsSave:
      !Array.isArray(value.pendingEvents) ||
      pendingEvents.length !== source.length ||
      typeof value.lastFlush !== "number",
  }
}

async function loadStorageUnlocked(): Promise<{ storage: AnalyticsStorage; needsSave: boolean }> {
  try {
    const persisted = JSON.parse(await fs.readFile(getAnalyticsFilePath(), "utf8"))
    const encrypted = LocalCrypto.isEncryptedBlob(persisted)
    const plain = encrypted ? JSON.parse(LocalCrypto.decryptForLocalStorage(persisted)) : persisted
    const parsed = parseStorage(plain)
    return { ...parsed, needsSave: parsed.needsSave || !encrypted }
  } catch {
    return { storage: createStorage(), needsSave: false }
  }
}

async function saveStorageUnlocked(storage: AnalyticsStorage): Promise<void> {
  await fs.mkdir(getAnalyticsDir(), { recursive: true })
  const file = getAnalyticsFilePath()
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`
  const encrypted = LocalCrypto.encryptForLocalStorage(JSON.stringify(storage))
  try {
    await fs.writeFile(temporary, JSON.stringify(encrypted, null, 2), "utf8")
    await fs.rename(temporary, file)
  } finally {
    await fs.unlink(temporary).catch(() => undefined)
  }
}

async function mutateStorage<T>(fn: (storage: AnalyticsStorage) => T | Promise<T>): Promise<T> {
  return Flock.withLock(storageLock(), async () => {
    const { storage } = await loadStorageUnlocked()
    const result = await fn(storage)
    await saveStorageUnlocked(storage)
    return result
  })
}

export async function loadStorage(): Promise<AnalyticsStorage> {
  return Flock.withLock(storageLock(), async () => {
    const result = await loadStorageUnlocked()
    if (result.needsSave) await saveStorageUnlocked(result.storage)
    return result.storage
  })
}

export async function enqueuePendingEvent(submission: AnalyticsQueueSubmission): Promise<number> {
  return mutateStorage((storage) => {
    storage.pendingEvents.push(createPendingEvent(submission))
    storage.pendingEvents = storage.pendingEvents.slice(-ANALYTICS_MAX_PENDING_EVENTS)
    return storage.pendingEvents.length
  })
}

export const appendPendingEvent = enqueuePendingEvent

export async function getPendingEvents(): Promise<PendingAnalyticsEvent[]> {
  return (await loadStorage()).pendingEvents
}

export async function preparePendingBatch(limit: number): Promise<PendingAnalyticsEvent[]> {
  return mutateStorage((storage) => {
    const batch = storage.pendingEvents.slice(0, Math.max(0, limit))
    for (const pending of batch) pending.sealed = true
    return structuredClone(batch)
  })
}

export async function ackPendingEvents(uploaded: readonly PendingAnalyticsEvent[]): Promise<number> {
  return mutateStorage((storage) => {
    const queueIds = new Set(uploaded.map((event) => event.queueId))
    storage.pendingEvents = storage.pendingEvents.filter((event) => !queueIds.has(event.queueId))
    storage.lastFlush = Date.now()
    return storage.pendingEvents.length
  })
}

export async function clearPendingEvents(): Promise<void> {
  await mutateStorage((storage) => {
    storage.pendingEvents = []
    storage.lastFlush = Date.now()
  })
}

function getDeviceIdFilePath(): string {
  return path.join(Global.Path.data, DEVICE_ID_FILE)
}

export async function getOrCreateDeviceId(): Promise<string> {
  const file = getDeviceIdFilePath()
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf8"))
    if (typeof parsed.deviceId === "string" && parsed.deviceId.trim()) return parsed.deviceId
  } catch {}
  await fs.mkdir(path.dirname(file), { recursive: true })
  const deviceId = randomUUID()
  await fs.writeFile(file, JSON.stringify({ deviceId }, null, 2), "utf8")
  return deviceId
}

export function getVersion(): string {
  return typeof DEVECO_VERSION === "string" ? DEVECO_VERSION : "0.0.0"
}
