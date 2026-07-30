import fs from "node:fs/promises"
import path from "node:path"
import type { Proc } from "@opencode-ai/core/pty/pty.bun"
import stripAnsi from "strip-ansi"
import { cliEntry, opencodeRoot, realUserEnv } from "../env"
import {
  spawnCliProcess,
  startProcessReaders,
  stopLongRunningProcess,
  waitForOutputPattern,
  waitForReadersDone,
} from "../long-running-process"
import type { CaseContext, CaseRunResult, LiveTestCase, RunCommandResult } from "../types"

const CASE_ID = "ATTACH_RUNNING_SERVER"
const SESSION_ID = "ses_live_e2e_attach_session"
const SESSION_TITLE = "Live E2E Attach Session"
const SESSION_SLUG = "live-e2e-attach-session"
const FIXED_TIMESTAMP = 1700000000000
const READY_MARKERS = ["What can I help you with?", "有什么可以帮你的？", "Connect a provider"]

const testCase: LiveTestCase = {
  id: CASE_ID,
  title: "Attach 连接运行中服务器",
  category: "cli",
  priority: "P1",
  timeoutMs: 120_000,
  requires: [],
  description: "验证 deveco attach 可连接运行中的 deveco serve，恢复指定会话并进入交互式 TUI。",
  steps: [
    "创建隔离根目录、workspace 和 SQLite 数据库。",
    "写入固定会话 fixture 并通过 deveco import 导入。",
    "启动 deveco serve --hostname 127.0.0.1 --port 0 并等待监听。",
    "通过 PTY 执行 deveco attach http://127.0.0.1:<port> --session <id> --dir <workspace>。",
    "等待交互式 TUI 就绪提示出现在 PTY 输出中，然后发送 Ctrl+C 退出。",
  ],
  expected: [
    "fixture 导入成功，退出码为 0。",
    "serve 在 127.0.0.1 上成功监听动态端口。",
    "attach PTY 输出包含交互式 TUI 就绪提示。",
    "attach 和 serve 均被确认终止。",
  ],
  code: "packages/opencode/test/live-e2e/cases/attach-running-server.case.ts",
  parallel: false,
  cleanup: "按顺序停止 attach PTY、serve 进程，删除临时根目录；不读取或修改真实 auth、config、token 或会话数据。",
  async run(ctx) {
    const tempRoot = await ctx.createTempWorkspace("attach-root-")
    const workspace = path.join(tempRoot, "workspace")
    await fs.mkdir(workspace, { recursive: true })
    const env = buildIsolatedEnv(tempRoot)
    const state = createRunState()
    try {
      await importFixture(ctx, workspace, env)
      await startServe(workspace, env, state)
      await runAttach(workspace, env, state)
    } catch (error) {
      state.phase = "error"
      state.errorMessage = error instanceof Error ? error.message : String(error)
      throw error
    } finally {
      await cleanup(ctx, tempRoot, state)
    }
    return buildResult(state)
  },
}

type RunState = {
  phase: string
  errorMessage?: string
  serveProc?: ReturnType<typeof spawnCliProcess>
  serveReaders?: ReturnType<typeof startProcessReaders>
  serveExitCode?: number | null
  ptyProc?: Proc
  ptyExit?: Promise<number>
  ptyOutput: string
  ptyExitCode?: number | null
  port?: number
  startupMs?: number
}

function createRunState(): RunState {
  return { phase: "init", ptyOutput: "" }
}

function buildIsolatedEnv(tempRoot: string): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {
    ...realUserEnv(),
    DEVECO_TEST_HOME: tempRoot,
    DEVECO_DB: path.join(tempRoot, "deveco.db"),
    XDG_DATA_HOME: path.join(tempRoot, "data"),
    XDG_CACHE_HOME: path.join(tempRoot, "cache"),
    XDG_CONFIG_HOME: path.join(tempRoot, "config"),
    XDG_STATE_HOME: path.join(tempRoot, "state"),
    DEVECO_CONFIG_DIR: path.join(tempRoot, "config", "deveco"),
    DEVECO_PURE: "1",
    NO_PROXY: [process.env.NO_PROXY, "127.0.0.1", "localhost"].filter(Boolean).join(","),
    no_proxy: [process.env.no_proxy, "127.0.0.1", "localhost"].filter(Boolean).join(","),
  }
  delete env.DEVECO_SERVER_PASSWORD
  delete env.DEVECO_SERVER_USERNAME
  delete env.DEVECO_CONFIG
  delete env.DEVECO_CONFIG_CONTENT
  delete env.DEVECO_TUI_CONFIG
  return env
}

function buildFixtureData(workspace: string) {
  return {
    info: {
      id: SESSION_ID,
      slug: SESSION_SLUG,
      projectID: "global",
      directory: workspace,
      title: SESSION_TITLE,
      version: "1.0.0",
      time: { created: FIXED_TIMESTAMP, updated: FIXED_TIMESTAMP },
    },
    messages: [],
  }
}

async function importFixture(ctx: CaseContext, workspace: string, env: Record<string, string | undefined>) {
  const fixturePath = path.join(workspace, "seesion.json")
  await Bun.write(fixturePath, JSON.stringify(buildFixtureData(workspace), null, 2))
  const result = await ctx.runDeveco(["import", "seesion.json"], {
    cwd: workspace,
    env,
    timeoutMs: 30_000,
  })
  await Promise.all([
    ctx.writeArtifact(CASE_ID, "import-stdout.log", result.stdout),
    ctx.writeArtifact(CASE_ID, "import-stderr.log", result.stderr),
  ])
  assertImportSuccess(result)
}

function assertImportSuccess(result: RunCommandResult) {
  if (result.exitCode !== 0) {
    throw new Error(`import exited with ${result.exitCode}\nstderr: ${result.stderr}\nstdout: ${result.stdout}`)
  }
  const expected = `Imported session: ${SESSION_ID}`
  if (!stripAnsi(result.stdout).includes(expected)) {
    throw new Error(`Expected stdout to contain "${expected}"\nstdout: ${result.stdout}`)
  }
}

async function startServe(workspace: string, env: Record<string, string | undefined>, state: RunState) {
  state.phase = "serve-start"
  state.serveProc = spawnCliProcess(["serve", "--hostname", "127.0.0.1", "--port", "0"], { cwd: workspace, env })
  state.serveReaders = startProcessReaders(state.serveProc)
  const start = Date.now()
  const match = await waitForOutputPattern(
    state.serveProc,
    state.serveReaders.stdout,
    /deveco server listening on http:\/\/127\.0\.0\.1:(\d+)/,
    15_000,
    state.serveReaders.stderr,
  )
  state.port = parseInt(match[1], 10)
  if (state.port <= 0) throw new Error(`Invalid serve port: ${match[1]}`)
  state.startupMs = Date.now() - start
  state.phase = "serve-ready"
}

async function spawnPty(args: string[], opts: { cwd: string; env: Record<string, string | undefined> }) {
  const { spawn } = await import("@opencode-ai/core/pty/pty.bun")
  return spawn(process.execPath, args, {
    name: "xterm-256color",
    cols: 120,
    rows: 40,
    cwd: opts.cwd,
    env: Object.fromEntries(
      Object.entries(opts.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
    ),
  })
}

async function runAttach(workspace: string, env: Record<string, string | undefined>, state: RunState) {
  state.phase = "attach-start"
  const attachArgs = buildAttachArgs(state.port!, workspace)
  const pty = await spawnPty(attachArgs, { cwd: workspace, env })
  state.ptyProc = pty
  collectPtyOutput(pty, state)
  trackPtyExit(pty, state)
  await waitForAttachReady(state, 30_000)
  state.phase = "attach-verified"
  pty.write("\x03")
  if (!(await waitForPtyExit(state, 4000))) {
    pty.kill()
    if (!(await waitForPtyExit(state, 2000))) throw new Error("Attach PTY did not exit after forced termination")
  }
  state.phase = "attach-done"
}

function buildAttachArgs(port: number, workspace: string): string[] {
  return [
    "run",
    "--preload",
    path.join(opencodeRoot, "node_modules", "@opentui", "solid", "scripts", "preload.ts"),
    "--conditions=browser",
    cliEntry,
    "attach",
    `http://127.0.0.1:${port}`,
    "--session",
    SESSION_ID,
    "--dir",
    workspace,
  ]
}

function collectPtyOutput(pty: Proc, state: RunState) {
  pty.onData((data: string) => {
    state.ptyOutput += data
  })
}

function trackPtyExit(pty: Proc, state: RunState) {
  state.ptyExit = new Promise((resolve) => {
    pty.onExit((event) => {
      state.ptyExitCode = event.exitCode
      resolve(event.exitCode)
    })
  })
}

async function waitForAttachReady(state: RunState, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const clean = stripAnsi(state.ptyOutput)
    if (READY_MARKERS.some((marker) => clean.includes(marker))) return
    assertNoAttachError(clean, state)
    if (state.ptyExitCode !== undefined) {
      throw new Error(`Attach PTY exited before the TUI became ready (code ${state.ptyExitCode})\noutput: ${clean}`)
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`Attach TUI was not ready within ${timeoutMs}ms\noutput: ${stripAnsi(state.ptyOutput)}`)
}

function assertNoAttachError(clean: string, state: RunState) {
  const errorPatterns = [
    "opencode server GET",
    "ECONNREFUSED",
    "Session not found",
    "connection refused",
    "Invalid session ID",
  ]
  const matched = errorPatterns.find((p) => clean.includes(p))
  if (matched) {
    throw new Error(
      `Attach failed with "${matched}"\noutput: ${clean}\nserve stdout: ${state.serveReaders?.stdout() ?? ""}`,
    )
  }
  if (state.serveProc?.exitCode !== null && state.serveProc?.exitCode !== undefined) {
    throw new Error(`Serve process exited unexpectedly (code ${state.serveProc.exitCode})`)
  }
}

async function waitForPtyExit(state: RunState, timeoutMs: number) {
  if (state.ptyExitCode !== undefined) return true
  if (!state.ptyExit) throw new Error("Attach PTY exit tracking was not initialized")
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      state.ptyExit.then(() => true),
      new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function buildResult(state: RunState): CaseRunResult {
  return {
    stdout: state.serveReaders?.stdout() ?? "",
    stderr: state.serveReaders?.stderr() ?? "",
    details: {
      url: `http://127.0.0.1:${state.port}`,
      sessionID: SESSION_ID,
      title: SESSION_TITLE,
      port: state.port,
      startupMs: state.startupMs,
      serveExitCode: state.serveExitCode,
      attachExitCode: state.ptyExitCode,
    },
  }
}

async function cleanup(ctx: CaseContext, tempRoot: string, state: RunState) {
  const errors: unknown[] = []
  await stopPty(state).catch((error) => errors.push(error))
  await stopLongRunningProcess(state.serveProc).then(
    (exitCode) => (state.serveExitCode = exitCode),
    (error) => errors.push(error),
  )
  if (state.serveReaders) {
    await waitForReadersDone(state.serveReaders.done, 3000).catch((error) => errors.push(error))
  }
  try {
    await writeArtifacts(ctx, state)
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined)
  }
  if (errors.length > 0 && state.phase !== "error") throw new AggregateError(errors, "Failed to clean up attach case")
}

async function stopPty(state: RunState) {
  if (!state.ptyProc || state.ptyExitCode !== undefined) return
  state.ptyProc.kill()
  if (!(await waitForPtyExit(state, 3000))) throw new Error("Attach PTY did not exit during cleanup")
}

async function writeArtifacts(ctx: CaseContext, state: RunState) {
  const connection = {
    url: `http://127.0.0.1:${state.port}`,
    sessionID: SESSION_ID,
    title: SESSION_TITLE,
    port: state.port,
    startupMs: state.startupMs,
    phase: state.phase,
    error: state.errorMessage,
    serveExitCode: state.serveExitCode,
    attachExitCode: state.ptyExitCode,
  }
  await Promise.all([
    ctx.writeArtifact(CASE_ID, "serve-stdout.log", state.serveReaders?.stdout() ?? ""),
    ctx.writeArtifact(CASE_ID, "serve-stderr.log", state.serveReaders?.stderr() ?? ""),
    ctx.writeArtifact(CASE_ID, "attach-terminal.log", stripAnsi(state.ptyOutput)),
    ctx.writeArtifact(CASE_ID, "attach-terminal-raw.log", state.ptyOutput),
    ctx.writeArtifact(CASE_ID, "connection.json", JSON.stringify(connection, null, 2)),
  ])
}

export default testCase
