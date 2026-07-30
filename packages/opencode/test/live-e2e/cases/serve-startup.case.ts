import fs from "node:fs/promises"
import { connect } from "node:net"
import path from "node:path"
import stripAnsi from "strip-ansi"
import { realUserEnv } from "../env"
import {
  spawnCliProcess,
  startProcessReaders,
  stopLongRunningProcess,
  waitForOutputPattern,
  waitForReadersDone,
} from "../long-running-process"
import type { CaseContext, LiveTestCase } from "../types"

const CASE_ID = "SERVE_STARTUP"

const testCase: LiveTestCase = {
  id: CASE_ID,
  title: "Serve 服务启动与健康检查",
  category: "cli",
  priority: "P1",
  timeoutMs: 60_000,
  requires: [],
  description: "验证 deveco serve 能在隔离环境中启动，监听动态端口，并通过 /global/health 健康检查。",
  steps: [
    "创建隔离的临时 home 和 workspace。",
    "使用 Bun.spawn 启动 deveco serve --hostname 127.0.0.1 --port 0。",
    "增量读取 stdout，匹配监听日志并提取动态端口。",
    "请求 GET /global/health 并验证响应。",
    "主动终止进程并清理临时目录。",
  ],
  expected: ["服务在 127.0.0.1 上成功监听。", "健康检查返回 HTTP 200，healthy 为 true，version 非空。"],
  code: "packages/opencode/test/live-e2e/cases/serve-startup.case.ts",
  parallel: false,
  cleanup: "主动终止 serve 进程，删除临时 home 和 workspace；不读取或修改真实 auth、config、token 或会话数据。",
  async run(ctx) {
    const paths: string[] = []
    let proc: ReturnType<typeof spawnCliProcess> | undefined
    let readers: ReturnType<typeof startProcessReaders> | undefined
    let result: Awaited<ReturnType<typeof checkService>> | undefined
    let exitCode: number | null = null
    let healthArtifact: Record<string, unknown> = { phase: "startup" }
    try {
      const home = await ctx.createTempWorkspace("serve-home-")
      paths.push(home)
      const workspace = await ctx.createTempWorkspace("serve-workspace-")
      paths.push(workspace)
      proc = spawnCliProcess(["serve", "--hostname", "127.0.0.1", "--port", "0"], {
        cwd: workspace,
        env: makeEnv(home),
      })
      readers = startProcessReaders(proc)
      result = await checkService(proc, readers)
      healthArtifact = result.health.response
    } catch (error) {
      healthArtifact = { phase: "run", error: error instanceof Error ? error.message : String(error) }
      throw error
    } finally {
      exitCode = await finalize(ctx, proc, readers, paths, healthArtifact)
    }
    if (!result || !readers) throw new Error("serve verification completed without a result")
    return {
      stdout: readers.stdout(),
      stderr: readers.stderr(),
      details: {
        hostname: "127.0.0.1",
        port: result.port,
        httpStatus: result.health.status,
        version: result.health.version,
        startupMs: result.startupMs,
        exitCode,
      },
    }
  },
}

async function checkService(proc: ReturnType<typeof spawnCliProcess>, readers: ReturnType<typeof startProcessReaders>) {
  const start = Date.now()
  const port = await waitForReady(proc, readers.stdout, 30_000)
  const startupMs = Date.now() - start
  const health = await healthCheck(port, proc, readers.stdout)
  return { port, startupMs, health }
}

async function waitForReady(
  proc: ReturnType<typeof spawnCliProcess>,
  getStdout: () => string,
  timeoutMs: number,
): Promise<number> {
  const match = await waitForOutputPattern(
    proc,
    getStdout,
    /deveco server listening on http:\/\/127\.0\.0\.1:(\d+)/,
    timeoutMs,
  )
  const port = parseInt(match[1], 10)
  if (port > 0) return port
  throw new Error(`Invalid port in listening log: ${match[1]}\nstdout: ${stripAnsi(getStdout())}`)
}

async function healthCheck(port: number, proc: ReturnType<typeof spawnCliProcess>, getStdout: () => string) {
  const url = `http://127.0.0.1:${port}/global/health`
  try {
    const response = await requestHealth(url, 10_000)
    if (response.status !== 200) {
      throw new Error(`Health check returned ${response.status}: ${response.text}`)
    }
    const body = JSON.parse(response.text) as Record<string, unknown>
    if (body.healthy !== true) {
      throw new Error(`Expected healthy=true, got ${JSON.stringify(body)}`)
    }
    if (typeof body.version !== "string" || body.version.length === 0) {
      throw new Error(`Expected non-empty version string, got ${JSON.stringify(body)}`)
    }
    if (proc.exitCode !== null) {
      throw new Error(
        `serve process exited before health check completed (code ${proc.exitCode})\nstdout: ${stripAnsi(getStdout())}`,
      )
    }
    return { status: response.status, version: body.version, response: body }
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error(`Health check response is not valid JSON: ${err.message}`)
    }
    throw err
  }
}

async function requestHealth(url: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  while (Date.now() < deadline) {
    const result = await requestOnce(url, Math.min(2000, deadline - Date.now())).then(
      (response) => ({ response }),
      (error: unknown) => ({ error }),
    )
    if ("response" in result) return result.response
    lastError = result.error
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw lastError instanceof Error ? lastError : new Error(`Health check timed out after ${timeoutMs}ms`)
}

function requestOnce(url: string, timeoutMs: number) {
  return new Promise<{ status: number; text: string }>((resolve, reject) => {
    const target = new URL(url)
    const chunks: string[] = []
    const socket = connect({ host: target.hostname, port: Number(target.port) }, () => {
      socket.write(
        `GET ${target.pathname} HTTP/1.1\r\nHost: ${target.host}\r\nAccept: application/json\r\nConnection: close\r\n\r\n`,
      )
    })
    socket.setEncoding("utf8")
    socket.setTimeout(timeoutMs, () => socket.destroy(new Error(`Health request timed out after ${timeoutMs}ms`)))
    socket.on("data", (chunk: string) => chunks.push(chunk))
    socket.on("end", () => resolve(parseHttpResponse(chunks.join(""))))
    socket.on("error", reject)
  })
}

function parseHttpResponse(raw: string) {
  const boundary = raw.indexOf("\r\n\r\n")
  if (boundary === -1) throw new Error(`Health response did not contain HTTP headers: ${raw}`)
  const status = Number(raw.slice(0, raw.indexOf("\r\n")).split(" ")[1])
  if (!Number.isInteger(status)) throw new Error(`Health response had an invalid status line: ${raw}`)
  return { status, text: raw.slice(boundary + 4) }
}

async function finalize(
  ctx: CaseContext,
  proc: ReturnType<typeof spawnCliProcess> | undefined,
  readers: ReturnType<typeof startProcessReaders> | undefined,
  paths: string[],
  healthArtifact: Record<string, unknown>,
) {
  let cleanupError: unknown
  let exitCode: number | null = null
  try {
    exitCode = await stopLongRunningProcess(proc)
    if (readers) await waitForReadersDone(readers.done, 5000)
  } catch (error) {
    cleanupError = error
  }
  try {
    await Promise.all([
      ctx.writeArtifact(CASE_ID, "stdout.log", readers?.stdout() ?? ""),
      ctx.writeArtifact(CASE_ID, "stderr.log", readers?.stderr() ?? ""),
      ctx.writeArtifact(CASE_ID, "health-response.json", JSON.stringify(healthArtifact, null, 2)),
    ])
  } finally {
    await Promise.all(paths.map((item) => fs.rm(item, { recursive: true, force: true }).catch(() => undefined)))
  }
  if (cleanupError) throw cleanupError
  return exitCode
}

function makeEnv(home: string) {
  const env: Record<string, string | undefined> = {
    ...realUserEnv(),
    DEVECO_PURE: "1",
    DEVECO_TEST_HOME: home,
    DEVECO_DB: path.join(home, "deveco.db"),
    XDG_DATA_HOME: path.join(home, "data"),
    XDG_CACHE_HOME: path.join(home, "cache"),
    XDG_CONFIG_HOME: path.join(home, "config"),
    XDG_STATE_HOME: path.join(home, "state"),
    DEVECO_CONFIG_DIR: path.join(home, "config", "deveco"),
  }
  delete env.DEVECO_SERVER_PASSWORD
  delete env.DEVECO_SERVER_USERNAME
  delete env.DEVECO_CONFIG
  delete env.DEVECO_CONFIG_CONTENT
  delete env.DEVECO_TUI_CONFIG
  return env
}

export default testCase
