import fs from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js"
import stripAnsi from "strip-ansi"
import { cliEntry, realUserEnv } from "../env"
import type { CaseContext, LiveTestCase, RunCommandResult } from "../types"

const CASE_ID = "CONFIG_REMOTE_MCP"
const GLOBAL_MCP_URL_ENV = "DEVECO_LIVE_E2E_GLOBAL_REMOTE_MCP_URL"
const PROJECT_MCP_URL_ENV = "DEVECO_LIVE_E2E_PROJECT_REMOTE_MCP_URL"

type McpConfig = {
  mcp: Record<string, { type: "remote"; url: string }>
}

type TestConfig = {
  remoteMcp: {
    global: McpConfig
    project: McpConfig
  }
}

type McpMessage = {
  id?: number | string
  method: string
}

const GLOBAL_TOOL_MARKER = "GLOBAL_REMOTE_MCP_TOOL_OK"
const PROJECT_TOOL_MARKER = "PROJECT_REMOTE_MCP_TOOL_OK"
const RESPONSE_MARKER = "REMOTE_MCP_OK"

const testCase: LiveTestCase = {
  id: CASE_ID,
  title: "配置远端 MCP",
  category: "llm",
  priority: "P0",
  timeoutMs: 180_000,
  requires: ["huawei-auth", "real-llm", "deveco-provider"],
  description:
    "验证全局和项目 deveco.jsonc 中配置的远端 MCP（本地虚拟 StreamableHTTP 服务）可按作用域查询，并可在真实 LLM 请求中调用其工具。",
  steps: [
    "启动两个本地虚拟 StreamableHTTP MCP 服务（全局和项目级）。",
    "创建临时全局配置目录、临时工程 A 和临时工程 B。",
    "在全局 deveco.jsonc 中配置远端 MCP，URL 指向全局虚拟服务。",
    "在工程 A 的 deveco.jsonc 中配置远端 MCP，URL 指向项目级虚拟服务。",
    "分别在工程 A 和工程 B 执行 deveco mcp list。",
    "在工程 A 发起真实请求，调用全局和项目级远端 MCP 工具。",
    "解析 JSON line events，校验两个 MCP 工具均执行成功并返回各自 marker。",
  ],
  expected: [
    "工程 A 可查询到已连接的全局远端 MCP 和项目级远端 MCP。",
    "工程 B 仅可查询到已连接的全局远端 MCP，不能查询到工程 A 的项目级远端 MCP。",
    `请求中全局远端 MCP 工具执行成功并返回 ${GLOBAL_TOOL_MARKER}。`,
    `请求中项目级远端 MCP 工具执行成功并返回 ${PROJECT_TOOL_MARKER}。`,
    `模型最终响应包含 ${RESPONSE_MARKER}。`,
  ],
  code: "packages/opencode/test/live-e2e/cases/config-remote-mcp.case.ts",
  parallel: false,
  cleanup: "执行结束后删除临时全局配置目录和两个临时工程，停止虚拟 MCP 服务；真实 auth/config 只读，不修改也不清理。",
  async run(ctx) {
    const setup = await prepareRemoteCase(ctx)

    try {
      await writeConfigs(setup.globalConfigPath, setup.projectConfigPath, setup.config)
      const env = makeEnv(setup.globalConfigPath, setup.globalMcpServer.url, setup.projectMcpServer.url)
      const listings = await verifyMcpLists(ctx, env, setup.projectA, setup.projectB, setup.globalMcpName, setup.projectMcpName)
      const request = await verifyToolRequest(ctx, env, setup.projectA, listings.projectAEntry, {
        globalToolName: setup.globalToolName,
        projectToolName: setup.projectToolName,
      })

      return {
        sentMessage: request.sentMessage,
        receivedText: request.receivedText,
        sessionID: request.events.find((event) => typeof event.sessionID === "string")?.sessionID as string | undefined,
        stdout: request.result.stdout,
        stderr: request.result.stderr,
        events: request.events,
        details: resultDetails(listings, request.result, {
          globalMcpName: setup.globalMcpName,
          projectMcpName: setup.projectMcpName,
          globalToolName: setup.globalToolName,
          projectToolName: setup.projectToolName,
          globalConfigPath: setup.globalConfigPath,
          projectConfigPath: setup.projectConfigPath,
          projectA: setup.projectA,
          projectB: setup.projectB,
          globalMcpServerUrl: setup.globalMcpServer.url,
          projectMcpServerUrl: setup.projectMcpServer.url,
        }),
      }
    } finally {
      await cleanupRemoteCase(setup)
    }
  },
}

async function prepareRemoteCase(ctx: CaseContext) {
  const config = await readRemoteMcpConfig()
  const globalMcpName = mcpName(config.global, "remoteMcp.global")
  const projectMcpName = mcpName(config.project, "remoteMcp.project")
  const globalMcpServer = startMcpServer(GLOBAL_TOOL_MARKER)
  const projectMcpServer = startMcpServer(PROJECT_TOOL_MARKER)
  const globalConfigDir = await ctx.createTempWorkspace("config-remote-mcp-global-")
  const projectA = await ctx.createTempWorkspace("config-remote-mcp-a-")
  const projectB = await ctx.createTempWorkspace("config-remote-mcp-b-")
  return {
    config,
    globalMcpName,
    projectMcpName,
    globalToolName: `${globalMcpName}_echo`,
    projectToolName: `${projectMcpName}_echo`,
    globalMcpServer,
    projectMcpServer,
    globalConfigDir,
    projectA,
    projectB,
    globalConfigPath: path.join(globalConfigDir, "deveco.jsonc"),
    projectConfigPath: path.join(projectA, "deveco.jsonc"),
  }
}

async function cleanupRemoteCase(setup: Awaited<ReturnType<typeof prepareRemoteCase>>) {
  setup.globalMcpServer.stop()
  setup.projectMcpServer.stop()
  await Promise.all([
    fs.rm(setup.globalConfigDir, { recursive: true, force: true }),
    fs.rm(setup.projectA, { recursive: true, force: true }),
    fs.rm(setup.projectB, { recursive: true, force: true }),
  ])
}

function resultDetails(
  listings: { projectAList: RunCommandResult; projectBList: RunCommandResult },
  result: RunCommandResult,
  data: Record<string, string>,
) {
  return {
    projectAListExitCode: listings.projectAList.exitCode,
    projectBListExitCode: listings.projectBList.exitCode,
    requestExitCode: result.exitCode,
    globalMcp: data.globalMcpName,
    projectMcp: data.projectMcpName,
    globalTool: data.globalToolName,
    projectTool: data.projectToolName,
    globalConfigPath: data.globalConfigPath,
    projectConfigPath: data.projectConfigPath,
    projectA: data.projectA,
    projectB: data.projectB,
    globalMcpServerUrl: data.globalMcpServerUrl,
    projectMcpServerUrl: data.projectMcpServerUrl,
  }
}

async function writeConfigs(
  globalConfigPath: string,
  projectConfigPath: string,
  config: TestConfig["remoteMcp"],
) {
  await Promise.all([
    Bun.write(globalConfigPath, JSON.stringify(config.global, null, 2)),
    Bun.write(projectConfigPath, JSON.stringify(config.project, null, 2)),
  ])
}

async function readRemoteMcpConfig() {
  const config = (await Bun.file(new URL("../fixtures/live-e2e.config.json", import.meta.url)).json()) as Partial<TestConfig>
  if (!config.remoteMcp) throw new Error("Expected remoteMcp config in live-e2e.config.json")
  return config.remoteMcp
}

function mcpName(config: McpConfig | undefined, label: string) {
  const names = Object.keys(config?.mcp ?? {})
  if (names.length !== 1) throw new Error(`Expected exactly one MCP config at ${label}.mcp, got ${names.length}`)
  return names[0]
}

function startMcpServer(marker: string) {
  const sessionId = crypto.randomUUID()
  const server = Bun.serve({
    port: 0,
    fetch: (request) => handleMcpRequest(request, sessionId, marker),
  })

  return { url: `http://127.0.0.1:${server.port}/`, stop: () => server.stop(true) }
}

async function handleMcpRequest(request: Request, sessionId: string, marker: string) {
  if (request.method === "DELETE") return new Response(null, { status: 200 })
  if (request.method !== "POST") return new Response(null, { status: 405 })

  const message = (await request.json()) as McpMessage
  if (message.method === "initialize") return initializeResponse(message, sessionId)
  if (message.method === "notifications/initialized") return new Response(null, { status: 202 })
  if (message.method === "ping") return jsonResponse({ jsonrpc: "2.0", id: message.id, result: {} }, sessionId)
  if (message.method === "tools/list") return toolsListResponse(message, sessionId)
  if (message.method === "tools/call") return toolCallResponse(message, sessionId, marker)
  return jsonResponse(
    { jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Method not found" } },
    sessionId,
  )
}

function jsonResponse(body: unknown, sessionId: string) {
  return Response.json(body, { headers: { "mcp-session-id": sessionId } })
}

function initializeResponse(message: McpMessage, sessionId: string) {
  return jsonResponse(
    {
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "live-e2e-remote-mcp", version: "1.0.0" },
      },
    },
    sessionId,
  )
}

function toolsListResponse(message: McpMessage, sessionId: string) {
  return jsonResponse(
    {
      jsonrpc: "2.0",
      id: message.id,
      result: {
        tools: [
          {
            name: "echo",
            description: "Return the configured marker.",
            inputSchema: { type: "object", properties: {} },
          },
        ],
      },
    },
    sessionId,
  )
}

function toolCallResponse(message: McpMessage, sessionId: string, marker: string) {
  return jsonResponse(
    {
      jsonrpc: "2.0",
      id: message.id,
      result: {
        content: [{ type: "text", text: marker }],
      },
    },
    sessionId,
  )
}

async function verifyMcpLists(
  ctx: CaseContext,
  env: Record<string, string | undefined>,
  projectA: string,
  projectB: string,
  globalMcpName: string,
  projectMcpName: string,
) {
  const [projectAEntry, projectBEntry] = await Promise.all([createProjectCliEntry(projectA), createProjectCliEntry(projectB)])
  const [projectAList, projectBList] = await Promise.all([
    ctx.runDeveco(["mcp", "list"], { env, timeoutMs: 30_000, entry: projectAEntry }),
    ctx.runDeveco(["mcp", "list"], { env, timeoutMs: 30_000, entry: projectBEntry }),
  ])
  await writeListArtifacts(ctx, projectAList, projectBList)
  requireListSuccess(projectAList, "project A")
  requireListSuccess(projectBList, "project B")
  assertRemoteMcpScope(projectAList, projectBList, globalMcpName, projectMcpName)
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

function assertRemoteMcpScope(
  projectAList: RunCommandResult,
  projectBList: RunCommandResult,
  globalMcpName: string,
  projectMcpName: string,
) {
  const projectAListText = stripAnsi(projectAList.stdout)
  const projectBListText = stripAnsi(projectBList.stdout)
  if (!projectAListText.includes(`${globalMcpName} connected`)) {
    throw new Error(`Expected project A to list connected MCP ${globalMcpName}\nstdout: ${projectAList.stdout}`)
  }
  if (!projectAListText.includes(`${projectMcpName} connected`)) {
    throw new Error(`Expected project A to list connected MCP ${projectMcpName}\nstdout: ${projectAList.stdout}`)
  }
  if (!projectBListText.includes(`${globalMcpName} connected`)) {
    throw new Error(`Expected project B to list connected MCP ${globalMcpName}\nstdout: ${projectBList.stdout}`)
  }
  if (projectBListText.includes(projectMcpName)) {
    throw new Error(`Expected project B not to list MCP ${projectMcpName}\nstdout: ${projectBList.stdout}`)
  }
}

async function verifyToolRequest(
  ctx: CaseContext,
  env: Record<string, string | undefined>,
  projectA: string,
  entry: string,
  tools: { globalToolName: string; projectToolName: string },
) {
  const sentMessage = [
    `Call ${tools.globalToolName} exactly once.`,
    `Call ${tools.projectToolName} exactly once.`,
    `Do not call any other tools. After both calls succeed, reply with exactly ${RESPONSE_MARKER}.`,
  ].join(" ")
  const result = await ctx.runDeveco(runArgs(projectA, sentMessage), { env, timeoutMs: 120_000, entry })
  await ctx.writeArtifact(CASE_ID, "stdout.log", result.stdout)
  await ctx.writeArtifact(CASE_ID, "stderr.log", result.stderr)
  const events = ctx.parseJsonLines(result.stdout)
  await ctx.writeArtifact(CASE_ID, "events.jsonl", events.map((event) => JSON.stringify(event)).join("\n"))
  requireRequestSuccess(result)
  requireCompletedTools(events, tools)
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

function requireCompletedTools(events: Array<Record<string, unknown>>, tools: { globalToolName: string; projectToolName: string }) {
  if (!events.some((event) => completedTool(event, tools.globalToolName, GLOBAL_TOOL_MARKER))) {
    throw new Error(`Expected completed tool ${tools.globalToolName} with output ${GLOBAL_TOOL_MARKER}`)
  }
  if (!events.some((event) => completedTool(event, tools.projectToolName, PROJECT_TOOL_MARKER))) {
    throw new Error(`Expected completed tool ${tools.projectToolName} with output ${PROJECT_TOOL_MARKER}`)
  }
}

function receivedTextFrom(events: Array<Record<string, unknown>>) {
  return events
    .filter((event) => event.type === "text")
    .map(textFromEvent)
    .filter((text): text is string => Boolean(text))
    .join("\n")
}

function makeEnv(globalConfigPath: string, globalMcpUrl: string, projectMcpUrl: string) {
  const env: Record<string, string | undefined> = {
    ...realUserEnv(),
    [GLOBAL_MCP_URL_ENV]: globalMcpUrl,
    [PROJECT_MCP_URL_ENV]: projectMcpUrl,
    NO_PROXY: [process.env.NO_PROXY, "127.0.0.1", "localhost"].filter(Boolean).join(","),
    no_proxy: [process.env.no_proxy, "127.0.0.1", "localhost"].filter(Boolean).join(","),
  }
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
