import stripAnsi from "strip-ansi"
import type { LiveTestCase } from "../types"

const CASE_ID = "AGENT_LIST"

const testCase: LiveTestCase = {
  id: CASE_ID,
  title: "列出所有agent",
  category: "cli",
  priority: "P1",
  timeoutMs: 60_000,
  requires: [],
  description: "验证 deveco agent list 可列出所有可用的 agent，输出包含 agent 名称和模式。",
  steps: [
    "执行 deveco agent list。",
    "验证命令退出码为 0。",
    "验证输出包含至少一个 agent 条目（name (mode) 格式）。",
  ],
  expected: [
    "deveco agent list 退出码为 0。",
    "输出包含至少一个 agent 的名称和模式信息。",
  ],
  code: "packages/opencode/test/live-e2e/cases/agent-list.case.ts",
  parallel: false,
  cleanup: "用例不创建任何临时文件或工程；真实 auth/config 只读不清理。",
  async run(ctx) {
    const result = await ctx.runDeveco(["agent", "list"], { timeoutMs: 30_000 })
    await Promise.all([
      ctx.writeArtifact(CASE_ID, "stdout.log", result.stdout),
      ctx.writeArtifact(CASE_ID, "stderr.log", result.stderr),
    ])

    if (result.exitCode !== 0) {
      throw new Error(`deveco agent list exited with ${result.exitCode}\nstderr: ${result.stderr}\nstdout: ${result.stdout}`)
    }

    validateAgentListOutput(stripAnsi(result.stdout))

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      details: { exitCode: result.exitCode, commandDurationMs: result.durationMs },
    }
  },
}

function validateAgentListOutput(output: string) {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)

  if (lines.length === 0) {
    throw new Error(`Output is empty, expected at least one agent entry:\n${output}`)
  }

  const agentPattern = /^\S+\s+\((?:all|primary|subagent)\)$/
  const agentLines = lines.filter((line) => agentPattern.test(line))

  if (agentLines.length === 0) {
    throw new Error(`Output does not contain any agent entries in 'name (mode)' format:\n${output}`)
  }
}

export default testCase
