import fs from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import stripAnsi from "strip-ansi"
import { cliEntry, realUserEnv } from "../env"
import type { CaseContext, LiveTestCase, RunCommandResult } from "../types"

const CASE_ID = "CONFIG_LOCAL_MCP"
const GLOBAL_MCP_NAME = "live-e2e-global-mcp"
const PROJECT_MCP_NAME = "live-e2e-project-mcp"
const GLOBAL_TOOL_NAME = `${GLOBAL_MCP_NAME}_echo`
const PROJECT_TOOL_NAME = `${PROJECT_MCP_NAME}_echo`
const GLOBAL_TOOL_MARKER = "GLOBAL_MCP_TOOL_OK"
const PROJECT_TOOL_MARKER = "PROJECT_MCP_TOOL_OK"
const RESPONSE_MARKER = "LOCAL_MCP_OK"

const testCase: LiveTestCase = {
  id: CASE_ID,
  title: "配置本地 MCP",
  category: "llm",
  priority: "P0",
  timeoutMs: 180_000,
  requires: ["huawei-auth", "real-llm", "deveco-provider"],
  description: "验证全局和项目 deveco.jsonc 中配置的本地 MCP 可按作用域查询，并可在真实 LLM 请求中调用其工具。",
  steps: [
    "创建临时全局配置目录、临时工程 A 和临时工程 B。",
    `在全局 deveco.jsonc 中配置本地 MCP ${GLOBAL_MCP_NAME}。`,
    `在工程 A 的 deveco.jsonc 中配置本地 MCP ${PROJECT_MCP_NAME}。`,
    "分别在工程 A 和工程 B 执行 deveco mcp list。",
    `在工程 A 发起真实请求，调用 ${GLOBAL_TOOL_NAME} 和 ${PROJECT_TOOL_NAME}。`,
    "解析 JSON line events，校验两个 MCP 工具均执行成功并返回各自 marker。",
  ],
  expected: [
    "工程 A 可查询到已连接的全局 MCP 和项目级 MCP。",
    "工程 B 仅可查询到已连接的全局 MCP，不能查询到工程 A 的项目级 MCP。",
    `请求中 ${GLOBAL_TOOL_NAME} 执行成功并返回 ${GLOBAL_TOOL_MARKER}。`,
    `请求中 ${PROJECT_TOOL_NAME} 执行成功并返回 ${PROJECT_TOOL_MARKER}。`,
    `模型最终响应包含 ${RESPONSE_MARKER}。`,
  ],
  code: "packages/opencode/test/live-e2e/cases/config-local-mcp.case.ts",
  parallel: false,
  cleanup: "执行结束后删除临时全局配置目录和两个临时工程；真实 auth/config 只读，不修改也不清理。",
  async run(ctx) {
    const globalConfigDir = await ctx.createTempWorkspace("config-local-mcp-global-")
    const projectA = await ctx.createTempWorkspace("config-local-mcp-a-")
    const projectB = await ctx.createTempWorkspace("config-local-mcp-b-")
    const globalConfigPath = path.join(globalConfigDir, "deveco.jsonc")
    const projectConfigPath = path.join(projectA, "deveco.jsonc")

    try {
      await writeConfigs(globalConfigPath, projectConfigPath)
      const env = makeEnv(globalConfigPath)
      const listings = await verifyMcpLists(ctx, env, projectA, projectB)
      const request = await verifyToolRequest(ctx, env, projectA, listings.projectAEntry)

      return {
        sentMessage: request.sentMessage,
        receivedText: request.receivedText,
        sessionID: request.events.find((event) => typeof event.sessionID === "string")?.sessionID as string | undefined,
        stdout: request.result.stdout,
        stderr: request.result.stderr,
        events: request.events,
        details: {
          projectAListExitCode: listings.projectAList.exitCode,
          projectBListExitCode: listings.projectBList.exitCode,
          requestExitCode: request.result.exitCode,
          globalMcp: GLOBAL_MCP_NAME,
          projectMcp: PROJECT_MCP_NAME,
          globalTool: GLOBAL_TOOL_NAME,
          projectTool: PROJECT_TOOL_NAME,
          globalConfigPath,
          projectConfigPath,
          projectA,
          projectB,
        },
      }
    } finally {
      await Promise.all([
        fs.rm(globalConfigDir, { recursive: true, force: true }),
        fs.rm(projectA, { recursive: true, force: true }),
        fs.rm(projectB, { recursive: true, force: true }),
      ])
    }
  },
}

async function writeConfigs(globalConfigPath: string, projectConfigPath: string) {
  await Promise.all([
    Bun.write(globalConfigPath, JSON.stringify({ mcp: { [GLOBAL_MCP_NAME]: localMcp(GLOBAL_TOOL_MARKER) } }, null, 2)),
    Bun.write(
      projectConfigPath,
      JSON.stringify({ mcp: { [PROJECT_MCP_NAME]: localMcp(PROJECT_TOOL_MARKER) } }, null, 2),
    ),
  ])
}

function localMcp(marker: string) {
  return {
    type: "local",
    command: [
      "node",
      "--input-type=module",
      "--eval",
      `
import { McpServer } from ${JSON.stringify(import.meta.resolve("@modelcontextprotocol/sdk/server/mcp.js"))}
import { StdioServerTransport } from ${JSON.stringify(import.meta.resolve("@modelcontextprotocol/sdk/server/stdio.js"))}

const marker = process.env.LIVE_E2E_MCP_MARKER
if (!marker) throw new Error("LIVE_E2E_MCP_MARKER is required")

const server = new McpServer({
  name: "live-e2e-local-mcp",
  version: "1.0.0",
})

server.registerTool(
  "echo",
  {
    description: "Return the configured live E2E MCP marker.",
  },
  async () => ({
    content: [{ type: "text", text: marker }],
  }),
)

await server.connect(new StdioServerTransport())
      `.trim(),
    ],
    environment: {
      LIVE_E2E_MCP_MARKER: marker,
    },
    timeout: 10_000,
  }
}

async function verifyMcpLists(
  ctx: CaseContext,
  env: Record<string, string | undefined>,
  projectA: string,
  projectB: string,
) {
  const [projectAEntry, projectBEntry] = await Promise.all([createProjectCliEntry(projectA), createProjectCliEntry(projectB)])
  const [projectAList, projectBList] = await Promise.all([
    ctx.runDeveco(["mcp", "list"], { env, timeoutMs: 30_000, entry: projectAEntry }),
    ctx.runDeveco(["mcp", "list"], { env, timeoutMs: 30_000, entry: projectBEntry }),
  ])
  await writeListArtifacts(ctx, projectAList, projectBList)
  requireListSuccess(projectAList, "project A")
  requireListSuccess(projectBList, "project B")
  assertLocalMcpScope(projectAList, projectBList)
  return { projectAEntry, projectAList, projectBList }
}

async function writeListArtifacts(ctx: CaseContext, projectAList: RunCommandResult, projectBList: RunCommandResult) {
  await Promise.all([
    ctx.writeArtifact(CASE_ID, "project-a-list-stdout.log", projectAList.stdout),
    ctx.writeArtifact(CASE_ID, "project-a-list-stderr.log", projectAList.stderr),
    ctx.writeArtifact(CASE_ID, "project-b-list-stdout.log", projectBList.stdout),
    ctx.writeArtifact(CASE_ID, "project-b-list-stderr.log", projectBList.stderr),
  ])
}

function requireListSuccess(result: RunCommandResult, label: string) {
  if (result.exitCode !== 0) {
    throw new Error(`deveco mcp list in ${label} exited with ${result.exitCode}\nstderr: ${result.stderr}`)
  }
}

function assertLocalMcpScope(projectAList: RunCommandResult, projectBList: RunCommandResult) {
  const projectAListText = stripAnsi(projectAList.stdout)
  const projectBListText = stripAnsi(projectBList.stdout)
  if (!projectAListText.includes(`${GLOBAL_MCP_NAME} connected`)) {
    throw new Error(`Expected project A to list connected MCP ${GLOBAL_MCP_NAME}\nstdout: ${projectAList.stdout}`)
  }
  if (!projectAListText.includes(`${PROJECT_MCP_NAME} connected`)) {
    throw new Error(`Expected project A to list connected MCP ${PROJECT_MCP_NAME}\nstdout: ${projectAList.stdout}`)
  }
  if (!projectBListText.includes(`${GLOBAL_MCP_NAME} connected`)) {
    throw new Error(`Expected project B to list connected MCP ${GLOBAL_MCP_NAME}\nstdout: ${projectBList.stdout}`)
  }
  if (projectBListText.includes(PROJECT_MCP_NAME)) {
    throw new Error(`Expected project B not to list MCP ${PROJECT_MCP_NAME}\nstdout: ${projectBList.stdout}`)
  }
}

async function verifyToolRequest(
  ctx: CaseContext,
  env: Record<string, string | undefined>,
  projectA: string,
  entry: string,
) {
  const sentMessage = [
    `Call ${GLOBAL_TOOL_NAME} exactly once.`,
    `Call ${PROJECT_TOOL_NAME} exactly once.`,
    `Do not call any other tools. After both calls succeed, reply with exactly ${RESPONSE_MARKER}.`,
  ].join(" ")
  const result = await ctx.runDeveco(runArgs(projectA, sentMessage), { env, timeoutMs: 120_000, entry })
  await ctx.writeArtifact(CASE_ID, "stdout.log", result.stdout)
  await ctx.writeArtifact(CASE_ID, "stderr.log", result.stderr)
  const events = ctx.parseJsonLines(result.stdout)
  await ctx.writeArtifact(CASE_ID, "events.jsonl", events.map((event) => JSON.stringify(event)).join("\n"))
  requireRequestSuccess(result)
  requireCompletedTools(events)
  const receivedText = receivedTextFrom(events)
  if (!receivedText.includes(RESPONSE_MARKER)) {
    throw new Error(`Expected received text to contain ${RESPONSE_MARKER}, got: ${receivedText || "(empty)"}`)
  }
  return { sentMessage, receivedText, result, events }
}

function runArgs(projectA: string, sentMessage: string) {
  const args = ["run", "--format", "json", "--dir", projectA, "--dangerously-skip-permissions"]
  const model = process.env.DEVECO_LIVE_MODEL?.trim()
  if (model) args.push("--model", model)
  args.push(sentMessage)
  return args
}

function requireRequestSuccess(result: RunCommandResult) {
  if (result.exitCode !== 0) throw new Error(`deveco run exited with ${result.exitCode}\nstderr: ${result.stderr}`)
}

function requireCompletedTools(events: Array<Record<string, unknown>>) {
  if (!events.some((event) => completedTool(event, GLOBAL_TOOL_NAME, GLOBAL_TOOL_MARKER))) {
    throw new Error(`Expected completed tool ${GLOBAL_TOOL_NAME} with output ${GLOBAL_TOOL_MARKER}`)
  }
  if (!events.some((event) => completedTool(event, PROJECT_TOOL_NAME, PROJECT_TOOL_MARKER))) {
    throw new Error(`Expected completed tool ${PROJECT_TOOL_NAME} with output ${PROJECT_TOOL_MARKER}`)
  }
}

function receivedTextFrom(events: Array<Record<string, unknown>>) {
  return events
    .filter((event) => event.type === "text")
    .map(textFromEvent)
    .filter((text): text is string => Boolean(text))
    .join("\n")
}

function makeEnv(globalConfigPath: string): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...realUserEnv() }
  env.DEVECO_CONFIG = globalConfigPath
  delete env.DEVECO_DISABLE_PROJECT_CONFIG
  return env
}

function textFromEvent(event: Record<string, unknown>) {
  const part = event.part
  if (!part || typeof part !== "object") return undefined
  if (!("text" in part) || typeof part.text !== "string") return undefined
  return part.text
}

function completedTool(event: Record<string, unknown>, name: string, marker: string) {
  if (event.type !== "tool_use") return false
  const part = event.part
  if (!part || typeof part !== "object") return false
  if (!("tool" in part) || part.tool !== name) return false
  if (!("state" in part) || !part.state || typeof part.state !== "object") return false
  if (!("status" in part.state) || part.state.status !== "completed") return false
  return "output" in part.state && typeof part.state.output === "string" && part.state.output.includes(marker)
}

async function createProjectCliEntry(project: string) {
  const entry = path.join(project, "live-e2e-cli.ts")
  await Bun.write(
    entry,
    `process.chdir(${JSON.stringify(project)}); await import(${JSON.stringify(pathToFileURL(cliEntry).href)});`,
  )
  return entry
}

export default testCase
