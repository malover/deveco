import crypto from "crypto"
import fs from "fs"
import path from "path"
import { Flock } from "@opencode-ai/core/util/flock"
import { Global } from "@opencode-ai/core/global"
import { Filesystem } from "@/util/filesystem"
import { createEnvironmentFields } from "./events"
import type { AiSessionEvent, Operations, SessionContext } from "./types"
import { isBuiltinTool, isMcpTool, isSkillTool } from "./types"

export type SessionStart = {
  sessionID: string
  messageId: string
  sourceVersion: string
  providerId: string
  modelId: string
  agentName: string
}

interface SessionCollectorDependencies {
  analyticsEnabled(): Promise<boolean>
}

async function readAnalyticsEnabled(): Promise<boolean> {
  const file = path.join(Global.Path.state, "kv.json")
  try {
    // Use a dedicated lock key to avoid contention with the TUI KVProvider
    // which uses `tui-kv:` as its lock prefix.
    const kv = await Flock.withLock(`analytics-kv:${file}`, () => Filesystem.readJson<Record<string, unknown>>(file))
    return typeof kv.analytics_enabled === "boolean" ? kv.analytics_enabled : true
  } catch {
    return true
  }
}

const defaultDependencies: SessionCollectorDependencies = {
  analyticsEnabled: readAnalyticsEnabled,
}

function stripJson5Comments(text: string): string {
  return text.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")
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
    const raw = fs.readFileSync(appJson5Path, "utf8")
    const cleaned = stripJson5Comments(raw).replace(/,(\s*[}\]])/g, "$1")
    const parsed = JSON.parse(cleaned) as Record<string, unknown>
    const app =
      typeof parsed.app === "object" && parsed.app !== null ? (parsed.app as Record<string, unknown>) : undefined
    return typeof app?.bundleName === "string" ? app.bundleName : ""
  } catch {
    return ""
  }
}

export class SessionCollector {
  private context: SessionContext | null = null
  private loggedIn = false

  constructor(private readonly dependencies: SessionCollectorDependencies = defaultDependencies) {}

  async init(): Promise<void> {
    // Login state is set by the plugin boundary so collection has one eligibility path.
  }

  setLoggedIn(loggedIn: boolean): void {
    this.loggedIn = loggedIn
    if (!loggedIn) this.context = null
  }

  async analyticsEnabled(): Promise<boolean> {
    return this.dependencies.analyticsEnabled()
  }

  async shouldCollect(): Promise<boolean> {
    return this.loggedIn && (await this.analyticsEnabled())
  }

  startSession(input: SessionStart): void {
    if (!this.loggedIn) return
    this.context = {
      sessionID: input.sessionID,
      messageId: input.messageId,
      sourceVersion: input.sourceVersion,
      providerId: input.providerId,
      modelId: input.modelId,
      agentName: input.agentName,
      startTime: Date.now(),
      firstResponseTime: null,
      modifiedFiles: new Map(),
      toolExecutions: [],
      toolCounts: new Map(),
    }
  }

  recordResponseDelta(): void {
    if (this.context?.firstResponseTime === null) this.context.firstResponseTime = Date.now()
  }

  recordToolExecution(toolName: string, duration: number, isSuccess: boolean): void {
    if (!this.context) return
    this.context.toolExecutions.push({
      toolName,
      duration,
      isSuccess,
      timestamp: Date.now(),
    })
    this.context.toolCounts.set(toolName, (this.context.toolCounts.get(toolName) || 0) + 1)
  }

  recordFileDiff(filePath: string, additions: number, deletions: number): void {
    if (!this.context) return
    const key = this.fileKey(filePath)
    const existing = this.context.modifiedFiles.get(key)
    if (existing) {
      existing.additions += additions
      existing.deletions += deletions
      return
    }
    this.context.modifiedFiles.set(key, { additions, deletions })
  }

  recordFileEdit(filePath: string): void {
    if (!this.context) return
    const key = this.fileKey(filePath)
    if (!this.context.modifiedFiles.has(key)) this.context.modifiedFiles.set(key, { additions: 0, deletions: 0 })
  }

  getSessionID(): string | null {
    return this.context?.sessionID || null
  }

  async buildEvent(projectId: string, projectPath: string): Promise<AiSessionEvent | null> {
    if (!this.context) return null

    let totalAdditions = 0
    let totalDeletions = 0
    this.context.modifiedFiles.forEach((info) => {
      totalAdditions += info.additions
      totalDeletions += info.deletions
    })

    const totalElapsed = Date.now() - this.context.startTime
    const firstResultElapsed =
      this.context.firstResponseTime === null ? totalElapsed : this.context.firstResponseTime - this.context.startTime

    return {
      ...createEnvironmentFields(this.context.sourceVersion),
      providerId: this.context.providerId,
      modelId: this.context.modelId,
      sessionid: this.context.sessionID,
      messageId: this.context.messageId,
      agentName: this.context.agentName,
      projectId,
      bundleName: readBundleName(projectPath),
      modifiedFileCount: this.context.modifiedFiles.size,
      totalAdditions,
      totalDeletions,
      operations: this.buildOperations(),
      toolExecutions: this.context.toolExecutions,
      totalElapsed,
      firstResultElapsed,
    }
  }

  private fileKey(filePath: string): string {
    return crypto.createHash("sha256").update(path.resolve(filePath)).digest("hex")
  }

  private buildOperations(): Operations {
    const builtinTools = new Map<string, number>()
    const mcpTools = new Map<string, number>()
    const skillTools = new Map<string, number>()

    this.context?.toolCounts.forEach((count, toolName) => {
      if (isSkillTool(toolName)) skillTools.set(toolName, count)
      else if (isMcpTool(toolName)) mcpTools.set(toolName, count)
      else if (isBuiltinTool(toolName)) builtinTools.set(toolName, count)
      else mcpTools.set(toolName, count)
    })

    const summaries = (entries: Map<string, number>): { name: string; count: number }[] =>
      Array.from(entries, ([name, count]) => ({ name, count }))

    return {
      builtinTools: summaries(builtinTools),
      mcpTools: summaries(mcpTools),
      skillTools: summaries(skillTools),
    }
  }

  clear(): void {
    this.context = null
  }
}

export const globalCollector = new SessionCollector()
