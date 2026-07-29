import { randomBytes, randomUUID } from "crypto"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { Flock } from "@opencode-ai/core/util/flock"
import { Global } from "@opencode-ai/core/global"
import { LocalCrypto } from "@/security/local-crypto"
import { Filesystem } from "@/util/filesystem"
import { MAGPIE_ANALYTICS_ACTION } from "./types"
import type {
  AnalyticsEvent,
  AssistantExecution,
  ErrorSummary,
  MagpieAnalyticsSubmission,
  ModifiedFile,
  Operations,
  ParentRef,
  ToolExecution,
  ToolSummary,
} from "./types"

const ANALYTICS_FILE = "analytics-magpie.json"
export const MAGPIE_ANALYTICS_STORAGE_SCHEMA_VERSION = 2
export const MAGPIE_ANALYTICS_MAX_PENDING_EVENTS = 1000

export interface PendingMagpieAnalyticsEvent extends MagpieAnalyticsSubmission {
  queueId: string
  sealed: boolean
}

export interface EnqueuedMagpieAnalyticsEvent {
  queueId: string
  queueLength: number
}

export interface MagpieAnalyticsStorage {
  schemaVersion: typeof MAGPIE_ANALYTICS_STORAGE_SCHEMA_VERSION
  pendingEvents: PendingMagpieAnalyticsEvent[]
  lastFlush: number
  pathRedactionSalt?: string
}

function getAnalyticsFilePath(): string {
  return path.join(Global.Path.data, "analytics", ANALYTICS_FILE)
}

function storageLock(): string {
  return `analytics-magpie:${getAnalyticsFilePath()}`
}

function createStorage(): MagpieAnalyticsStorage {
  return {
    schemaVersion: MAGPIE_ANALYTICS_STORAGE_SCHEMA_VERSION,
    pendingEvents: [],
    lastFlush: Date.now(),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function hasKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(value)
  return (
    required.every((key) => keys.includes(key)) && keys.every((key) => required.includes(key) || optional.includes(key))
  )
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value)
}

function isErrorSummary(value: unknown): value is ErrorSummary {
  return (
    isRecord(value) &&
    hasKeys(value, ["message"], ["errorType", "retryable"]) &&
    typeof value.message === "string" &&
    (value.errorType === undefined || typeof value.errorType === "string") &&
    (value.retryable === undefined || typeof value.retryable === "boolean")
  )
}

function isParentRef(value: unknown): value is ParentRef {
  return (
    isRecord(value) &&
    hasKeys(value, ["sessionId", "assistantMessageId", "toolPartId"]) &&
    typeof value.sessionId === "string" &&
    typeof value.assistantMessageId === "string" &&
    typeof value.toolPartId === "string"
  )
}

function isModifiedFile(value: unknown): value is ModifiedFile {
  return (
    isRecord(value) &&
    hasKeys(value, ["fileName", "additions", "deletions"]) &&
    typeof value.fileName === "string" &&
    isNonNegativeNumber(value.additions) &&
    isNonNegativeNumber(value.deletions)
  )
}

function isToolSummary(value: unknown): value is ToolSummary {
  return (
    isRecord(value) &&
    hasKeys(value, ["name", "count"]) &&
    typeof value.name === "string" &&
    isNonNegativeNumber(value.count)
  )
}

function isOperations(value: unknown): value is Operations {
  return (
    isRecord(value) &&
    hasKeys(value, ["builtinTools", "mcpTools", "skillTools"]) &&
    Array.isArray(value.builtinTools) &&
    value.builtinTools.every(isToolSummary) &&
    Array.isArray(value.mcpTools) &&
    value.mcpTools.every(isToolSummary) &&
    Array.isArray(value.skillTools) &&
    value.skillTools.every(isToolSummary)
  )
}

function isAssistantExecution(value: unknown): value is AssistantExecution {
  if (
    !isRecord(value) ||
    !hasKeys(
      value,
      [
        "messageId",
        "parentMessageId",
        "startedAt",
        "modelId",
        "agentName",
        "status",
        "inputTokenCount",
        "outputTokenCount",
      ],
      ["completedAt", "providerId", "finishReason", "error"],
    )
  )
    return false

  return (
    typeof value.messageId === "string" &&
    typeof value.parentMessageId === "string" &&
    isNonNegativeNumber(value.startedAt) &&
    (value.completedAt === undefined || isNonNegativeNumber(value.completedAt)) &&
    typeof value.modelId === "string" &&
    (value.providerId === undefined || typeof value.providerId === "string") &&
    typeof value.agentName === "string" &&
    (value.finishReason === undefined || typeof value.finishReason === "string") &&
    (value.status === "success" || value.status === "error") &&
    isNonNegativeNumber(value.inputTokenCount) &&
    isNonNegativeNumber(value.outputTokenCount) &&
    (value.error === undefined || isErrorSummary(value.error))
  )
}

function isToolExecution(value: unknown): value is ToolExecution {
  if (
    !isRecord(value) ||
    !hasKeys(
      value,
      [
        "toolName",
        "duration",
        "isSuccess",
        "timestamp",
        "partId",
        "callId",
        "assistantMessageId",
        "startedAt",
        "completedAt",
        "status",
        "statusSource",
      ],
      ["input", "exitCode", "error", "outputTail", "childSessionId", "childAgentName", "background", "truncated"],
    )
  )
    return false

  return (
    typeof value.toolName === "string" &&
    isNonNegativeNumber(value.duration) &&
    typeof value.isSuccess === "boolean" &&
    isNonNegativeNumber(value.timestamp) &&
    typeof value.partId === "string" &&
    typeof value.callId === "string" &&
    typeof value.assistantMessageId === "string" &&
    isNonNegativeNumber(value.startedAt) &&
    isNonNegativeNumber(value.completedAt) &&
    (value.status === "success" || value.status === "error") &&
    (value.statusSource === "tool_state" ||
      value.statusSource === "exit_code" ||
      value.statusSource === "explicit_error") &&
    (value.input === undefined || isRecord(value.input)) &&
    (value.exitCode === undefined || isInteger(value.exitCode)) &&
    (value.error === undefined || isErrorSummary(value.error)) &&
    (value.outputTail === undefined || typeof value.outputTail === "string") &&
    (value.childSessionId === undefined || typeof value.childSessionId === "string") &&
    (value.childAgentName === undefined || typeof value.childAgentName === "string") &&
    (value.background === undefined || typeof value.background === "boolean") &&
    (value.truncated === undefined || typeof value.truncated === "boolean")
  )
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  )
}

const ANALYTICS_EVENT_REQUIRED_KEYS = [
  "analyticsSchemaVersion",
  "analyticsStream",
  "pathRedactionVersion",
  "pathRedactionMode",
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
  "inputTokenCount",
  "outputTokenCount",
  "projectId",
  "bundleName",
  "modifiedFileList",
  "operations",
  "toolExecutions",
  "isSuccess",
  "totalElapsed",
  "firstResultElapsed",
  "startedAt",
  "assistantExecutions",
] as const
const ANALYTICS_EVENT_OPTIONAL_KEYS = ["parentSessionId", "parentRef", "sessionError"] as const

export function isMagpieAnalyticsEvent(value: unknown): value is AnalyticsEvent {
  if (!isRecord(value) || !hasKeys(value, ANALYTICS_EVENT_REQUIRED_KEYS, ANALYTICS_EVENT_OPTIONAL_KEYS)) return false
  return hasValidAnalyticsMetadata(value) && hasValidAnalyticsDetails(value)
}

function hasValidAnalyticsMetadata(value: Record<string, unknown>): boolean {
  return (
    value.analyticsSchemaVersion === 2 &&
    value.analyticsStream === "magpie" &&
    value.pathRedactionVersion === 1 &&
    value.pathRedactionMode === "hmac-sha256-installation" &&
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
    isNonNegativeNumber(value.inputTokenCount) &&
    isNonNegativeNumber(value.outputTokenCount) &&
    isUuid(value.projectId) &&
    typeof value.bundleName === "string"
  )
}

function hasValidAnalyticsDetails(value: Record<string, unknown>): boolean {
  return (
    Array.isArray(value.modifiedFileList) &&
    value.modifiedFileList.every(isModifiedFile) &&
    isOperations(value.operations) &&
    Array.isArray(value.toolExecutions) &&
    value.toolExecutions.every(isToolExecution) &&
    typeof value.isSuccess === "boolean" &&
    isNonNegativeNumber(value.totalElapsed) &&
    isNonNegativeNumber(value.firstResultElapsed) &&
    isNonNegativeNumber(value.startedAt) &&
    (value.parentSessionId === undefined || typeof value.parentSessionId === "string") &&
    (value.parentRef === undefined || isParentRef(value.parentRef)) &&
    Array.isArray(value.assistantExecutions) &&
    value.assistantExecutions.every(isAssistantExecution) &&
    (value.sessionError === undefined || isErrorSummary(value.sessionError))
  )
}

function isPendingEvent(value: unknown): value is PendingMagpieAnalyticsEvent {
  return (
    isRecord(value) &&
    hasKeys(value, ["action", "event", "queueId", "sealed"]) &&
    value.action === MAGPIE_ANALYTICS_ACTION &&
    isMagpieAnalyticsEvent(value.event) &&
    typeof value.queueId === "string" &&
    !!value.queueId &&
    typeof value.sealed === "boolean"
  )
}

function parseStorage(value: unknown): { storage: MagpieAnalyticsStorage; needsSave: boolean } {
  if (!isRecord(value)) return { storage: createStorage(), needsSave: false }
  if (value.schemaVersion !== MAGPIE_ANALYTICS_STORAGE_SCHEMA_VERSION) {
    return { storage: createStorage(), needsSave: true }
  }
  if (
    !hasKeys(value, ["schemaVersion", "pendingEvents", "lastFlush"], ["pathRedactionSalt"]) ||
    !Array.isArray(value.pendingEvents)
  )
    return { storage: createStorage(), needsSave: true }

  const pendingEvents = value.pendingEvents.filter(isPendingEvent).slice(-MAGPIE_ANALYTICS_MAX_PENDING_EVENTS)
  const pathRedactionSalt =
    typeof value.pathRedactionSalt === "string" && /^[a-f0-9]{64}$/.test(value.pathRedactionSalt)
      ? value.pathRedactionSalt
      : undefined
  return {
    storage: {
      schemaVersion: MAGPIE_ANALYTICS_STORAGE_SCHEMA_VERSION,
      pendingEvents,
      lastFlush: isNonNegativeNumber(value.lastFlush) ? value.lastFlush : Date.now(),
      ...(pathRedactionSalt ? { pathRedactionSalt } : {}),
    },
    needsSave:
      pendingEvents.length !== value.pendingEvents.length ||
      !isNonNegativeNumber(value.lastFlush) ||
      (value.pathRedactionSalt !== undefined && !pathRedactionSalt),
  }
}

async function loadStorageUnlocked(): Promise<{ storage: MagpieAnalyticsStorage; needsSave: boolean }> {
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

async function saveStorageUnlocked(storage: MagpieAnalyticsStorage): Promise<void> {
  await fs.mkdir(path.dirname(getAnalyticsFilePath()), { recursive: true })
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

async function mutateStorage<T>(fn: (storage: MagpieAnalyticsStorage) => T | Promise<T>): Promise<T> {
  return Flock.withLock(storageLock(), async () => {
    const { storage } = await loadStorageUnlocked()
    const result = await fn(storage)
    await saveStorageUnlocked(storage)
    return result
  })
}

export async function loadStorage(): Promise<MagpieAnalyticsStorage> {
  return Flock.withLock(storageLock(), async () => {
    const result = await loadStorageUnlocked()
    if (result.needsSave) await saveStorageUnlocked(result.storage)
    return result.storage
  })
}

export async function enqueuePendingEvent(
  event: AnalyticsEvent,
  maxQueueSize = MAGPIE_ANALYTICS_MAX_PENDING_EVENTS,
): Promise<EnqueuedMagpieAnalyticsEvent> {
  if (!isMagpieAnalyticsEvent(event)) throw new Error("Invalid Magpie analytics event")
  return mutateStorage((storage) => {
    const queueId = randomUUID()
    storage.pendingEvents.push({
      action: MAGPIE_ANALYTICS_ACTION,
      event,
      queueId,
      sealed: false,
    })
    const limit = Math.min(
      Math.max(0, Number.isSafeInteger(maxQueueSize) ? maxQueueSize : MAGPIE_ANALYTICS_MAX_PENDING_EVENTS),
      MAGPIE_ANALYTICS_MAX_PENDING_EVENTS,
    )
    storage.pendingEvents = limit ? storage.pendingEvents.slice(-limit) : []
    return {
      queueId,
      queueLength: storage.pendingEvents.length,
    }
  })
}

export const appendPendingEvent = enqueuePendingEvent

export async function getPendingEvents(): Promise<PendingMagpieAnalyticsEvent[]> {
  return (await loadStorage()).pendingEvents
}

export async function preparePendingBatch(limit: number): Promise<PendingMagpieAnalyticsEvent[]> {
  return mutateStorage((storage) => {
    const batch = storage.pendingEvents.slice(0, Math.max(0, limit))
    for (const pending of batch) pending.sealed = true
    return structuredClone(batch)
  })
}

export async function ackPendingEvents(uploaded: readonly PendingMagpieAnalyticsEvent[]): Promise<number> {
  return mutateStorage((storage) => {
    const queueIds = new Set(uploaded.map((event) => event.queueId))
    storage.pendingEvents = storage.pendingEvents.filter((event) => !queueIds.has(event.queueId))
    storage.lastFlush = Date.now()
    return storage.pendingEvents.length
  })
}

export async function removePendingEvent(queueId: string): Promise<number> {
  return mutateStorage((storage) => {
    storage.pendingEvents = storage.pendingEvents.filter((event) => event.queueId !== queueId)
    return storage.pendingEvents.length
  })
}

export async function clearPendingEvents(): Promise<void> {
  await mutateStorage((storage) => {
    storage.pendingEvents = []
    storage.lastFlush = Date.now()
  })
}

export async function getOrCreatePathRedactionSalt(): Promise<string> {
  return mutateStorage((storage) => {
    const salt = storage.pathRedactionSalt || randomBytes(32).toString("hex")
    storage.pathRedactionSalt = salt
    return salt
  })
}

export async function getAnalyticsMagpieEnabled(): Promise<boolean> {
  const file = path.join(Global.Path.state, "kv.json")
  try {
    const kv = await Flock.withLock(`tui-kv:${file}`, () => Filesystem.readJson<Record<string, unknown>>(file))
    return typeof kv.analytics_magpie_enabled === "boolean" ? kv.analytics_magpie_enabled : true
  } catch {
    return true
  }
}

export function getOsArch(): string {
  return process.arch
}

export function getOsName(): string {
  return process.platform
}

export function getOsVersion(): string {
  return os.release()
}

export function getVersion(): string {
  return typeof DEVECO_VERSION === "string" ? DEVECO_VERSION : "0.0.0"
}
