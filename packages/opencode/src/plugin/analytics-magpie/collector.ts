import fs from "fs"
import path from "path"
import { redactAnalyticsEventPaths } from "./path-redaction"
import { getAnalyticsMagpieEnabled, getOrCreatePathRedactionSalt, getOsArch, getOsName, getOsVersion } from "./storage"
import type {
  AnalyticsEvent,
  AssistantExecution,
  ErrorSummary,
  ModifiedFile,
  Operations,
  ParentRef,
  SessionContext,
  ToolExecution,
} from "./types"
import { isBuiltinTool, isMcpTool, isSkillTool } from "./types"

const ERROR_MESSAGE_LIMIT = 2048
const OUTPUT_TAIL_LIMIT = 4096
const INPUT_JSON_LIMIT = 4096
const INPUT_STRING_LIMIT = 1024
const INPUT_DEPTH_LIMIT = 4
const INPUT_ENTRY_LIMIT = 30
const INPUT_ARRAY_LIMIT = 20
const SENSITIVE_FIELD = /(?:authorization|cookie|password|passwd|secret|token|api[_-]?key|private[_-]?key)/i

type TurnKey = string
type AssistantKey = string
type PartKey = string
type UnredactedAnalyticsEvent = Omit<AnalyticsEvent, "pathRedactionVersion" | "pathRedactionMode">

interface ToolLink {
  childSessionId?: string
  childAgentName?: string
  background?: boolean
}

interface CollectedTextPart {
  text: string
  order: number
  firstResponseAt?: number
}

export interface AssistantUpdate {
  sessionID: string
  messageID: string
  parentMessageID: string
  startedAt: number
  completedAt?: number
  modelId: string
  providerId?: string
  agentName: string
  finishReason?: string
  inputTokenCount?: number
  outputTokenCount?: number
  error?: unknown
}

export interface ToolPartSnapshot {
  id: string
  sessionID: string
  messageID: string
  type: "tool"
  callID: string
  tool: string
  state: {
    status: string
    input?: Record<string, unknown>
    output?: string
    error?: string
    metadata?: Record<string, unknown>
    time?: {
      start?: number
      end?: number
    }
  }
}

export interface TextPartSnapshot {
  id: string
  sessionID: string
  messageID: string
  type: "text"
  text: string
  time?: {
    start?: number
    end?: number
  }
}

export interface CollectorDependencies {
  analyticsEnabled: () => Promise<boolean>
  getPathRedactionSalt: () => Promise<string>
  getOsArch: () => string
  getOsName: () => string
  getOsVersion: () => string
}

const defaultDependencies: CollectorDependencies = {
  analyticsEnabled: getAnalyticsMagpieEnabled,
  getPathRedactionSalt: getOrCreatePathRedactionSalt,
  getOsArch,
  getOsName,
  getOsVersion,
}

function turnKey(sessionID: string, messageID: string): TurnKey {
  return `${sessionID}\u0000${messageID}`
}

function assistantKey(sessionID: string, messageID: string): AssistantKey {
  return `${sessionID}\u0000${messageID}`
}

function partKey(sessionID: string, partID: string): PartKey {
  return `${sessionID}\u0000${partID}`
}

function exists(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile()
  } catch {
    return false
  }
}

function isHarmonyProject(projectRoot: string): boolean {
  return (
    exists(path.join(projectRoot, "AppScope", "app.json5")) ||
    (exists(path.join(projectRoot, "build-profile.json5")) &&
      (exists(path.join(projectRoot, "oh-package.json5")) || exists(path.join(projectRoot, "oh-package.json"))))
  )
}

function readBundleName(projectPath: string): string {
  if (!isHarmonyProject(projectPath)) return ""
  const appJson5Path = path.join(projectPath, "AppScope", "app.json5")
  if (!exists(appJson5Path)) return ""
  try {
    const cleaned = fs
      .readFileSync(appJson5Path, "utf8")
      .replace(/\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/,(\s*[}\]])/g, "$1")
    const parsed = JSON.parse(cleaned) as Record<string, unknown>
    const app =
      typeof parsed.app === "object" && parsed.app !== null ? (parsed.app as Record<string, unknown>) : undefined
    return typeof app?.bundleName === "string" ? app.bundleName : ""
  } catch {
    return ""
  }
}

const SECRET_REDACTIONS = [
  [
    /-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)* PRIVATE KEY-----/gi,
    "[redacted private key]",
  ],
  [/\b(https?:\/{2})[^/\s:@]+:[^@/\s]+@/gi, "$1[redacted]@"],
  [/(\b(?:proxy[-_]?authorization|authorization)\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\r\n,;"']+)/gi, "$1[redacted]"],
  [/(\b(?:cookie|set-cookie)\s*:\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\r\n"']+)/gi, "$1[redacted]"],
  [/\b(?:Basic|Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, "[redacted authorization]"],
  [
    /((?:api[_-]?key|token|password|passwd|secret|cookie|set-cookie|private[_-]?key)\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)/gi,
    "$1[redacted]",
  ],
] as const

function redactString(value: string): string {
  return SECRET_REDACTIONS.reduce((redacted, [pattern, replacement]) => redacted.replace(pattern, replacement), value)
}

function headTail(value: string, limit: number): { value: string; truncated: boolean } {
  const redacted = redactString(value)
  if (redacted.length <= limit) return { value: redacted, truncated: false }
  const head = Math.floor(limit / 2)
  const tail = limit - head
  return { value: `${redacted.slice(0, head)}\n...[truncated]...\n${redacted.slice(-tail)}`, truncated: true }
}

function tail(value: string, limit: number): { value: string; truncated: boolean } {
  const redacted = redactString(value)
  if (redacted.length <= limit) return { value: redacted, truncated: false }
  return { value: `...[truncated]...\n${redacted.slice(-limit)}`, truncated: true }
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (value === null || typeof value === "boolean" || typeof value === "number") return value
  if (typeof value === "string") return headTail(value, INPUT_STRING_LIMIT).value
  if (depth >= INPUT_DEPTH_LIMIT) return "[truncated]"
  if (Array.isArray(value)) {
    const items = value.slice(0, INPUT_ARRAY_LIMIT).map((item) => sanitizeValue(item, depth + 1))
    if (value.length > INPUT_ARRAY_LIMIT) items.push(`[${value.length - INPUT_ARRAY_LIMIT} more items]`)
    return items
  }
  if (!value || typeof value !== "object") return String(value)

  const result: Record<string, unknown> = {}
  Object.entries(value)
    .slice(0, INPUT_ENTRY_LIMIT)
    .forEach(([key, item]) => {
      result[key] = SENSITIVE_FIELD.test(key) ? "[redacted]" : sanitizeValue(item, depth + 1)
    })
  const size = Object.keys(value).length
  if (size > INPUT_ENTRY_LIMIT) result._truncatedFields = size - INPUT_ENTRY_LIMIT
  return result
}

function sanitizeInput(input: Record<string, unknown> | undefined): {
  input?: Record<string, unknown>
  truncated: boolean
} {
  if (!input) return { truncated: false }
  const value = sanitizeValue(input, 0) as Record<string, unknown>
  const json = JSON.stringify(value)
  if (json.length <= INPUT_JSON_LIMIT) return { input: value, truncated: json.includes("[truncated]") }
  return {
    input: { _truncated: true, preview: headTail(json, INPUT_JSON_LIMIT).value },
    truncated: true,
  }
}

function nestedRecord(value: unknown, key: string): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return undefined
  const item = (value as Record<string, unknown>)[key]
  return item && typeof item === "object" ? (item as Record<string, unknown>) : undefined
}

export function summarizeError(value: unknown, fallback = "Unknown error"): ErrorSummary {
  if (typeof value === "string") return { message: headTail(value, ERROR_MESSAGE_LIMIT).value }
  if (!value || typeof value !== "object")
    return { message: headTail(String(value ?? fallback), ERROR_MESSAGE_LIMIT).value }

  const record = value as Record<string, unknown>
  const data = nestedRecord(record, "data")
  const message =
    (typeof record.message === "string" && record.message) ||
    (typeof data?.message === "string" && data.message) ||
    fallback
  const errorType =
    (typeof record.name === "string" && record.name) ||
    (typeof record.errorType === "string" && record.errorType) ||
    undefined
  const retryable =
    typeof record.retryable === "boolean"
      ? record.retryable
      : typeof data?.retryable === "boolean"
        ? data.retryable
        : undefined
  return {
    ...(errorType ? { errorType } : {}),
    message: headTail(message, ERROR_MESSAGE_LIMIT).value,
    ...(retryable !== undefined ? { retryable } : {}),
  }
}

function metadataNumber(metadata: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = metadata?.[key]
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function explicitMetadataError(metadata: Record<string, unknown> | undefined): unknown {
  const value = metadata?.error
  if (typeof value === "string" || (value && typeof value === "object")) return value
  return value === true ? "Tool reported an error" : undefined
}

function metadataString(metadata: Record<string, unknown> | undefined, ...keys: string[]): string | undefined {
  return keys.map((key) => metadata?.[key]).find((value): value is string => typeof value === "string")
}

function toolLink(part: ToolPartSnapshot, previous?: ToolLink): ToolLink {
  return {
    childSessionId: metadataString(part.state.metadata, "sessionId", "sessionID") ?? previous?.childSessionId,
    childAgentName:
      typeof part.state.input?.subagent_type === "string" ? part.state.input.subagent_type : previous?.childAgentName,
    background:
      typeof part.state.metadata?.background === "boolean" ? part.state.metadata.background : previous?.background,
  }
}

export function normalizeToolExecution(part: ToolPartSnapshot, cachedLink: ToolLink = {}): ToolExecution | undefined {
  if (part.state.status !== "completed" && part.state.status !== "error") return undefined

  const startedAt = typeof part.state.time?.start === "number" ? part.state.time.start : Date.now()
  const completedAt = typeof part.state.time?.end === "number" ? part.state.time.end : startedAt
  const exitCode = metadataNumber(part.state.metadata, "exit")
  const metadataError = explicitMetadataError(part.state.metadata)
  const failedByState = part.state.status === "error"
  const failedByExit = exitCode !== undefined && exitCode !== 0
  const failedByMetadata = metadataError !== undefined
  const failed = failedByState || failedByExit || failedByMetadata
  const link = toolLink(part, cachedLink)
  const safeInput = failed ? sanitizeInput(part.state.input) : { truncated: false }
  const safeOutput =
    failed && typeof part.state.output === "string" ? tail(part.state.output, OUTPUT_TAIL_LIMIT) : undefined

  const statusSource: ToolExecution["statusSource"] = failedByState
    ? "tool_state"
    : failedByExit
      ? "exit_code"
      : failedByMetadata
        ? "explicit_error"
        : "tool_state"
  const error = failedByState
    ? summarizeError(part.state.error, "Tool execution failed")
    : failedByExit
      ? { errorType: "NonZeroExit", message: `Tool exited with code ${exitCode}` }
      : failedByMetadata
        ? summarizeError(metadataError, "Tool reported an error")
        : undefined

  return {
    toolName: part.tool,
    duration: Math.max(0, completedAt - startedAt),
    isSuccess: !failed,
    timestamp: startedAt,
    partId: part.id,
    callId: part.callID,
    assistantMessageId: part.messageID,
    startedAt,
    completedAt,
    status: failed ? "error" : "success",
    statusSource,
    ...(safeInput.input ? { input: safeInput.input } : {}),
    ...(exitCode !== undefined ? { exitCode } : {}),
    ...(error ? { error } : {}),
    ...(safeOutput?.value ? { outputTail: safeOutput.value } : {}),
    ...(link.childSessionId ? { childSessionId: link.childSessionId } : {}),
    ...(link.childAgentName ? { childAgentName: link.childAgentName } : {}),
    ...(link.background !== undefined ? { background: link.background } : {}),
    ...(safeInput.truncated || safeOutput?.truncated ? { truncated: true } : {}),
  }
}

export class SessionCollector {
  private readonly dependencies: CollectorDependencies
  private readonly contexts = new Map<TurnKey, SessionContext>()
  private readonly activeTurnBySession = new Map<string, TurnKey>()
  private readonly assistantToTurn = new Map<AssistantKey, TurnKey>()
  private readonly textParts = new Map<AssistantKey, Map<string, CollectedTextPart>>()
  private readonly pendingToolParts = new Map<AssistantKey, Map<string, ToolPartSnapshot>>()
  private readonly toolLinks = new Map<PartKey, ToolLink>()
  private readonly parentBySession = new Map<string, string>()
  private readonly parentRefBySession = new Map<string, ParentRef>()
  private nextTextPartOrder = 0
  private loggedIn = false

  constructor(dependencies: Partial<CollectorDependencies> = {}) {
    this.dependencies = { ...defaultDependencies, ...dependencies }
  }

  async init(): Promise<void> {
    // The plugin boundary owns login and lifecycle state.
  }

  setLoggedIn(loggedIn: boolean): void {
    this.loggedIn = loggedIn
    if (!loggedIn) this.clear()
  }

  async shouldCollect(): Promise<boolean> {
    return this.loggedIn && (await this.dependencies.analyticsEnabled())
  }

  startTurn(input: {
    sessionID: string
    messageID: string
    sourceVersion: string
    providerId: string
    modelId: string
    agentName: string
    query: string
    startedAt?: number
  }): void {
    if (!this.loggedIn || !input.messageID) return
    const key = turnKey(input.sessionID, input.messageID)
    this.contexts.set(key, {
      sessionID: input.sessionID,
      messageId: input.messageID,
      sourceVersion: input.sourceVersion,
      providerId: input.providerId,
      modelId: input.modelId,
      agentName: input.agentName,
      query: input.query,
      startTime: input.startedAt ?? Date.now(),
      firstResponseTime: null,
      answer: "",
      inputTokens: 0,
      outputTokens: 0,
      modifiedFiles: new Map(),
      assistantExecutions: new Map(),
      toolExecutions: new Map(),
      toolCounts: new Map(),
      isSuccess: true,
      parentSessionId: this.parentBySession.get(input.sessionID),
      parentRef: this.parentRefBySession.get(input.sessionID),
    })
    this.activeTurnBySession.set(input.sessionID, key)
  }

  recordSessionParent(sessionID: string, parentSessionID: string): void {
    const canonicalParent = this.parentBySession.get(sessionID) ?? parentSessionID
    this.parentBySession.set(sessionID, canonicalParent)
    this.contexts.forEach((context) => {
      if (context.sessionID === sessionID) context.parentSessionId ??= canonicalParent
    })
  }

  recordAssistant(input: AssistantUpdate): void {
    const key = turnKey(input.sessionID, input.parentMessageID)
    const context = this.contexts.get(key)
    if (!context) return

    const previous = context.assistantExecutions.get(input.messageID)
    const error = input.error ? summarizeError(input.error, "Assistant execution failed") : undefined
    const execution: AssistantExecution = {
      messageId: input.messageID,
      parentMessageId: input.parentMessageID,
      startedAt: input.startedAt,
      ...(input.completedAt !== undefined ? { completedAt: input.completedAt } : {}),
      modelId: input.modelId,
      ...(input.providerId ? { providerId: input.providerId } : {}),
      agentName: input.agentName,
      ...(input.finishReason ? { finishReason: input.finishReason } : {}),
      status: error ? "error" : "success",
      inputTokenCount: input.inputTokenCount ?? 0,
      outputTokenCount: input.outputTokenCount ?? 0,
      ...(error ? { error } : {}),
    }
    context.inputTokens += execution.inputTokenCount - (previous?.inputTokenCount ?? 0)
    context.outputTokens += execution.outputTokenCount - (previous?.outputTokenCount ?? 0)
    context.assistantExecutions.set(input.messageID, execution)
    if (error) context.isSuccess = false

    const assistant = assistantKey(input.sessionID, input.messageID)
    this.assistantToTurn.set(assistant, key)
    this.syncTurnAnswer(key)

    const parts = this.pendingToolParts.get(assistant)
    if (!parts) return
    this.pendingToolParts.delete(assistant)
    parts.forEach((part) => this.recordToolPart(part))
  }

  recordTextDelta(
    sessionID: string,
    assistantMessageID: string,
    partID: string,
    delta: string,
    timestamp = Date.now(),
  ): void {
    if (!delta) return
    const assistant = assistantKey(sessionID, assistantMessageID)
    const part = this.getOrCreateTextPart(assistant, partID)
    part.text += delta
    part.firstResponseAt ??= timestamp
    const key = this.assistantToTurn.get(assistant)
    if (key) this.syncTurnAnswer(key)
  }

  recordTextPart(part: TextPartSnapshot, timestamp = Date.now()): void {
    const assistant = assistantKey(part.sessionID, part.messageID)
    const collected = this.getOrCreateTextPart(assistant, part.id)
    collected.text = part.text
    if (part.text && collected.firstResponseAt === undefined) {
      collected.firstResponseAt = part.time?.start ?? timestamp
    }
    const key = this.assistantToTurn.get(assistant)
    if (key) this.syncTurnAnswer(key)
  }

  recordToolPart(part: ToolPartSnapshot): void {
    const key = partKey(part.sessionID, part.id)
    const link = toolLink(part, this.toolLinks.get(key))
    this.toolLinks.set(key, link)

    if (link.childSessionId) {
      const parentRef: ParentRef = {
        sessionId: part.sessionID,
        assistantMessageId: part.messageID,
        toolPartId: part.id,
      }
      const canonicalParent = this.parentBySession.get(link.childSessionId) ?? part.sessionID
      const canonicalRef = this.parentRefBySession.get(link.childSessionId) ?? parentRef
      this.parentBySession.set(link.childSessionId, canonicalParent)
      this.parentRefBySession.set(link.childSessionId, canonicalRef)
      this.contexts.forEach((context) => {
        if (context.sessionID !== link.childSessionId) return
        context.parentSessionId ??= canonicalParent
        context.parentRef ??= canonicalRef
      })
    }

    const assistant = assistantKey(part.sessionID, part.messageID)
    const turn = this.assistantToTurn.get(assistant)
    const context = turn ? this.contexts.get(turn) : undefined
    if (!context) {
      const pending = this.pendingToolParts.get(assistant) ?? new Map<string, ToolPartSnapshot>()
      pending.set(part.id, part)
      this.pendingToolParts.set(assistant, pending)
      return
    }

    const execution = normalizeToolExecution(part, link)
    if (!execution) return
    const existing = context.toolExecutions.get(part.id)
    context.toolExecutions.set(part.id, execution)
    if (!existing) context.toolCounts.set(part.tool, (context.toolCounts.get(part.tool) ?? 0) + 1)
    if (!execution.isSuccess) context.isSuccess = false
  }

  recordFileDiff(sessionID: string, filePath: string, additions: number, deletions: number): void {
    const context = this.activeContext(sessionID)
    if (!context) return
    const existing = context.modifiedFiles.get(filePath)
    if (existing) {
      existing.additions += additions
      existing.deletions += deletions
      return
    }
    context.modifiedFiles.set(filePath, { additions, deletions })
  }

  recordFileEdit(filePath: string, sessionID?: string): void {
    const context = sessionID ? this.activeContext(sessionID) : this.onlyActiveContext()
    if (context && !context.modifiedFiles.has(filePath)) {
      context.modifiedFiles.set(filePath, { additions: 0, deletions: 0 })
    }
  }

  markFailure(sessionID: string, error?: unknown): void {
    const context = this.activeContext(sessionID)
    if (!context) return
    context.isSuccess = false
    if (error !== undefined) context.sessionError = summarizeError(error, "Session failed")
  }

  async buildEventsForSession(projectId: string, projectPath: string, sessionID: string): Promise<AnalyticsEvent[]> {
    const contexts = Array.from(this.contexts.values())
      .filter((context) => context.sessionID === sessionID)
      .sort((a, b) => a.startTime - b.startTime)
    if (contexts.length === 0) return []

    const pathRedactionSalt = await this.dependencies.getPathRedactionSalt()
    const bundleName = readBundleName(projectPath)
    return contexts.map((context) =>
      redactAnalyticsEventPaths(this.buildEvent(context, projectId, bundleName), {
        salt: pathRedactionSalt,
        projectPath,
      }),
    )
  }

  clearTurn(sessionID: string, messageID: string): void {
    const key = turnKey(sessionID, messageID)
    const context = this.contexts.get(key)
    if (!context) return

    this.contexts.delete(key)
    if (this.activeTurnBySession.get(sessionID) === key) this.activeTurnBySession.delete(sessionID)

    this.assistantToTurn.forEach((value, assistant) => {
      if (value !== key) return
      this.assistantToTurn.delete(assistant)
      this.textParts.delete(assistant)
      this.pendingToolParts.delete(assistant)
    })
    context.toolExecutions.forEach((_, partID) => this.toolLinks.delete(partKey(sessionID, partID)))
  }

  clearSession(sessionID: string): void {
    const removed = new Set<TurnKey>()
    this.contexts.forEach((context, key) => {
      if (context.sessionID !== sessionID) return
      removed.add(key)
      this.contexts.delete(key)
    })
    this.activeTurnBySession.delete(sessionID)
    this.assistantToTurn.forEach((value, key) => {
      if (removed.has(value)) this.assistantToTurn.delete(key)
    })
    Array.from(this.textParts.keys())
      .filter((key) => key.startsWith(`${sessionID}\u0000`))
      .forEach((key) => this.textParts.delete(key))
    Array.from(this.pendingToolParts.keys())
      .filter((key) => key.startsWith(`${sessionID}\u0000`))
      .forEach((key) => this.pendingToolParts.delete(key))
    Array.from(this.toolLinks.keys())
      .filter((key) => key.startsWith(`${sessionID}\u0000`))
      .forEach((key) => this.toolLinks.delete(key))
  }

  clear(): void {
    this.contexts.clear()
    this.activeTurnBySession.clear()
    this.assistantToTurn.clear()
    this.textParts.clear()
    this.pendingToolParts.clear()
    this.toolLinks.clear()
    this.parentBySession.clear()
    this.parentRefBySession.clear()
    this.nextTextPartOrder = 0
  }

  private activeContext(sessionID: string): SessionContext | undefined {
    const key = this.activeTurnBySession.get(sessionID)
    return key ? this.contexts.get(key) : undefined
  }

  private onlyActiveContext(): SessionContext | undefined {
    if (this.activeTurnBySession.size !== 1) return undefined
    const key = this.activeTurnBySession.values().next().value
    return key ? this.contexts.get(key) : undefined
  }

  private getOrCreateTextPart(assistant: AssistantKey, partID: string): CollectedTextPart {
    const parts = this.textParts.get(assistant) ?? new Map<string, CollectedTextPart>()
    if (!this.textParts.has(assistant)) this.textParts.set(assistant, parts)
    const existing = parts.get(partID)
    if (existing) return existing
    const part = { text: "", order: this.nextTextPartOrder++ }
    parts.set(partID, part)
    return part
  }

  private syncTurnAnswer(key: TurnKey): void {
    const context = this.contexts.get(key)
    if (!context) return
    const parts = Array.from(this.textParts)
      .filter(([assistant]) => this.assistantToTurn.get(assistant) === key)
      .flatMap(([, value]) => Array.from(value.values()))
      .sort((a, b) => a.order - b.order)
    context.answer = parts.map((part) => part.text).join("")
    const timestamps = parts
      .map((part) => part.firstResponseAt)
      .filter((timestamp): timestamp is number => timestamp !== undefined)
    if (timestamps.length > 0) context.firstResponseTime = Math.min(...timestamps)
  }

  private buildEvent(context: SessionContext, projectId: string, bundleName: string): UnredactedAnalyticsEvent {
    const modifiedFileList: ModifiedFile[] = Array.from(context.modifiedFiles, ([fileName, info]) => ({
      fileName,
      additions: info.additions,
      deletions: info.deletions,
    }))
    const assistantExecutions = Array.from(context.assistantExecutions.values()).sort(
      (a, b) => a.startedAt - b.startedAt || a.messageId.localeCompare(b.messageId),
    )
    const toolExecutions = Array.from(context.toolExecutions.values()).sort(
      (a, b) => a.startedAt - b.startedAt || a.partId.localeCompare(b.partId),
    )
    this.syncTurnAnswer(turnKey(context.sessionID, context.messageId))
    const totalElapsed = Math.max(0, Date.now() - context.startTime)
    const firstResultElapsed =
      context.firstResponseTime === null ? totalElapsed : Math.max(0, context.firstResponseTime - context.startTime)

    return {
      analyticsSchemaVersion: 2,
      analyticsStream: "magpie",
      sourceType: "DevEco-Code-Cli",
      sourceVersion: context.sourceVersion,
      os_arch: this.dependencies.getOsArch(),
      os_name: this.dependencies.getOsName(),
      os_version: this.dependencies.getOsVersion(),
      providerId: context.providerId,
      modelId: context.modelId,
      sessionid: context.sessionID,
      messageId: context.messageId,
      agentName: context.agentName,
      query: context.query,
      answer: context.answer,
      inputTokenCount: context.inputTokens,
      outputTokenCount: context.outputTokens,
      projectId,
      bundleName,
      modifiedFileList,
      operations: this.buildOperations(context),
      toolExecutions,
      isSuccess: context.isSuccess,
      totalElapsed,
      firstResultElapsed,
      startedAt: context.startTime,
      ...(context.parentSessionId ? { parentSessionId: context.parentSessionId } : {}),
      ...(context.parentRef ? { parentRef: context.parentRef } : {}),
      assistantExecutions,
      ...(context.sessionError ? { sessionError: context.sessionError } : {}),
    }
  }

  private buildOperations(context: SessionContext): Operations {
    const builtinTools = new Map<string, number>()
    const mcpTools = new Map<string, number>()
    const skillTools = new Map<string, number>()

    context.toolCounts.forEach((count, toolName) => {
      if (isSkillTool(toolName)) skillTools.set(toolName, count)
      else if (isMcpTool(toolName)) mcpTools.set(toolName, count)
      else if (isBuiltinTool(toolName)) builtinTools.set(toolName, count)
      else mcpTools.set(toolName, count)
    })

    return {
      builtinTools: Array.from(builtinTools, ([name, count]) => ({ name, count })),
      mcpTools: Array.from(mcpTools, ([name, count]) => ({ name, count })),
      skillTools: Array.from(skillTools, ([name, count]) => ({ name, count })),
    }
  }
}

export const globalCollector = new SessionCollector()
