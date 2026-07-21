import fs from "node:fs/promises"
import { realUserEnv } from "../env"
import type { LiveTestCase } from "../types"

const CASE_ID = "ACP_STARTUP"

const testCase: LiveTestCase = {
  id: CASE_ID,
  title: "ACP 服务启动与握手",
  category: "cli",
  priority: "P0",
  timeoutMs: 60_000,
  requires: [],
  description: "验证 deveco acp 能在隔离环境中启动，并通过 JSON-RPC initialize 完成 ACP 握手。",
  steps: [
    "创建隔离的临时工作目录和空配置环境。",
    "执行 deveco acp 并通过 stdin 发送 initialize 请求。",
    "解析 stdout 中的 JSON-RPC 响应并验证 ACP 元数据。",
  ],
  expected: [
    "deveco acp 退出码为 0。",
    "响应 ID 与请求一致，protocolVersion 为 1。",
    "响应包含 agentCapabilities 和名称为 DevEco Code 的 agentInfo。",
  ],
  code: "packages/opencode/test/live-e2e/cases/acp-startup.case.ts",
  parallel: false,
  cleanup: "执行结束后删除临时工作目录；不读取或修改真实 auth、config、token 或会话数据。",
  async run(ctx) {
    const home = await ctx.createTempWorkspace("acp-home-")
    const workspace = await ctx.createTempWorkspace("acp-workspace-")
    try {
      const result = await ctx.runDeveco(["acp", "--cwd", workspace, "--hostname", "127.0.0.1", "--port", "0"], {
        env: makeEnv(home),
        stdin: initializeRequest(),
        timeoutMs: 30_000,
      })
      await Promise.all([
        ctx.writeArtifact(CASE_ID, "stdout.log", result.stdout),
        ctx.writeArtifact(CASE_ID, "stderr.log", result.stderr),
      ])
      if (result.exitCode !== 0) {
        throw new Error(`deveco acp exited with ${result.exitCode}\nstderr: ${result.stderr}\nstdout: ${result.stdout}`)
      }

      const response = responseFrom(result.stdout)
      validateResponse(response)
      return {
        stdout: result.stdout,
        stderr: result.stderr,
        details: { exitCode: result.exitCode, commandDurationMs: result.durationMs, protocolVersion: 1 },
      }
    } finally {
      await Promise.all([
        fs.rm(home, { recursive: true, force: true }).catch(() => undefined),
        fs.rm(workspace, { recursive: true, force: true }).catch(() => undefined),
      ])
    }
  },
}

function makeEnv(home: string) {
  return { ...realUserEnv(), DEVECO_PURE: "1", DEVECO_TEST_HOME: home }
}

function initializeRequest() {
  return `${JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: 1,
      clientCapabilities: {},
      clientInfo: { name: "live-e2e", version: "1.0.0" },
    },
  })}\n`
}

function responseFrom(stdout: string) {
  const start = stdout.indexOf("{")
  const end = stdout.lastIndexOf("}")
  if (start === -1 || end <= start) throw new Error(`ACP stdout did not contain a JSON-RPC response: ${stdout}`)
  return JSON.parse(stdout.slice(start, end + 1)) as Record<string, unknown>
}

function validateResponse(response: Record<string, unknown>) {
  if (response.id !== 1) throw new Error(`Expected ACP response id 1, got ${String(response.id)}`)
  if (!response.result || typeof response.result !== "object" || Array.isArray(response.result)) {
    throw new Error("ACP initialize response did not contain a result object")
  }

  const result = response.result as Record<string, unknown>
  if (result.protocolVersion !== 1) throw new Error(`Expected protocolVersion 1, got ${String(result.protocolVersion)}`)
  if (!result.agentCapabilities || typeof result.agentCapabilities !== "object") {
    throw new Error("ACP initialize response did not contain agentCapabilities")
  }
  if (
    !result.agentInfo ||
    typeof result.agentInfo !== "object" ||
    (result.agentInfo as Record<string, unknown>).name !== "DevEco Code"
  ) {
    throw new Error("ACP initialize response did not contain agentInfo.name DevEco Code")
  }
}

export default testCase
