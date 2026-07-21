import stripAnsi from "strip-ansi"
import type { LiveTestCase } from "../types"

const CASE_ID = "MODELS_LIST"

const testCase: LiveTestCase = {
  id: CASE_ID,
  title: "列出可用模型",
  category: "cli",
  priority: "P1",
  timeoutMs: 60_000,
  requires: ["huawei-auth"],
  description: "验证 deveco models 可列出当前可用的所有模型，输出包含 provider/model 格式的模型列表。",
  steps: [
    "执行 deveco models。",
    "验证命令退出码为 0。",
    "验证输出包含至少一个 provider/model 格式的模型条目。",
  ],
  expected: [
    "deveco models 退出码为 0。",
    "输出包含至少一个 provider/model 格式的模型条目。",
  ],
  code: "packages/opencode/test/live-e2e/cases/models-list.case.ts",
  parallel: false,
  cleanup: "用例不创建任何临时文件或工程；真实 auth/config 只读不清理。",
  async run(ctx) {
    const result = await ctx.runDeveco(["models"], { timeoutMs: 30_000 })
    await Promise.all([
      ctx.writeArtifact(CASE_ID, "stdout.log", result.stdout),
      ctx.writeArtifact(CASE_ID, "stderr.log", result.stderr),
    ])

    if (result.exitCode !== 0) {
      throw new Error(`deveco models exited with ${result.exitCode}\nstderr: ${result.stderr}\nstdout: ${result.stdout}`)
    }

    validateModelsOutput(stripAnsi(result.stdout))

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      details: { exitCode: result.exitCode, commandDurationMs: result.durationMs },
    }
  },
}

function validateModelsOutput(output: string) {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)

  if (lines.length === 0) {
    throw new Error(`Output is empty, expected at least one model entry:\n${output}`)
  }

  const modelPattern = /^[^/]+\/.+$/
  const modelLines = lines.filter((line) => modelPattern.test(line))

  if (modelLines.length === 0) {
    throw new Error(`Output does not contain any provider/model entries:\n${output}`)
  }
}

export default testCase
