import fs from "node:fs/promises"
import path from "node:path"
import { realUserEnv } from "../env"
import type { CaseContext, LiveTestCase } from "../types"

const CASE_ID = "COMMAND_EXECUTION"

const testCase: LiveTestCase = {
  id: CASE_ID,
  title: "指令执行",
  category: "llm",
  priority: "P1",
  timeoutMs: 180_000,
  requires: ["huawei-auth", "real-llm", "deveco-provider"],
  description: "验证在工程目录下输入全局安装 fastify 的指令后，CLI 会通过 bash 工具执行 npm 全局安装命令。",
  steps: [
    "创建临时工程目录和最小 package.json。",
    "将 npm global prefix 和 cache 指向临时目录，避免污染用户真实全局 npm 环境。",
    "执行 deveco run --format json --dir <tmp> --dangerously-skip-permissions，发送全局安装 fastify 的 prompt。",
    "解析 stdout 中的 JSON line events。",
    "查找完成的 bash 工具事件，并验证命令为 npm 全局安装 fastify。",
  ],
  expected: [
    "deveco run 进程退出码为 0。",
    "stdout 中存在已完成的 bash tool_use event。",
    "bash 命令匹配 npm install -g fastify、npm install --global fastify、npm i -g fastify 或 Windows npm.cmd 等价形式。",
  ],
  code: "packages/opencode/test/live-e2e/cases/command-execution.case.ts",
  parallel: false,
  cleanup: "用例创建临时工程目录、npm prefix 和 cache；执行结束后删除临时目录。真实 auth/config 和全局 npm 环境不清理也不修改。",
  async run(ctx) {
    const workspace = await ctx.createTempWorkspace("command-execution-")
    const npmPrefix = path.join(workspace, ".npm-global")
    const npmCache = path.join(workspace, ".npm-cache")

    try {
      await prepareWorkspace(workspace, npmPrefix, npmCache)
      const sentMessage = installPrompt()
      const result = await runInstall(ctx, workspace, npmPrefix, npmCache, sentMessage)
      const events = parseEvents(result.stdout)
      await ctx.writeArtifact(CASE_ID, "events.jsonl", events.map((event) => JSON.stringify(event)).join("\n"))

      const command = installCommandFrom(events)
      if (!command) {
        throw new Error("No completed bash tool event executed npm global install for fastify")
      }

      return {
        sentMessage,
        receivedText: receivedTextFrom(events),
        sessionID: events.find((event) => typeof event.sessionID === "string")?.sessionID as string | undefined,
        stdout: result.stdout,
        stderr: result.stderr,
        events,
        details: {
          exitCode: result.exitCode,
          commandDurationMs: result.durationMs,
          workspace,
          npmPrefix,
          npmCache,
          command,
        },
      }
    } finally {
      await fs.rm(workspace, { recursive: true, force: true }).catch(() => undefined)
    }
  },
}

async function prepareWorkspace(workspace: string, npmPrefix: string, npmCache: string) {
  await Promise.all([
    fs.mkdir(npmPrefix, { recursive: true }),
    fs.mkdir(npmCache, { recursive: true }),
    Bun.write(path.join(workspace, ".npmrc"), `prefix=${npmPrefix}\ncache=${npmCache}\n`),
    Bun.write(
      path.join(workspace, "package.json"),
      JSON.stringify({ name: "live-e2e-command-execution", private: true }, null, 2),
    ),
  ])
}

function installPrompt() {
  return [
    "请在当前工程目录执行全局安装 fastify。",
    "只执行 `npm install -g fastify` 这一条命令。",
    "不要使用 sudo，不要执行其他命令。",
    "命令执行后简要说明结果。",
  ].join("")
}

async function runInstall(ctx: CaseContext, workspace: string, npmPrefix: string, npmCache: string, sentMessage: string) {
  const args = ["run", "--format", "json", "--dir", workspace, "--dangerously-skip-permissions"]
  const model = process.env.DEVECO_LIVE_MODEL?.trim()
  if (model) args.push("--model", model)
  args.push(sentMessage)

  const result = await ctx.runDeveco(args, {
    env: makeEnv(npmPrefix, npmCache),
    timeoutMs: 150_000,
  })
  await Promise.all([
    ctx.writeArtifact(CASE_ID, "stdout.log", result.stdout),
    ctx.writeArtifact(CASE_ID, "stderr.log", result.stderr),
  ])
  if (result.exitCode !== 0) {
    throw new Error(`deveco run exited with ${result.exitCode}\nstderr: ${result.stderr}\nstdout: ${result.stdout}`)
  }
  return result
}

function makeEnv(npmPrefix: string, npmCache: string) {
  return {
    ...realUserEnv(),
    NPM_CONFIG_PREFIX: npmPrefix,
    NPM_CONFIG_CACHE: npmCache,
  }
}

function parseEvents(stdout: string): Array<Record<string, unknown>> {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as Record<string, unknown>]
      } catch {
        return []
      }
    })
}

function partOf(event: Record<string, unknown>): Record<string, unknown> | undefined {
  const part = event.part
  if (!part || typeof part !== "object") return undefined
  return part as Record<string, unknown>
}

function bashCommand(event: Record<string, unknown>) {
  if (event.type !== "tool_use") return undefined
  const part = partOf(event)
  if (!part || part.tool !== "bash") return undefined
  const state = part.state
  if (!state || typeof state !== "object") return undefined
  const stateRecord = state as Record<string, unknown>
  if (stateRecord.status !== "completed") return undefined
  const input = stateRecord.input
  if (!input || typeof input !== "object") return undefined
  const inputRecord = input as Record<string, unknown>
  return typeof inputRecord.command === "string" ? inputRecord.command : undefined
}

function installCommandFrom(events: Array<Record<string, unknown>>) {
  return events
    .map(bashCommand)
    .filter((item): item is string => typeof item === "string")
    .find(isFastifyGlobalInstall)
}

function isFastifyGlobalInstall(command: string) {
  const tokens = command
    .replace(/["'`]/g, "")
    .split(/[\s;&|()]+/)
    .map((token) => token.trim())
    .filter(Boolean)

  if (tokens.some((token) => token.toLowerCase() === "sudo")) return false

  const npmIndex = tokens.findIndex((token) => {
    const name = (token.replace(/\\/g, "/").split("/").pop() ?? token).toLowerCase()
    return name === "npm" || name === "npm.cmd" || name === "npm.exe" || name === "npm.ps1"
  })
  if (npmIndex === -1) return false

  const args = tokens.slice(npmIndex + 1).map((token) => token.toLowerCase())
  const installIndex = args.findIndex((token) => token === "install" || token === "i")
  if (installIndex === -1) return false

  const installArgs = args.slice(installIndex + 1)
  return installArgs.includes("fastify") && (installArgs.includes("-g") || installArgs.includes("--global"))
}

function receivedTextFrom(events: Array<Record<string, unknown>>) {
  return events
    .map(textFromEvent)
    .filter((text): text is string => Boolean(text))
    .join("\n")
}

function textFromEvent(event: Record<string, unknown>) {
  const part = event.part
  if (!part || typeof part !== "object") return undefined
  if (!("text" in part) || typeof part.text !== "string") return undefined
  return part.text
}

export default testCase
