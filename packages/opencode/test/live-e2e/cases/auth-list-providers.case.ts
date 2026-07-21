import stripAnsi from "strip-ansi"
import type { LiveTestCase } from "../types"

const CASE_ID = "AUTH_LIST_PROVIDERS"

const testCase: LiveTestCase = {
  id: CASE_ID,
  title: "列出已认证的AI服务供应商",
  category: "cli",
  priority: "P1",
  timeoutMs: 60_000,
  requires: ["huawei-auth"],
  description: "验证 deveco auth list 可列出 deveco（显示名为 DevEco Code）的 oauth 凭证及凭证数量。",
  steps: ["执行 deveco auth list。", "验证命令成功且输出包含 Credentials、deveco、oauth 和凭证数量。"],
  expected: ["deveco auth list 退出码为 0。", "输出包含 Credentials 标题、deveco、oauth 以及凭证数量统计。"],
  code: "packages/opencode/test/live-e2e/cases/auth-list-providers.case.ts",
  parallel: false,
  cleanup: "用例不创建任何临时文件或工程；真实 auth/config 只读不清理。",
  async run(ctx) {
    const result = await ctx.runDeveco(["auth", "list"], { timeoutMs: 30_000 })
    await Promise.all([
      ctx.writeArtifact(CASE_ID, "stdout.log", result.stdout),
      ctx.writeArtifact(CASE_ID, "stderr.log", result.stderr),
    ])
    if (result.exitCode !== 0) {
      throw new Error(
        `deveco auth list exited with ${result.exitCode}\nstderr: ${result.stderr}\nstdout: ${result.stdout}`,
      )
    }

    validateAuthList(stripAnsi(result.stdout))
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      details: { exitCode: result.exitCode, commandDurationMs: result.durationMs },
    }
  },
}

function validateAuthList(output: string) {
  if (!/Credentials/i.test(output)) throw new Error(`Expected Credentials heading:\n${output}`)
  if (!/\bdeveco(?:\s+code)?\b/i.test(output)) throw new Error(`Expected deveco credential:\n${output}`)
  if (!/oauth/i.test(output)) throw new Error(`Expected oauth credential type:\n${output}`)
  if (!/\b\d+\s+credentials?\b/i.test(output)) {
    throw new Error(`Expected credential count summary:\n${output}`)
  }
}

export default testCase
