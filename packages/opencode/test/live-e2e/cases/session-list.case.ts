import stripAnsi from "strip-ansi"
import type { LiveTestCase } from "../types"

const CASE_ID = "SESSION_LIST"

const testCase: LiveTestCase = {
  id: CASE_ID,
  title: "列出所有会话",
  category: "cli",
  priority: "P1",
  timeoutMs: 60_000,
  requires: [],
  description: "验证 deveco session list 可列出所有会话，输出包含 Session ID、Title 和 Updated 列。",
  steps: [
    "执行 deveco session list。",
    "验证命令退出码为 0。",
    "验证输出包含表头行（含 Session ID、Title、Updated）。",
  ],
  expected: [
    "deveco session list 退出码为 0。",
    "输出包含至少一个会话条目（Session ID、Title、Updated 格式）。",
  ],
  code: "packages/opencode/test/live-e2e/cases/session-list.case.ts",
  parallel: false,
  cleanup: "用例不创建任何临时文件或工程；真实 auth/config 只读不清理。",
  async run(ctx) {
    const result = await ctx.runDeveco(["session", "list", "--max-count", "5"], { timeoutMs: 30_000 })
    await Promise.all([
      ctx.writeArtifact(CASE_ID, "stdout.log", result.stdout),
      ctx.writeArtifact(CASE_ID, "stderr.log", result.stderr),
    ])

    if (result.exitCode !== 0) {
      throw new Error(`deveco session list exited with ${result.exitCode}\nstderr: ${result.stderr}\nstdout: ${result.stdout}`)
    }

    validateSessionListOutput(stripAnsi(result.stdout))

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      details: { exitCode: result.exitCode, commandDurationMs: result.durationMs },
    }
  },
}

function validateSessionListOutput(output: string) {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)

  if (lines.length === 0) {
    throw new Error(`Output is empty, expected at least a header row:\n${output}`)
  }

  const headerPattern = /Session\s+ID\s+Title\s+Updated/i
  const hasHeader = lines.some((line) => headerPattern.test(line))

  if (!hasHeader) {
    throw new Error(`Output does not contain expected table header (Session ID, Title, Updated):\n${output}`)
  }
}

export default testCase
