import fs from "fs"
import path from "path"
import type { Hooks, Plugin } from "@opencode-ai/plugin"
import { Global } from "@opencode-ai/core/global"
import { devecoAuth } from "../deveco"
import { globalCollector } from "./collector"
import type { SessionStart } from "./collector"
import { getOrCreateProjectId } from "./project-id"
import { globalUploader } from "./uploader"
import { getVersion } from "./storage"
import { ANALYTICS_ACTION } from "./types"
import type { AiSessionEvent, AnalyticsSubmission } from "./types"

const ANALYTICS_DIR = path.join(Global.Path.data, "analytics", "log")
const LOG_FILE = path.join(ANALYTICS_DIR, "analytics.log")

interface AnalyticsCollectorDependency {
  init(): Promise<void>
  setLoggedIn(loggedIn: boolean): void
  shouldCollect(): Promise<boolean>
  startSession(input: SessionStart): void
  recordResponseDelta(): void
  recordFileEdit(filePath: string): void
  recordFileDiff(filePath: string, additions: number, deletions: number): void
  recordToolExecution(toolName: string, duration: number, isSuccess: boolean): void
  getSessionID(): string | null
  buildEvent(projectId: string, projectPath: string): Promise<AiSessionEvent | null>
  clear(): void
}

interface AnalyticsUploaderDependency {
  restorePending(): Promise<void>
  startPeriodicFlush(): void
  shutdown(): Promise<void>
  upload(submission: AnalyticsSubmission): Promise<boolean>
}

interface AnalyticsPluginDependencies {
  collector: AnalyticsCollectorDependency
  uploader: AnalyticsUploaderDependency
  isLoggedIn(): Promise<boolean>
  projectId(directory: string): Promise<string>
  version(): string
  registerSignalHandler(signal: NodeJS.Signals, handler: () => void): void
}

async function writeLog(message: string): Promise<void> {
  try {
    fs.mkdirSync(ANALYTICS_DIR, { recursive: true })
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${message}\n`, "utf8")
  } catch {
    // Analytics logging must never affect the TUI.
  }
}

export function createAnalyticsPlugin(dependencies: AnalyticsPluginDependencies): Plugin {
  return async ({ directory }) => {
    const { collector, uploader } = dependencies
    const toolStartTimes = new Map<string, number>()
    const projectPath = directory || process.cwd()
    const projectId = await dependencies.projectId(projectPath)

    const ensureEligible = async () => {
      const eligible = await collector.shouldCollect()
      if (!eligible) collector.clear()
      return eligible
    }

    await collector.init()
    const isLoggedIn = await dependencies.isLoggedIn()
    collector.setLoggedIn(isLoggedIn)

    await writeLog(`Plugin initialized, version: ${dependencies.version()}, logged in: ${isLoggedIn}`)

    await uploader.restorePending()
    uploader.startPeriodicFlush()

    const shutdownHandler = async () => {
      await uploader.shutdown()
    }
    dependencies.registerSignalHandler("SIGINT", shutdownHandler)
    dependencies.registerSignalHandler("SIGTERM", shutdownHandler)

    const hooks: Hooks = {
      event: async ({ event }) => {
        const evt = event as unknown as Record<string, unknown>
        const eventType = evt.type as string
        const props = evt.properties as Record<string, unknown> | undefined

        if (eventType === "session.idle") {
          const loggedIn = await dependencies.isLoggedIn()
          collector.setLoggedIn(loggedIn)
          if (!loggedIn) return
        }

        if (!(await ensureEligible())) return

        if (eventType === "message.part.delta" && props?.field === "text" && typeof props.delta === "string") {
          collector.recordResponseDelta()
        }

        if (eventType === "file.edited" && typeof props?.file === "string") {
          collector.recordFileEdit(props.file)
        }

        if (
          eventType === "session.idle" &&
          typeof props?.sessionID === "string" &&
          collector.getSessionID() === props.sessionID
        ) {
          const event = await collector.buildEvent(projectId, projectPath)
          if (event) {
            await uploader.upload({ action: ANALYTICS_ACTION.AI_SESSION, event })
            collector.clear()
          }
        }
      },

      "chat.message": async (input, output) => {
        const loggedIn = await dependencies.isLoggedIn()
        collector.setLoggedIn(loggedIn)
        if (!loggedIn || !(await ensureEligible())) return

        const providerId = input.model?.providerID || "unknown"
        const modelId = input.model?.modelID || "unknown"
        const agentName = input.agent || "unknown"
        collector.startSession({
          sessionID: input.sessionID,
          messageId: output.message.id,
          sourceVersion: dependencies.version(),
          providerId,
          modelId,
          agentName,
        })
        await writeLog(`Session started, provider: ${providerId}, model: ${modelId}, agent: ${agentName}`)
      },

      "tool.execute.before": async (input) => {
        if (!(await ensureEligible())) return
        toolStartTimes.set(input.callID, Date.now())
      },

      "tool.execute.after": async (input, output) => {
        if (!(await ensureEligible())) return

        const metadata = output.metadata as Record<string, unknown> | undefined
        const hasError = metadata?.error || output.output?.includes("Error") || output.output?.includes("Failed")
        const startTime = toolStartTimes.get(input.callID)
        const duration = startTime ? Date.now() - startTime : 0
        toolStartTimes.delete(input.callID)
        collector.recordToolExecution(input.tool, duration, !hasError)

        if (!["edit", "multiedit", "write", "apply_patch"].includes(input.tool) || !metadata?.filediff) return

        const filediff = metadata.filediff as Record<string, unknown> | Array<Record<string, unknown>>
        if (Array.isArray(filediff)) {
          for (const diff of filediff) {
            const filePath = diff.file
            const additions = typeof diff.additions === "number" ? diff.additions : 0
            const deletions = typeof diff.deletions === "number" ? diff.deletions : 0
            if (typeof filePath === "string") collector.recordFileDiff(filePath, additions, deletions)
          }
          return
        }

        const filePath = input.args?.file_path || input.args?.filePath
        const additions = typeof filediff.additions === "number" ? filediff.additions : 0
        const deletions = typeof filediff.deletions === "number" ? filediff.deletions : 0
        if (typeof filePath === "string") collector.recordFileDiff(filePath, additions, deletions)
      },
    }

    return hooks
  }
}

const AnalyticsPlugin = createAnalyticsPlugin({
  collector: globalCollector,
  uploader: globalUploader,
  isLoggedIn: () => devecoAuth.isLoggedIn(),
  projectId: getOrCreateProjectId,
  version: getVersion,
  registerSignalHandler: (signal, handler) => process.on(signal, handler),
})

export default AnalyticsPlugin
