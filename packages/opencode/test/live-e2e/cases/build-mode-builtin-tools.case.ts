import stripAnsi from "strip-ansi"
import { buildEnv, findDevEcoHome, sdkPath } from "../../../src/tool/lib/env"
import { realUserEnv } from "../env"
import type { LiveTestCase } from "../types"

const CASE_ID = "BUILD_MODE_BUILTIN_TOOLS"

const EXPECTED_TOOLS = [
  "build_project",
  "start_app",
  "hdc_log",
  "switch_cwd",
  "arkts_knowledge_search",
  "plan_enter",
]

const testCase: LiveTestCase = {
  id: CASE_ID,
  title: "build模式内置工具列表",
  category: "cli",
  priority: "P1",
  timeoutMs: 120_000,
  requires: ["huawei-auth", "deveco-provider", "deveco-home"],
  description: "验证 deveco debug agent build 不带 --tool 时返回的工具列表包含所有预期的内置工具且处于启用状态。",
  steps: [
    "发现本机 DevEco Studio 安装路径。",
    "使用真实用户环境和 buildEnv 构建环境变量。",
    "执行 deveco debug agent build（不带 --tool 参数）。",
    "解析输出的 JSON 结果。",
    "验证 tools 字段包含所有预期工具且值均为 true（启用）：build_project, start_app, hdc_log, switch_cwd, arkts_knowledge_search, plan_enter。",
  ],
  expected: [
    "命令退出码为 0。",
    "输出为合法 JSON，包含 tools 字段。",
    "tools 中包含 build_project, start_app, hdc_log, switch_cwd, arkts_knowledge_search, plan_enter 且值均为 true。",
  ],
  code: "packages/opencode/test/live-e2e/cases/build-mode-builtin-tools.case.ts",
  parallel: false,
  cleanup: "用例不创建临时工程；真实 DevEco 安装、auth/config 只读不清理。",
  async run(ctx) {
    const home = await findDevEcoHome()
    if (!home) throw new Error("DevEco Studio was not found")

    const result = await ctx.runDeveco(
      ["debug", "agent", "build"],
      { env: makeEnv(home), timeoutMs: 60_000 },
    )

    await Promise.all([
      ctx.writeArtifact(CASE_ID, "stdout.log", result.stdout),
      ctx.writeArtifact(CASE_ID, "stderr.log", result.stderr),
    ])

    if (result.exitCode !== 0) {
      throw new Error(`debug agent build exited with ${result.exitCode}\nstderr: ${result.stderr}\nstdout: ${result.stdout}`)
    }

    const agentInfo = parseAgentOutput(result.stdout)
    const tools = validateToolsField(agentInfo)
    verifyEnabled(tools)

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      details: {
        exitCode: result.exitCode,
        commandDurationMs: result.durationMs,
        devecoHome: home,
        agentName: agentInfo.name,
        totalTools: Object.keys(tools).length,
        expectedTools: EXPECTED_TOOLS,
        verifiedEnabled: EXPECTED_TOOLS.filter((name) => tools[name] === true),
      },
    }
  },
}

function makeEnv(home: string) {
  return {
    ...realUserEnv(),
    ...buildEnv(home, sdkPath(home)),
  }
}

function parseAgentOutput(stdout: string) {
  const clean = stripAnsi(stdout)
  const start = clean.indexOf("{")
  const end = clean.lastIndexOf("}")
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`debug agent stdout did not contain JSON: ${stdout}`)
  }
  const parsed = JSON.parse(clean.slice(start, end + 1)) as Record<string, unknown>
  if (typeof parsed.name !== "string") {
    throw new Error(`Expected agent name in output, got: ${JSON.stringify(parsed).slice(0, 200)}`)
  }
  return parsed
}

function validateToolsField(agentInfo: Record<string, unknown>) {
  const tools = agentInfo.tools
  if (!tools || typeof tools !== "object" || Array.isArray(tools)) {
    throw new Error(`Expected tools object in agent output, got: ${typeof tools}`)
  }
  return tools as Record<string, unknown>
}

function verifyEnabled(tools: Record<string, unknown>) {
  const missing = EXPECTED_TOOLS.filter((name) => !(name in tools))
  if (missing.length > 0) {
    throw new Error(`Missing expected tools: ${missing.join(", ")}\nAvailable: ${Object.keys(tools).join(", ")}`)
  }
  const disabled = EXPECTED_TOOLS.filter((name) => tools[name] !== true)
  if (disabled.length > 0) {
    throw new Error(`Expected tools to be enabled (true): ${disabled.join(", ")}\nValues: ${disabled.map((name) => `${name}=${String(tools[name])}`).join(", ")}`)
  }
}

export default testCase
