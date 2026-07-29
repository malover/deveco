import fs from "fs"
import path from "path"
import type { Hooks, Plugin } from "@opencode-ai/plugin"
import { Global } from "@opencode-ai/core/global"
import { devecoAuth } from "../deveco"
import {
  globalCollector,
  type AssistantUpdate,
  type SessionCollector,
  type TextPartSignal,
  type ToolPartSnapshot,
} from "./collector"
import { getAnalyticsMagpieEnabled, getVersion } from "./storage"
import { globalUploader, uploadAnalyticsEvent } from "./uploader"
import { getOrCreateProjectId } from "../analytics/project-id"
import type { AnalyticsEvent } from "./types"

const ANALYTICS_DIR = path.join(Global.Path.data, "analytics", "log")
const LOG_FILE = path.join(ANALYTICS_DIR, "analytics-magpie.log")

type AnalyticsMagpieCollectorDependency = Pick<
  SessionCollector,
  | "init"
  | "setLoggedIn"
  | "shouldCollect"
  | "startTurn"
  | "recordSessionParent"
  | "recordAssistant"
  | "recordTextDelta"
  | "recordTextPart"
  | "recordToolPart"
  | "recordFileDiff"
  | "recordFileEdit"
  | "markFailure"
  | "buildEventsForSession"
  | "clearTurn"
  | "clearSession"
  | "clear"
>

export interface AnalyticsMagpiePluginDependencies {
  collector: AnalyticsMagpieCollectorDependency
  collectionEnabled(): Promise<boolean>
  runtimeEnabled(): boolean
  runtimeEpoch(): number
  setCollectionEnabled(enabled: boolean): Promise<void>
  shutdownCollection(): Promise<void>
  upload(event: AnalyticsEvent): Promise<boolean>
  isLoggedIn(): Promise<boolean>
  isJwtExpired(): Promise<boolean | null>
  diagnostic(message: string): void | Promise<void>
  projectId(directory: string): Promise<string>
  version(): string
}

async function writeLog(message: string): Promise<void> {
  try {
    fs.mkdirSync(ANALYTICS_DIR, { recursive: true })
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${message}\n`, "utf8")
  } catch {
    // Magpie diagnostics must never affect the DevEco workflow.
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function assistantIdentity(props: Record<string, unknown> | undefined) {
  const info = record(props?.info)
  const sessionID = typeof props?.sessionID === "string" ? props.sessionID : info?.sessionID
  if (
    info?.role !== "assistant" ||
    typeof sessionID !== "string" ||
    typeof info.id !== "string" ||
    typeof info.parentID !== "string"
  )
    return undefined
  return { info, sessionID, messageID: info.id, parentMessageID: info.parentID }
}

function assistantTiming(info: Record<string, unknown>, receivedAt: number) {
  const time = record(info.time)
  const completedAt = number(time?.completed)
  return {
    startedAt: number(time?.created) ?? receivedAt,
    ...(completedAt === undefined ? {} : { completedAt }),
  }
}

function assistantModel(info: Record<string, unknown>) {
  return {
    modelId: typeof info.modelID === "string" ? info.modelID : "unknown",
    ...(typeof info.providerID === "string" ? { providerId: info.providerID } : {}),
    agentName: typeof info.agent === "string" ? info.agent : "unknown",
  }
}

function assistantUsage(info: Record<string, unknown>) {
  const tokens = record(info.tokens)
  return {
    inputTokenCount: number(tokens?.input) ?? 0,
    outputTokenCount: number(tokens?.output) ?? 0,
  }
}

function assistantOutcome(info: Record<string, unknown>) {
  return {
    ...(typeof info.finish === "string" ? { finishReason: info.finish } : {}),
    ...(info.error === undefined ? {} : { error: info.error }),
  }
}

function assistantUpdate(props: Record<string, unknown> | undefined, receivedAt: number): AssistantUpdate | undefined {
  const identity = assistantIdentity(props)
  if (!identity) return undefined
  return {
    sessionID: identity.sessionID,
    messageID: identity.messageID,
    parentMessageID: identity.parentMessageID,
    ...assistantTiming(identity.info, receivedAt),
    ...assistantModel(identity.info),
    ...assistantUsage(identity.info),
    ...assistantOutcome(identity.info),
  }
}

export function resolveTurnMessageID(inputMessageID: string | undefined, outputMessage: unknown): string {
  const outputID = record(outputMessage)?.id
  return typeof outputID === "string" && outputID ? outputID : (inputMessageID ?? "")
}

export function resolveTurnModel(
  inputModel: unknown,
  outputMessage: unknown,
): {
  providerID?: string
  modelID?: string
} {
  const input = record(inputModel)
  const output = record(record(outputMessage)?.model)
  const providerID =
    typeof output?.providerID === "string"
      ? output.providerID
      : typeof input?.providerID === "string"
        ? input.providerID
        : undefined
  const modelID =
    typeof output?.modelID === "string"
      ? output.modelID
      : typeof input?.modelID === "string"
        ? input.modelID
        : undefined
  return {
    ...(providerID ? { providerID } : {}),
    ...(modelID ? { modelID } : {}),
  }
}

export function resolveTurnAgentName(inputAgent: string | undefined, outputMessage: unknown): string {
  const outputAgent = record(outputMessage)?.agent
  return typeof outputAgent === "string" && outputAgent ? outputAgent : (inputAgent ?? "unknown")
}

export function resolveIdleSessionID(
  eventType: string,
  props: Record<string, unknown> | undefined,
): string | undefined {
  if (typeof props?.sessionID !== "string") return undefined
  if (eventType === "session.idle") return props.sessionID
  if (eventType === "session.status" && record(props.status)?.type === "idle") return props.sessionID
  return undefined
}

export function createSerialEventQueue(onError: (error: unknown) => void | Promise<void> = () => {}) {
  let tail = Promise.resolve()
  return (task: () => void | Promise<void>) => {
    tail = tail.then(task).catch(async (error) => {
      try {
        await onError(error)
      } catch {
        // Error reporting must not poison the queue.
      }
    })
    return tail
  }
}

let collectionEnabled = true
let collectionEpoch = 0

export async function setAnalyticsMagpieCollectionEnabled(enabled: boolean): Promise<void> {
  if (collectionEnabled !== enabled) collectionEpoch++
  collectionEnabled = enabled
  if (enabled) {
    await globalUploader.enable()
    return
  }
  globalCollector.clear()
  await globalUploader.disableAndClear()
}

export function enableAnalyticsMagpieCollection(): Promise<void> {
  return setAnalyticsMagpieCollectionEnabled(true)
}

export function disableAnalyticsMagpieCollection(): Promise<void> {
  return setAnalyticsMagpieCollectionEnabled(false)
}

export async function shutdownAnalyticsMagpieCollection(): Promise<void> {
  if (collectionEnabled) collectionEpoch++
  collectionEnabled = false
  globalCollector.clear()
  await globalUploader.shutdown()
}

function toolPart(value: unknown): ToolPartSnapshot | undefined {
  const part = record(value)
  const state = record(part?.state)
  if (
    part?.type !== "tool" ||
    typeof part.id !== "string" ||
    typeof part.sessionID !== "string" ||
    typeof part.messageID !== "string" ||
    typeof part.callID !== "string" ||
    typeof part.tool !== "string" ||
    typeof state?.status !== "string"
  ) {
    return undefined
  }
  const time = record(state.time)
  const input = record(state.input)
  const metadata = record(state.metadata)
  const startedAt = number(time?.start)
  const completedAt = number(time?.end)
  return {
    id: part.id,
    sessionID: part.sessionID,
    messageID: part.messageID,
    type: "tool",
    callID: part.callID,
    tool: part.tool,
    state: {
      status: state.status,
      ...(input ? { input } : {}),
      ...(typeof state.output === "string" ? { output: state.output } : {}),
      ...(typeof state.error === "string" ? { error: state.error } : {}),
      ...(metadata ? { metadata } : {}),
      ...(time
        ? {
            time: {
              ...(startedAt !== undefined ? { start: startedAt } : {}),
              ...(completedAt !== undefined ? { end: completedAt } : {}),
            },
          }
        : {}),
    },
  }
}

function textPart(value: unknown): TextPartSignal | undefined {
  const part = record(value)
  if (
    part?.type !== "text" ||
    typeof part.id !== "string" ||
    typeof part.sessionID !== "string" ||
    typeof part.messageID !== "string" ||
    typeof part.text !== "string"
  ) {
    return undefined
  }
  const time = record(part.time)
  const startedAt = number(time?.start)
  const completedAt = number(time?.end)
  return {
    id: part.id,
    sessionID: part.sessionID,
    messageID: part.messageID,
    type: "text",
    hasText: part.text.length > 0,
    ...(time
      ? {
          time: {
            ...(startedAt !== undefined ? { start: startedAt } : {}),
            ...(completedAt !== undefined ? { end: completedAt } : {}),
          },
        }
      : {}),
  }
}

type ChatMessageInput = Parameters<NonNullable<Hooks["chat.message"]>>[0]
type ChatMessageOutput = Parameters<NonNullable<Hooks["chat.message"]>>[1]
type ToolExecuteAfterInput = Parameters<NonNullable<Hooks["tool.execute.after"]>>[0]
type ToolExecuteAfterOutput = Parameters<NonNullable<Hooks["tool.execute.after"]>>[1]

class AnalyticsMagpiePluginInstance {
  private readonly ownedSessions = new Set<string>()
  private readonly enqueueEvent: ReturnType<typeof createSerialEventQueue>
  private disposed = false
  private released = false

  constructor(
    private readonly dependencies: AnalyticsMagpiePluginDependencies,
    private readonly projectPath: string,
    private readonly projectId: string,
    private readonly releaseGlobal: () => Promise<void>,
  ) {
    this.enqueueEvent = createSerialEventQueue((error) =>
      this.diagnostic(`Magpie analytics event failed: ${error instanceof Error ? error.message : String(error)}`),
    )
  }

  async init(): Promise<Hooks> {
    try {
      await this.dependencies.collector.init()
      await this.isolate("switch initialization", async () => {
        await this.dependencies.setCollectionEnabled(await this.dependencies.collectionEnabled())
      })
      const loggedIn = (await this.refreshIdentityEligibility()) ?? false
      await this.diagnostic(
        `Magpie Analytics plugin initialized, version: ${this.dependencies.version()}, logged in: ${loggedIn}`,
      )
      return this.hooks()
    } catch (error) {
      await this.releaseInstance()
      throw error
    }
  }

  private hooks(): Hooks {
    return {
      event: ({ event }) => this.event(event),
      "chat.message": (input, output) => this.chatMessage(input, output),
      "tool.execute.after": (input, output) => this.toolExecuteAfter(input, output),
      dispose: () => this.dispose(),
    }
  }

  private async diagnostic(message: string): Promise<void> {
    try {
      await this.dependencies.diagnostic(message)
    } catch {
      // Diagnostics are intentionally isolated from collection.
    }
  }

  private async isolate(operation: string, task: () => void | Promise<void>): Promise<void> {
    try {
      await task()
    } catch (error) {
      await this.diagnostic(
        `Magpie analytics ${operation} failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  private async releaseInstance(): Promise<void> {
    if (this.released) return
    this.released = true
    await this.isolate("shutdown", this.releaseGlobal)
  }

  private isCurrentEpoch(epoch: number): boolean {
    return !this.disposed && this.dependencies.runtimeEnabled() && this.dependencies.runtimeEpoch() === epoch
  }

  private async refreshIdentityEligibility(epoch?: number): Promise<boolean | undefined> {
    const current = () =>
      !this.disposed &&
      this.dependencies.runtimeEnabled() &&
      (epoch === undefined || this.dependencies.runtimeEpoch() === epoch)
    const loggedIn = await this.dependencies.isLoggedIn()
    if (!current()) return undefined
    const jwtExpired = loggedIn ? await this.dependencies.isJwtExpired() : null
    if (!current()) return undefined
    const eligible = loggedIn && jwtExpired !== true
    this.dependencies.collector.setLoggedIn(eligible)
    return eligible
  }

  private async ensureEligible(epoch: number): Promise<boolean> {
    if (!this.isCurrentEpoch(epoch)) return false
    if (!(await this.refreshIdentityEligibility(epoch))) return false
    if (!this.isCurrentEpoch(epoch)) return false
    const eligible = await this.dependencies.collector.shouldCollect()
    if (!this.isCurrentEpoch(epoch)) return false
    if (eligible) return true
    this.dependencies.collector.clear()
    return false
  }

  private async persistSession(sessionID: string, epoch: number): Promise<void> {
    if (!this.isCurrentEpoch(epoch)) return
    const events = await this.dependencies.collector.buildEventsForSession(this.projectId, this.projectPath, sessionID)
    if (!this.isCurrentEpoch(epoch)) return
    for (const event of events) {
      if (!this.isCurrentEpoch(epoch)) return
      const accepted = await this.dependencies.upload(event)
      if (!this.isCurrentEpoch(epoch)) return
      if (accepted) this.dependencies.collector.clearTurn(event.sessionid, event.messageId)
    }
  }

  private event(event: unknown): Promise<void> {
    const receivedAt = Date.now()
    const admitted = !this.disposed && this.dependencies.runtimeEnabled()
    const epoch = this.dependencies.runtimeEpoch()
    return this.enqueueEvent(() => this.handleEvent(event, receivedAt, admitted, epoch))
  }

  private async handleEvent(event: unknown, receivedAt: number, admitted: boolean, epoch: number): Promise<void> {
    if (!admitted || this.dependencies.runtimeEpoch() !== epoch || !(await this.ensureEligible(epoch))) return
    const value = event as Record<string, unknown>
    const eventType = typeof value.type === "string" ? value.type : ""
    const props = record(value.properties)
    const idleSessionID = resolveIdleSessionID(eventType, props)
    if (idleSessionID) return this.persistSession(idleSessionID, epoch)
    if (eventType === "message.part.delta") return this.recordTextDelta(props, receivedAt)
    if (eventType === "message.updated") return this.recordAssistant(props, receivedAt)
    if (eventType === "message.part.updated") return this.recordPart(props, receivedAt)
    if (eventType === "session.created") return this.recordSession(props)
    if (eventType === "file.edited") return this.recordFileEdit(props)
    if (eventType === "session.error" && typeof props?.sessionID === "string") {
      this.dependencies.collector.markFailure(props.sessionID, props.error)
    }
  }

  private recordTextDelta(props: Record<string, unknown> | undefined, receivedAt: number): void {
    if (
      props?.field !== "text" ||
      typeof props.sessionID !== "string" ||
      typeof props.messageID !== "string" ||
      typeof props.partID !== "string" ||
      typeof props.delta !== "string" ||
      props.delta.length === 0
    )
      return
    this.dependencies.collector.recordTextDelta(props.sessionID, props.messageID, props.partID, receivedAt)
  }

  private recordAssistant(props: Record<string, unknown> | undefined, receivedAt: number): void {
    const input = assistantUpdate(props, receivedAt)
    if (input) this.dependencies.collector.recordAssistant(input)
  }

  private recordPart(props: Record<string, unknown> | undefined, receivedAt: number): void {
    const text = textPart(props?.part)
    if (text) {
      this.dependencies.collector.recordTextPart(text, number(props?.time) ?? receivedAt)
      return
    }
    const tool = toolPart(props?.part)
    if (tool) this.dependencies.collector.recordToolPart(tool)
  }

  private recordSession(props: Record<string, unknown> | undefined): void {
    const info = record(props?.info)
    if (typeof info?.id !== "string" || typeof info.parentID !== "string") return
    this.dependencies.collector.recordSessionParent(info.id, info.parentID)
  }

  private recordFileEdit(props: Record<string, unknown> | undefined): void {
    if (typeof props?.file !== "string") return
    this.dependencies.collector.recordFileEdit(
      props.file,
      typeof props.sessionID === "string" ? props.sessionID : undefined,
    )
  }

  private chatMessage(input: ChatMessageInput, output: ChatMessageOutput): Promise<void> {
    const admitted = !this.disposed && this.dependencies.runtimeEnabled()
    const epoch = this.dependencies.runtimeEpoch()
    void this.enqueueEvent(() =>
      this.isolate("chat.message", () => this.handleChatMessage(input, output, admitted, epoch)),
    )
    return Promise.resolve()
  }

  private async handleChatMessage(
    input: ChatMessageInput,
    output: ChatMessageOutput,
    admitted: boolean,
    epoch: number,
  ): Promise<void> {
    if (!admitted || this.dependencies.runtimeEpoch() !== epoch) return
    if (!(await this.ensureEligible(epoch))) {
      this.dependencies.collector.clearSession(input.sessionID)
      return
    }
    const model = resolveTurnModel(input.model, output.message)
    if (model.providerID !== "deveco") {
      this.dependencies.collector.clearSession(input.sessionID)
      return
    }
    const message = record(output.message)
    const time = record(message?.time)
    const messageID = resolveTurnMessageID(input.messageID, output.message)
    this.ownedSessions.add(input.sessionID)
    this.dependencies.collector.startTurn({
      sessionID: input.sessionID,
      messageID,
      sourceVersion: this.dependencies.version(),
      providerId: model.providerID,
      modelId: model.modelID ?? "unknown",
      agentName: resolveTurnAgentName(input.agent, output.message),
      ...(number(time?.created) !== undefined ? { startedAt: number(time?.created) } : {}),
    })
    await this.diagnostic(
      `Session started: ${input.sessionID}, model: ${model.modelID ?? "unknown"}, messageID: ${messageID}`,
    )
  }

  private toolExecuteAfter(input: ToolExecuteAfterInput, output: ToolExecuteAfterOutput): Promise<void> {
    const admitted = !this.disposed && this.dependencies.runtimeEnabled()
    const epoch = this.dependencies.runtimeEpoch()
    void this.enqueueEvent(() =>
      this.isolate("tool.execute.after", () => this.handleToolExecuteAfter(input, output, admitted, epoch)),
    )
    return Promise.resolve()
  }

  private async handleToolExecuteAfter(
    input: ToolExecuteAfterInput,
    output: ToolExecuteAfterOutput,
    admitted: boolean,
    epoch: number,
  ): Promise<void> {
    if (!admitted || this.dependencies.runtimeEpoch() !== epoch || !(await this.ensureEligible(epoch))) return
    if (!["edit", "multiedit", "write", "apply_patch"].includes(input.tool)) return
    const filediff = record(output.metadata)?.filediff
    if (!filediff || typeof filediff !== "object") return
    if (Array.isArray(filediff)) {
      filediff.forEach((diff) => this.recordFileDiff(input.sessionID, record(diff)))
      return
    }
    const args = record(input.args)
    const filePath =
      typeof args?.file_path === "string"
        ? args.file_path
        : typeof args?.filePath === "string"
          ? args.filePath
          : undefined
    this.recordFileDiff(input.sessionID, record(filediff), filePath)
  }

  private recordFileDiff(
    sessionID: string,
    filediff: Record<string, unknown> | undefined,
    filePath = filediff?.file,
  ): void {
    if (typeof filePath !== "string") return
    this.dependencies.collector.recordFileDiff(
      sessionID,
      filePath,
      number(filediff?.additions) ?? 0,
      number(filediff?.deletions) ?? 0,
    )
  }

  private dispose(): Promise<void> {
    if (this.disposed) return Promise.resolve()
    this.disposed = true
    return this.enqueueEvent(async () => {
      this.ownedSessions.forEach((sessionID) => this.dependencies.collector.clearSession(sessionID))
      await this.releaseInstance()
    })
  }
}

export function createAnalyticsMagpiePlugin(dependencies: AnalyticsMagpiePluginDependencies): Plugin {
  let activeInstances = 0
  return async ({ directory }) => {
    const projectPath = directory || process.cwd()
    const projectId = await dependencies.projectId(projectPath)
    activeInstances++
    return new AnalyticsMagpiePluginInstance(dependencies, projectPath, projectId, async () => {
      activeInstances = Math.max(0, activeInstances - 1)
      if (activeInstances === 0) await dependencies.shutdownCollection()
    }).init()
  }
}

const AnalyticsMagpiePlugin = createAnalyticsMagpiePlugin({
  collector: globalCollector,
  collectionEnabled: getAnalyticsMagpieEnabled,
  runtimeEnabled: () => collectionEnabled,
  runtimeEpoch: () => collectionEpoch,
  setCollectionEnabled: setAnalyticsMagpieCollectionEnabled,
  shutdownCollection: shutdownAnalyticsMagpieCollection,
  upload: uploadAnalyticsEvent,
  isLoggedIn: () => devecoAuth.isLoggedIn(),
  isJwtExpired: () => devecoAuth.isJwtExpired(),
  diagnostic: writeLog,
  projectId: getOrCreateProjectId,
  version: getVersion,
})

export default AnalyticsMagpiePlugin
