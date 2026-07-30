import fs from "node:fs/promises"
import path from "node:path"
import stripAnsi from "strip-ansi"
import { realUserEnv } from "../env"
import type { CaseRunResult, LiveTestCase, RunCommandResult } from "../types"

const CASE_ID = "TOKEN_STATS"
const SESSION_ID = "ses_live_e2e_token_stats"
const SESSION_TITLE = "Live E2E Token Stats Session"
const SESSION_SLUG = "live-e2e-token-stats"
const FIXED_TIMESTAMP = 1700000000000
const FIXED_COST = 1.25
const FIXED_TOKENS = {
  input: 120,
  output: 45,
  reasoning: 0,
  cache: { read: 10, write: 5 },
}
const TOTAL_TOKENS =
  FIXED_TOKENS.input + FIXED_TOKENS.output + FIXED_TOKENS.reasoning + FIXED_TOKENS.cache.read + FIXED_TOKENS.cache.write

const testCase: LiveTestCase = {
  id: CASE_ID,
  title: "查看 Token 使用统计",
  category: "cli",
  priority: "P1",
  timeoutMs: 60_000,
  requires: [],
  description:
    "验证 deveco stats 在隔离数据库中导入带固定 token 和 cost 数据的会话后，总量统计面板正确展示会话数、消息数、成本及各类 token。",
  steps: [
    "创建隔离临时工作目录和 SQLite 数据库。",
    "写入固定 session.json fixture（包含 cost 和 tokens，空 messages）。",
    "执行 deveco import session.json 将固定会话写入隔离数据库。",
    "执行 deveco stats 查看总量统计。",
    "验证 OVERVIEW 和 COST & TOKENS 面板中各项数值与 fixture 一致。",
  ],
  expected: [
    "import 命令退出码为 0，stdout 包含 Imported session: ses_live_e2e_token_stats。",
    "stats 命令退出码为 0，stdout 非空。",
    "OVERVIEW 面板：Sessions=1, Messages=0, Days=1。",
    "COST & TOKENS 面板：Total Cost=$1.25, Avg Cost/Day=$1.25, Avg Tokens/Session=180, Median Tokens/Session=180。",
    "COST & TOKENS 面板：Input=120, Output=45, Cache Read=10, Cache Write=5。",
    "stdout 不包含 NaN 或 Large dataset detected。",
  ],
  code: "packages/opencode/test/live-e2e/cases/token-stats.case.ts",
  parallel: false,
  cleanup: "临时 workspace、fixture 和 SQLite 数据库随临时目录删除，真实用户状态不受影响。",
  async run(ctx) {
    const tempRoot = await ctx.createTempWorkspace("token-stats-")
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

      const statsResult = await ctx.runDeveco(["stats"], {
        cwd: workspace,
        env,
        timeoutMs: 30_000,
      })
      await writeArtifacts(ctx, "stats", statsResult)
      assertStatsOutput(statsResult)

      return buildResult(importResult, statsResult)
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
      cost: FIXED_COST,
      tokens: FIXED_TOKENS,
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
  command: "import" | "stats",
  result: RunCommandResult,
) {
  await Promise.all([
    ctx.writeArtifact(CASE_ID, `${command}-stdout.log`, result.stdout),
    ctx.writeArtifact(CASE_ID, `${command}-stderr.log`, result.stderr),
  ])
}

function assertStatsOutput(result: RunCommandResult) {
  if (result.exitCode !== 0) {
    throw new Error(`stats exited with ${result.exitCode}\nstderr: ${result.stderr}\nstdout: ${result.stdout}`)
  }
  const clean = stripAnsi(result.stdout)
  if (!clean.trim()) {
    throw new Error(`stats stdout is empty\nstderr: ${result.stderr}`)
  }
  if (clean.includes("NaN")) {
    throw new Error(`stats stdout contains NaN\nstdout: ${result.stdout}`)
  }
  if (clean.includes("Large dataset detected")) {
    throw new Error(`stats stdout contains "Large dataset detected"\nstdout: ${result.stdout}`)
  }

  assertSectionHeaders(clean)
  assertOverviewPanel(clean)
  assertCostTokensPanel(clean)
}

function assertSectionHeaders(clean: string) {
  if (!clean.includes("OVERVIEW")) {
    throw new Error(`stats stdout missing OVERVIEW section\nstdout: ${clean}`)
  }
  if (!clean.includes("COST & TOKENS")) {
    throw new Error(`stats stdout missing COST & TOKENS section\nstdout: ${clean}`)
  }
}

function assertOverviewPanel(clean: string) {
  assertStatRow(clean, "Sessions", "1")
  assertStatRow(clean, "Messages", "0")
  assertStatRow(clean, "Days", "1")
}

function assertCostTokensPanel(clean: string) {
  assertStatRow(clean, "Total Cost", "$1.25")
  assertStatRow(clean, "Avg Cost/Day", "$1.25")
  assertStatRow(clean, "Avg Tokens/Session", "180")
  assertStatRow(clean, "Median Tokens/Session", "180")
  assertStatRow(clean, "Input", "120")
  assertStatRow(clean, "Output", "45")
  assertStatRow(clean, "Cache Read", "10")
  assertStatRow(clean, "Cache Write", "5")
}

function assertStatRow(clean: string, label: string, expectedValue: string) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const pattern = new RegExp(`│\\s*${escapedLabel}\\s+${expectedValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+│`)
  const lines = clean.split("\n")
  const matched = lines.some((line) => pattern.test(line))
  if (!matched) {
    throw new Error(
      `Expected stats output to contain row with label "${label}" and value "${expectedValue}"\nstdout:\n${clean}`,
    )
  }
}

function buildResult(importResult: RunCommandResult, statsResult: RunCommandResult): CaseRunResult {
  return {
    stdout: statsResult.stdout,
    stderr: statsResult.stderr,
    details: {
      importExitCode: importResult.exitCode,
      importDurationMs: importResult.durationMs,
      statsExitCode: statsResult.exitCode,
      statsDurationMs: statsResult.durationMs,
      sessionID: SESSION_ID,
      totalCost: FIXED_COST,
      inputTokens: FIXED_TOKENS.input,
      outputTokens: FIXED_TOKENS.output,
      cacheReadTokens: FIXED_TOKENS.cache.read,
      cacheWriteTokens: FIXED_TOKENS.cache.write,
      totalTokens: TOTAL_TOKENS,
      expectedSessionCount: 1,
      expectedMessageCount: 0,
    },
  }
}

export default testCase
