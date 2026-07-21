import fs from "node:fs/promises"
import path from "node:path"
import stripAnsi from "strip-ansi"
import { realUserEnv } from "../env"
import type { LiveTestCase } from "../types"

const CASE_ID = "MCP_LIST_SERVERS"
const MCP_NAME = "live-e2e-list-mcp"

const testCase: LiveTestCase = {
  id: CASE_ID,
  title: "列出 MCP 服务器",
  category: "cli",
  priority: "P1",
  timeoutMs: 60_000,
  requires: [],
  description: "验证 deveco mcp list 可列出隔离配置中的本地 MCP 服务器及其连接状态。",
  steps: [
    `在隔离临时配置中预置本地 MCP ${MCP_NAME}。`,
    "执行 deveco mcp list。",
    "验证命令成功且输出显示该服务器已连接。",
  ],
  expected: ["deveco mcp list 退出码为 0。", `输出包含 ${MCP_NAME} connected。`],
  code: "packages/opencode/test/live-e2e/cases/mcp-list-servers.case.ts",
  parallel: false,
  cleanup: "执行结束后删除临时 home 和 MCP 配置；不读取或修改真实用户配置。",
  async run(ctx) {
    const home = await ctx.createTempWorkspace("mcp-list-home-")
    const configPath = path.join(home, "deveco.jsonc")
    try {
      await Bun.write(configPath, JSON.stringify({ mcp: { [MCP_NAME]: localMcp() } }, null, 2))
      const result = await ctx.runDeveco(["mcp", "list"], {
        cwd: home,
        env: makeEnv(home, configPath),
        timeoutMs: 30_000,
      })
      await Promise.all([
        ctx.writeArtifact(CASE_ID, "stdout.log", result.stdout),
        ctx.writeArtifact(CASE_ID, "stderr.log", result.stderr),
      ])
      if (result.exitCode !== 0) {
        throw new Error(
          `deveco mcp list exited with ${result.exitCode}\nstderr: ${result.stderr}\nstdout: ${result.stdout}`,
        )
      }
      if (!stripAnsi(result.stdout).includes(`${MCP_NAME} connected`)) {
        throw new Error(`Expected connected MCP ${MCP_NAME}\nstdout: ${result.stdout}`)
      }

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        details: { exitCode: result.exitCode, commandDurationMs: result.durationMs, mcp: MCP_NAME },
      }
    } finally {
      await fs.rm(home, { recursive: true, force: true }).catch(() => undefined)
    }
  },
}

function makeEnv(home: string, configPath: string) {
  return {
    ...realUserEnv(),
    DEVECO_CONFIG: configPath,
    DEVECO_PURE: "1",
    DEVECO_TEST_HOME: home,
  }
}

function localMcp() {
  return {
    type: "local",
    command: [
      "node",
      "--input-type=module",
      "--eval",
      `
import { McpServer } from ${JSON.stringify(import.meta.resolve("@modelcontextprotocol/sdk/server/mcp.js"))}
import { StdioServerTransport } from ${JSON.stringify(import.meta.resolve("@modelcontextprotocol/sdk/server/stdio.js"))}

const server = new McpServer({ name: ${JSON.stringify(MCP_NAME)}, version: "1.0.0" })
server.registerTool("echo", { description: "Return a live E2E marker." }, async () => ({
  content: [{ type: "text", text: "MCP_LIST_OK" }],
}))
await server.connect(new StdioServerTransport())
      `.trim(),
    ],
    timeout: 10_000,
  }
}

export default testCase
