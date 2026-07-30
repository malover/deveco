import fs from "node:fs/promises"
import path from "node:path"
import stripAnsi from "strip-ansi"
import { realUserEnv } from "../env"
import type { CaseRunResult, LiveTestCase, RunCommandResult } from "../types"

const CASE_ID = "SESSION_IMPORT"
const SESSION_ID = "ses_live_e2e_import_minimal"
const SESSION_TITLE = "Live E2E Imported Minimal Session"
const SESSION_SLUG = "live-e2e-import-minimal"
const FIXED_TIMESTAMP = 1700000000000

const testCase: LiveTestCase = {
  id: CASE_ID,
  title: "导入最简会话",
  category: "cli",
  priority: "P1",
  timeoutMs: 60_000,
  requires: [],
  description:
    "验证 deveco import 可从本地 JSON 文件导入最简会话（空 messages），并通过 session list --format json 验证持久化结果。",
  steps: [
    "创建隔离临时工作目录和 SQLite 数据库。",
    "在临时目录生成 seesion.json（最简会话数据）。",
    "执行 deveco import seesion.json。",
    "执行 deveco session list --format json --max-count 10 验证导入结果。",
  ],
  expected: [
    "import 命令退出码为 0，stdout 包含 Imported session: ses_live_e2e_import_minimal。",
    "session list 输出 JSON 数组中包含导入的会话，id、title、created、updated 与预置值一致。",
  ],
  code: "packages/opencode/test/live-e2e/cases/session-import.case.ts",
  parallel: false,
  cleanup: "临时 workspace、JSON 文件和 SQLite 数据库均随临时目录删除，真实用户状态不受影响。",
  async run(ctx) {
    const tempRoot = await ctx.createTempWorkspace("session-import-")
    try {
      const workspace = path.join(tempRoot, "workspace")
      await fs.mkdir(workspace, { recursive: true })

      const env = buildIsolatedEnv(tempRoot)
      await writeFixtureFile(workspace)

      const importResult = await ctx.runDeveco(["import", "seesion.json"], {
        cwd: workspace,
        env,
        timeoutMs: 30_000,
      })
      await writeImportArtifacts(ctx, importResult)
      assertImportSuccess(importResult)

      const listResult = await ctx.runDeveco(["session", "list", "--format", "json", "--max-count", "10"], {
        cwd: workspace,
        env,
        timeoutMs: 30_000,
      })
      await writeListArtifacts(ctx, listResult)
      const matched = assertListContainsImportedSession(listResult, workspace)

      return buildResult(importResult, listResult, matched)
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
  await Bun.write(path.join(workspace, "seesion.json"), content)
}

async function writeImportArtifacts(
  ctx: { writeArtifact: (caseID: string, filename: string, content: string) => Promise<string> },
  result: RunCommandResult,
) {
  await Promise.all([
    ctx.writeArtifact(CASE_ID, "import-stdout.log", result.stdout),
    ctx.writeArtifact(CASE_ID, "import-stderr.log", result.stderr),
  ])
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

async function writeListArtifacts(
  ctx: { writeArtifact: (caseID: string, filename: string, content: string) => Promise<string> },
  result: RunCommandResult,
) {
  await Promise.all([
    ctx.writeArtifact(CASE_ID, "list-stdout.log", result.stdout),
    ctx.writeArtifact(CASE_ID, "list-stderr.log", result.stderr),
  ])
}

function assertListContainsImportedSession(result: RunCommandResult, workspace: string) {
  if (result.exitCode !== 0) {
    throw new Error(`session list exited with ${result.exitCode}\nstderr: ${result.stderr}\nstdout: ${result.stdout}`)
  }

  const sessions = parseSessionListJSON(result.stdout)
  const matched = sessions.find((s) => s.id === SESSION_ID)
  if (!matched) {
    throw new Error(`Imported session not found in list output:\n${result.stdout}`)
  }

  validateImportedSession(matched, workspace)
  return matched
}

function parseSessionListJSON(stdout: string): Array<Record<string, unknown>> {
  const trimmed = stdout.trim()
  if (!trimmed) throw new Error("session list --format json returned empty output")
  const parsed = JSON.parse(trimmed)
  if (!Array.isArray(parsed)) throw new Error(`Expected JSON array from session list:\n${trimmed}`)
  return parsed
}

function validateImportedSession(session: Record<string, unknown>, workspace: string) {
  if (session.title !== SESSION_TITLE) {
    throw new Error(`Expected title "${SESSION_TITLE}", got "${String(session.title)}"`)
  }
  if (session.created !== FIXED_TIMESTAMP) {
    throw new Error(`Expected created ${FIXED_TIMESTAMP}, got ${String(session.created)}`)
  }
  if (session.updated !== FIXED_TIMESTAMP) {
    throw new Error(`Expected updated ${FIXED_TIMESTAMP}, got ${String(session.updated)}`)
  }

  const expectedDir = path.resolve(workspace)
  const actualDir = path.resolve(String(session.directory))
  if (actualDir.toLowerCase() !== expectedDir.toLowerCase()) {
    throw new Error(`Expected directory "${expectedDir}", got "${actualDir}"`)
  }
  if (!session.projectId || typeof session.projectId !== "string") {
    throw new Error(`Expected non-empty projectId, got ${String(session.projectId)}`)
  }
}

function buildResult(
  importResult: RunCommandResult,
  listResult: RunCommandResult,
  matched: Record<string, unknown>,
): CaseRunResult {
  return {
    stdout: importResult.stdout,
    stderr: importResult.stderr,
    details: {
      importExitCode: importResult.exitCode,
      importDurationMs: importResult.durationMs,
      listExitCode: listResult.exitCode,
      listDurationMs: listResult.durationMs,
      importedSessionID: SESSION_ID,
      importedTitle: SESSION_TITLE,
      queriedProjectId: matched.projectId,
      queriedDirectory: matched.directory,
    },
  }
}

export default testCase
