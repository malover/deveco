import HuaweiEndpoints from "../../../huawei-endpoints.json"

export interface ToolExecution {
  toolName: string
  duration: number
  isSuccess: boolean
  timestamp: number
}

export interface ToolSummary {
  name: string
  count: number
}

export interface Operations {
  builtinTools: ToolSummary[]
  mcpTools: ToolSummary[]
  skillTools: ToolSummary[]
}

export interface AnalyticsEnvironmentFields {
  sourceType: "DevEco-Code-Cli"
  sourceVersion: string
  os_arch: string
  os_name: NodeJS.Platform
  os_version: string
}

export interface AiSessionEvent extends AnalyticsEnvironmentFields {
  providerId: string
  modelId: string
  sessionid: string
  messageId: string
  agentName: string
  projectId: string
  bundleName: string
  modifiedFileCount: number
  totalAdditions: number
  totalDeletions: number
  operations: Operations
  toolExecutions: ToolExecution[]
  totalElapsed: number
  firstResultElapsed: number
}

export const ANALYTICS_ACTION = {
  AI_SESSION: "DevEcoCodeSession",
} as const

export type AnalyticsAction = (typeof ANALYTICS_ACTION)[keyof typeof ANALYTICS_ACTION]

export type AnalyticsSubmission = {
  action: typeof ANALYTICS_ACTION.AI_SESSION
  event: AiSessionEvent
}

export interface AnalyticsTransportFields {
  uid: string
}

export type AnalyticsQueueSubmission = AnalyticsSubmission
export type QueuedAnalyticsSubmission = AnalyticsSubmission & AnalyticsTransportFields

export interface FileDiffInfo {
  additions: number
  deletions: number
}

export interface SessionContext {
  sessionID: string
  messageId: string
  sourceVersion: string
  providerId: string
  modelId: string
  agentName: string
  startTime: number
  firstResponseTime: number | null
  modifiedFiles: Map<string, FileDiffInfo>
  toolExecutions: ToolExecution[]
  toolCounts: Map<string, number>
}

export interface AnalyticsConfig {
  enabled: boolean
  endpoint: string
  batchSize: number
  flushInterval: number
  maxRetries: number
  retryDelay: number
  maxQueueSize: number
}

export const DEFAULT_CONFIG: AnalyticsConfig = {
  enabled: true,
  endpoint: HuaweiEndpoints.devecoApiTraceUpload,
  batchSize: 10,
  flushInterval: 30000,
  maxRetries: 5,
  retryDelay: 1000,
  maxQueueSize: 1000,
}

export interface HuaweiTracePayload {
  action: AnalyticsAction
  detail: string
  timestamp: number
}

export const BUILTIN_TOOLS = new Set([
  "bash",
  "read",
  "write",
  "edit",
  "glob",
  "grep",
  "ls",
  "lsp",
  "plan",
  "task",
  "todo",
  "skill",
  "batch",
])

export const SKILL_TOOLS = new Set(["skill"])

export function isMcpTool(toolName: string): boolean {
  return toolName.includes("_") || toolName.startsWith("mcp_")
}

export function isSkillTool(toolName: string): boolean {
  return SKILL_TOOLS.has(toolName)
}

export function isBuiltinTool(toolName: string): boolean {
  return BUILTIN_TOOLS.has(toolName)
}
