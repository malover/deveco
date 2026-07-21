import stripAnsi from "strip-ansi"
import type { LiveTestCase } from "../types"

const CASE_ID = "DEVECO_TUI_START"

const testCase: LiveTestCase = {
  id: CASE_ID,
  title: "TUI 启动命令可用",
  category: "cli",
  priority: "P1",
  timeoutMs: 60_000,
  requires: [],
  description: "验证默认 TUI 启动命令已注册，并公开启动所需的项目、会话和提示参数。",
  steps: ["执行 deveco --help。", "验证帮助将默认命令描述为启动 DevEco TUI，并列出关键启动参数。"],
  expected: ["deveco --help 退出码为 0。", "帮助包含 start deveco tui、--prompt 和 --session。"],
  code: "packages/opencode/test/live-e2e/cases/deveco-tui-start.case.ts",
  parallel: false,
  cleanup: "用例不启动交互式 TUI，不创建或修改用户配置、会话或终端状态。",
  async run(ctx) {
    const result = await ctx.runDeveco(["--help"], { timeoutMs: 30_000 })
    await Promise.all([
      ctx.writeArtifact(CASE_ID, "stdout.log", result.stdout),
      ctx.writeArtifact(CASE_ID, "stderr.log", result.stderr),
    ])
    if (result.exitCode !== 0) {
      throw new Error(
        `deveco --help exited with ${result.exitCode}\nstderr: ${result.stderr}\nstdout: ${result.stdout}`,
      )
    }

    const output = stripAnsi(`${result.stdout}\n${result.stderr}`)
    if (!/start deveco tui/i.test(output)) throw new Error(`Expected default TUI command help:\n${output}`)
    if (!/--prompt\b/i.test(output) || !/--session\b/i.test(output)) {
      throw new Error(`Expected TUI startup options --prompt and --session:\n${output}`)
    }
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      details: { exitCode: result.exitCode, commandDurationMs: result.durationMs },
    }
  },
}

export default testCase
