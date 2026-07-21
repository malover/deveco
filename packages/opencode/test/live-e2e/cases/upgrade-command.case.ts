import stripAnsi from "strip-ansi"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import type { CaseContext, LiveTestCase, RunCommandResult } from "../types"

const CASE_ID = "UPGRADE_COMMAND"

const testCase: LiveTestCase = {
  id: CASE_ID,
  title: "upgrade命令验证",
  category: "cli",
  priority: "P1",
  timeoutMs: 60_000,
  requires: [],
  description: "验证 upgrade 命令已注册，并在指定当前版本时安全地跳过升级。",
  steps: [
    "执行 deveco upgrade --help。",
    "验证帮助包含 target 位置参数和 --method 选项。",
    "以当前安装版本和 --method bun 执行升级命令，验证跳过升级。",
  ],
  expected: [
    "upgrade 帮助命令退出码为 0，包含 upgrade [target] 和 --method。",
    "指定当前版本后命令退出码为 0，输出包含 already installed 或 skipped。",
  ],
  code: "packages/opencode/test/live-e2e/cases/upgrade-command.case.ts",
  parallel: false,
  cleanup: "用例不创建临时工程；指定当前版本只验证跳过分支，不修改用户配置或安装状态。",
  async run(ctx) {
    const help = await ctx.runDeveco(["upgrade", "--help"], { timeoutMs: 30_000 })
    await writeArtifacts(ctx, "help", help)
    requireSuccess(help, "deveco upgrade --help")
    validateHelp(commandOutput(help))

    const result = await ctx.runDeveco(["upgrade", InstallationVersion, "--method", "bun"], { timeoutMs: 30_000 })
    await writeArtifacts(ctx, "current-version", result)
    requireSuccess(result, `deveco upgrade ${InstallationVersion}`)
    validateSkip(commandOutput(result))

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      details: {
        exitCode: result.exitCode,
        commandDurationMs: result.durationMs,
        installationVersion: InstallationVersion,
        helpExitCode: help.exitCode,
      },
    }
  },
}

async function writeArtifacts(ctx: CaseContext, name: string, result: RunCommandResult) {
  await Promise.all([
    ctx.writeArtifact(CASE_ID, `${name}-stdout.log`, result.stdout),
    ctx.writeArtifact(CASE_ID, `${name}-stderr.log`, result.stderr),
  ])
}

function requireSuccess(result: RunCommandResult, command: string) {
  if (result.exitCode !== 0) {
    throw new Error(`${command} exited with ${result.exitCode}\nstderr: ${result.stderr}\nstdout: ${result.stdout}`)
  }
}

function commandOutput(result: RunCommandResult) {
  return stripAnsi(`${result.stdout}\n${result.stderr}`)
}

function validateHelp(output: string) {
  if (!/upgrade\s+\[target\]/i.test(output)) throw new Error(`Expected upgrade [target] help:\n${output}`)
  if (!/--method\b/i.test(output)) throw new Error(`Expected --method option in help:\n${output}`)
}

function validateSkip(output: string) {
  if (!/(already installed|skipped)/i.test(output)) {
    throw new Error(`Expected current-version upgrade to be skipped:\n${output}`)
  }
}

export default testCase
