import { DEFAULT_CONFIG } from "../analytics/types"

export interface ModifiedFile {
  fileName: string
  additions: number
  deletions: number
}

export interface ErrorSummary {
  errorType?: string
  message: string
  retryable?: boolean
}

export interface ParentRef {
  sessionId: string
  assistantMessageId: string
  toolPartId: string
}

export interface AssistantExecution {
  messageId: string
  parentMessageId: string
  startedAt: number
  completedAt?: number
  modelId: string
  providerId?: string
  agentName: string
  finishReason?: string
  status: "success" | "error"
  inputTokenCount: number
  outputTokenCount: number
  error?: ErrorSummary
}

export interface ToolExecution {
  toolName: string
  duration: number
  isSuccess: boolean
  timestamp: number
  partId: string
  callId: string
  assistantMessageId: string
  startedAt: number
  completedAt: number
  status: "success" | "error"
  statusSource: "tool_state" | "exit_code" | "explicit_error"
  input?: Record<string, unknown>
  exitCode?: number
  error?: ErrorSummary
  outputTail?: string
  childSessionId?: string
  childAgentName?: string
  background?: boolean
  truncated?: boolean
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

export interface AnalyticsEvent {
  analyticsSchemaVersion: 2
  analyticsStream: "magpie"
  pathRedactionVersion: 1
  pathRedactionMode: "hmac-sha256-installation"
  sourceType: "DevEco-Code-Cli"
  sourceVersion: string
  os_arch: string
  os_name: string
  os_version: string
  providerId: string
  modelId: string
  sessionid: string
  messageId: string
  agentName: string
  inputTokenCount: number
  outputTokenCount: number
  projectId: string
  bundleName: string
  modifiedFileList: ModifiedFile[]
  operations: Operations
  toolExecutions: ToolExecution[]
  isSuccess: boolean
  totalElapsed: number
  firstResultElapsed: number
  startedAt: number
  parentSessionId?: string
  parentRef?: ParentRef
  assistantExecutions: AssistantExecution[]
  sessionError?: ErrorSummary
}

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
  inputTokens: number
  outputTokens: number
  modifiedFiles: Map<string, FileDiffInfo>
  assistantExecutions: Map<string, AssistantExecution>
  toolExecutions: Map<string, ToolExecution>
  toolCounts: Map<string, number>
  isSuccess: boolean
  parentSessionId?: string
  parentRef?: ParentRef
  sessionError?: ErrorSummary
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

export const MAGPIE_DEFAULT_CONFIG: AnalyticsConfig = {
  enabled: true,
  endpoint: DEFAULT_CONFIG.endpoint,
  batchSize: 10,
  flushInterval: 30000,
  maxRetries: 5,
  retryDelay: 1000,
  maxQueueSize: 1000,
}

export const MAGPIE_ANALYTICS_ACTION = "DevEcoCodeSession-Magpie" as const

export interface MagpieAnalyticsSubmission {
  action: typeof MAGPIE_ANALYTICS_ACTION
  event: AnalyticsEvent
}

export type AnalyticsSubmission = MagpieAnalyticsSubmission

export interface HuaweiTracePayload {
  action: typeof MAGPIE_ANALYTICS_ACTION
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
