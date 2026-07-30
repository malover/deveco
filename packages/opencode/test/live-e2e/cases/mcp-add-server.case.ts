import fs from "node:fs/promises"
import path from "node:path"
import stripAnsi from "strip-ansi"
import { realUserEnv } from "../env"
import type { LiveTestCase } from "../types"

const CASE_ID = "MCP_ADD_SERVER"
const SERVER_NAME = "live-e2e-remote"
const SERVER_URL = "https://example.invalid/mcp"

const testCase: LiveTestCase = {
  id: CASE_ID,
  title: "添加 MCP 服务器",
  category: "cli",
  priority: "P1",
  timeoutMs: 60_000,
  requires: [],
  description: "验证 deveco mcp add 可在隔离配置目录中非交互式添加远程 MCP 服务器，并将配置写入配置文件。",
  steps: [
    "创建隔离临时根目录和配置目录。",
    `执行 deveco mcp add ${SERVER_NAME} --url ${SERVER_URL}。`,
    "验证命令成功退出且输出包含添加成功提示。",
    "验证隔离配置文件中包含正确的 MCP 服务器配置。",
  ],
  expected: [
    "deveco mcp add 退出码为 0。",
    `输出包含 MCP server "${SERVER_NAME}" added to。`,
    `配置文件中 mcp["${SERVER_NAME}"].type 为 remote。`,
    `配置文件中 mcp["${SERVER_NAME}"].url 为 ${SERVER_URL}。`,
  ],
  code: "packages/opencode/test/live-e2e/cases/mcp-add-server.case.ts",
  parallel: false,
  cleanup: "执行结束后删除临时根目录；不读取或修改真实用户配置。",
  async run(ctx) {
    const tempRoot = await ctx.createTempWorkspace("mcp-add-server-")
    try {
      const result = await ctx.runDeveco(["mcp", "add", SERVER_NAME, "--url", SERVER_URL], {
        env: makeEnv(tempRoot),
        timeoutMs: 30_000,
      })
      await Promise.all([
        ctx.writeArtifact(CASE_ID, "stdout.log", result.stdout),
        ctx.writeArtifact(CASE_ID, "stderr.log", result.stderr),
      ])
      if (result.exitCode !== 0) {
        throw new Error(
          `deveco mcp add exited with ${result.exitCode}\nstderr: ${result.stderr}\nstdout: ${result.stdout}`,
        )
      }
      const output = stripAnsi(result.stdout)
      const configPath = extractConfigPath(output)
      if (!configPath) {
        throw new Error(`Expected success message with config path\nstdout: ${result.stdout}`)
      }
      assertIsolatedConfigPath(configPath, tempRoot)
      const config = await readConfig(configPath)
      assertMcpConfig(config)
      return {
        stdout: result.stdout,
        stderr: result.stderr,
        details: {
          exitCode: result.exitCode,
          commandDurationMs: result.durationMs,
          serverName: SERVER_NAME,
          serverType: "remote",
          serverUrl: SERVER_URL,
          configPath,
        },
      }
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined)
    }
  },
}

function makeEnv(tempRoot: string) {
  return {
    ...realUserEnv(),
    XDG_CONFIG_HOME: path.join(tempRoot, "config"),
    XDG_DATA_HOME: path.join(tempRoot, "data"),
    XDG_CACHE_HOME: path.join(tempRoot, "cache"),
    XDG_STATE_HOME: path.join(tempRoot, "state"),
    DEVECO_TEST_HOME: tempRoot,
    DEVECO_PURE: "1",
  }
}

function extractConfigPath(output: string) {
  const marker = `MCP server "${SERVER_NAME}" added to `
  const index = output.indexOf(marker)
  if (index < 0) return undefined
  return output.slice(index + marker.length).trim()
}

function assertIsolatedConfigPath(configPath: string, tempRoot: string) {
  const configRoot = path.resolve(tempRoot, "config", "deveco")
  const relative = path.relative(configRoot, path.resolve(configPath))
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Expected config path inside "${configRoot}", got "${configPath}"`)
  }
}

async function readConfig(configPath: string) {
  const exists = await fs
    .stat(configPath)
    .then(() => true)
    .catch(() => false)
  if (!exists) throw new Error(`Config file not found: ${configPath}`)
  return JSON.parse(await fs.readFile(configPath, "utf-8")) as Record<string, unknown>
}

function assertMcpConfig(config: Record<string, unknown>) {
  const mcp = config.mcp
  if (!mcp || typeof mcp !== "object") throw new Error("Config missing top-level mcp object")
  const entry = (mcp as Record<string, unknown>)[SERVER_NAME]
  if (!entry || typeof entry !== "object") throw new Error(`Config missing mcp["${SERVER_NAME}"]`)
  const server = entry as Record<string, unknown>
  if (server.type !== "remote") throw new Error(`Expected type "remote", got "${server.type}"`)
  if (server.url !== SERVER_URL) throw new Error(`Expected url "${SERVER_URL}", got "${server.url}"`)
}

export default testCase
