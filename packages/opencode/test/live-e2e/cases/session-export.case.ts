import fs from "node:fs/promises"
import path from "node:path"
import stripAnsi from "strip-ansi"
import { realUserEnv } from "../env"
import type { CaseRunResult, LiveTestCase, RunCommandResult } from "../types"

const CASE_ID = "SESSION_EXPORT"
const SESSION_ID = "ses_live_e2e_export_minimal"
const SESSION_TITLE = "Live E2E Export Minimal Session"
const SESSION_SLUG = "live-e2e-export-minimal"
const FIXED_TIMESTAMP = 1700000000000

const testCase: LiveTestCase = {
  id: CASE_ID,
  title: "导出指定会话",
  category: "cli",
  priority: "P1",
  timeoutMs: 60_000,
  requires: [],
  description: "验证 deveco export 可通过明确 session ID 导出指定会话，输出符合 JSON 数据契约。",
  steps: [
    "创建隔离临时工作目录和 SQLite 数据库。",
    "写入固定 session.json fixture。",
    "执行 deveco import session.json 将固定会话写入隔离数据库。",
    "执行 deveco export <SESSION_ID> 导出该会话。",
    "解析 export stdout JSON 并验证数据契约。",
  ],
  expected: [
    "import 命令退出码为 0，stdout 包含固定 session ID。",
    "export 命令退出码为 0，stdout 可直接 JSON.parse。",
    "JSON 顶层同时包含 info 和 messages。",
    "info.id、info.slug、info.title、info.time 与固定值一致。",
    "info.directory 解析后等于临时 workspace（Windows 不区分大小写）。",
    "messages 是数组且长度为 0。",
    "stderr 包含 Exporting session: <SESSION_ID>。",
  ],
  code: "packages/opencode/test/live-e2e/cases/session-export.case.ts",
  parallel: false,
  cleanup: "临时 workspace、fixture 和 SQLite 数据库随临时目录删除，真实用户状态不受影响。",
  async run(ctx) {
    const tempRoot = await ctx.createTempWorkspace("session-export-")
    try {
      const workspace = path.join(tempRoot, "workspace")
      await fs.mkdir(workspace, { recursive: true })

      const env = buildIsolatedEnv(tempRoot)
      await writeFixtureFile(workspace)

      const importResult = await ctx.runDeveco(["import", "session.json"], {
        cwd: workspace,
        env,
        timeoutMs: 30_000,
      })
      await writeArtifacts(ctx, "import", importResult)
      assertImportSuccess(importResult)

      const exportResult = await ctx.runDeveco(["export", SESSION_ID], {
        cwd: workspace,
        env,
        timeoutMs: 30_000,
      })
      await writeArtifacts(ctx, "export", exportResult)

      const exportData = parseExportData(exportResult)
      validateExportData(exportData, exportResult, workspace)

      return buildResult(importResult, exportResult, exportData)
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined)
    }
  },
}

function buildIsolatedEnv(tempRoot: string): Record<string, string | undefined> {
  return {
    ...realUserEnv(),
    DEVECO_TEST_HOME: tempRoot,
    DEVECO_DB: path.join(tempRoot, "deveco.db"),
    XDG_DATA_HOME: path.join(tempRoot, "data"),
    XDG_CACHE_HOME: path.join(tempRoot, "cache"),
    XDG_CONFIG_HOME: path.join(tempRoot, "config"),
    XDG_STATE_HOME: path.join(tempRoot, "state"),
    DEVECO_CONFIG_DIR: path.join(tempRoot, "config", "deveco"),
    DEVECO_PURE: "1",
  }
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

async function writeFixtureFile(workspace: string) {
  const content = JSON.stringify(buildFixtureData(workspace), null, 2)
  await Bun.write(path.join(workspace, "session.json"), content)
}

function assertImportSuccess(result: RunCommandResult) {
  if (result.exitCode !== 0) {
    throw new Error(`import exited with ${result.exitCode}\nstderr: ${result.stderr}\nstdout: ${result.stdout}`)
  }
  const clean = stripAnsi(result.stdout)
  const expected = `Imported session: ${SESSION_ID}`
  if (!clean.includes(expected)) {
    throw new Error(`Expected stdout to contain "${expected}"\nstdout: ${result.stdout}`)
  }
}

async function writeArtifacts(
  ctx: { writeArtifact: (caseID: string, filename: string, content: string) => Promise<string> },
  command: "import" | "export",
  result: RunCommandResult,
) {
  await Promise.all([
    ctx.writeArtifact(CASE_ID, `${command}-stdout.log`, result.stdout),
    ctx.writeArtifact(CASE_ID, `${command}-stderr.log`, result.stderr),
  ])
}

function parseExportData(result: RunCommandResult): Record<string, unknown> {
  if (result.exitCode !== 0) {
    throw new Error(`export exited with ${result.exitCode}\nstderr: ${result.stderr}\nstdout: ${result.stdout}`)
  }
  const trimmed = result.stdout.trim()
  if (!trimmed) {
    throw new Error(`export stdout is empty\nstderr: ${result.stderr}`)
  }
  const parsed = JSON.parse(trimmed) as unknown
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Expected JSON object from export stdout, got ${typeof parsed}\nstdout: ${result.stdout}`)
  }
  return parsed as Record<string, unknown>
}

function validateExportData(data: Record<string, unknown>, exportResult: RunCommandResult, workspace: string) {
  const info = data.info
  if (typeof info !== "object" || info === null || Array.isArray(info)) {
    throw new Error(`Expected info to be an object, got ${typeof info}`)
  }
  const messages = data.messages
  if (!Array.isArray(messages)) {
    throw new Error(`Expected messages to be an array, got ${typeof messages}`)
  }

  validateInfoFields(info as Record<string, unknown>, workspace)
  validateExportStderr(exportResult)

  if (messages.length !== 0) {
    throw new Error(`Expected 0 messages, got ${messages.length}`)
  }
}

function validateInfoFields(info: Record<string, unknown>, workspace: string) {
  if (info.id !== SESSION_ID) {
    throw new Error(`Expected info.id "${SESSION_ID}", got "${String(info.id)}"`)
  }
  if (info.slug !== SESSION_SLUG) {
    throw new Error(`Expected info.slug "${SESSION_SLUG}", got "${String(info.slug)}"`)
  }
  if (info.title !== SESSION_TITLE) {
    throw new Error(`Expected info.title "${SESSION_TITLE}", got "${String(info.title)}"`)
  }

  const time = info.time as Record<string, unknown> | undefined
  if (typeof time !== "object" || time === null) {
    throw new Error(`Expected info.time to be an object, got ${typeof time}`)
  }
  if (time.created !== FIXED_TIMESTAMP) {
    throw new Error(`Expected info.time.created ${FIXED_TIMESTAMP}, got ${String(time.created)}`)
  }
  if (time.updated !== FIXED_TIMESTAMP) {
    throw new Error(`Expected info.time.updated ${FIXED_TIMESTAMP}, got ${String(time.updated)}`)
  }

  const expectedDir = path.resolve(workspace)
  const actualDir = path.resolve(String(info.directory))
  if (actualDir.toLowerCase() !== expectedDir.toLowerCase()) {
    throw new Error(`Expected info.directory "${expectedDir}", got "${actualDir}"`)
  }
}

function validateExportStderr(result: RunCommandResult) {
  const clean = stripAnsi(result.stderr)
  const expected = `Exporting session: ${SESSION_ID}`
  if (!clean.includes(expected)) {
    throw new Error(`Expected stderr to contain "${expected}"\nstderr: ${result.stderr}`)
  }
  if (clean.includes("Session not found")) {
    throw new Error(`stderr contains "Session not found"\nstderr: ${result.stderr}`)
  }
}

function buildResult(
  importResult: RunCommandResult,
  exportResult: RunCommandResult,
  exportData: Record<string, unknown>,
): CaseRunResult {
  const info = exportData.info as Record<string, unknown>
  const messages = exportData.messages as unknown[]
  return {
    stdout: exportResult.stdout,
    stderr: exportResult.stderr,
    details: {
      importExitCode: importResult.exitCode,
      importDurationMs: importResult.durationMs,
      exportExitCode: exportResult.exitCode,
      exportDurationMs: exportResult.durationMs,
      exportedSessionID: info.id,
      exportedTitle: info.title,
      exportedMessageCount: messages.length,
      exportedDirectory: info.directory,
    },
  }
}

export default testCase
