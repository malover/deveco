import stripAnsi from "strip-ansi"
import { buildEnv, findDevEcoHome, sdkPath } from "../../../src/tool/lib/env"
import { realUserEnv } from "../env"
import type { LiveTestCase, RunCommandResult } from "../types"

const CASE_ID = "HDC_LOG_LIST_DEVICES"

const testCase: LiveTestCase = {
  id: CASE_ID,
  title: "hdc_log设备列表",
  category: "cli",
  priority: "P1",
  timeoutMs: 120_000,
  requires: ["huawei-auth", "deveco-provider", "deveco-home"],
  description: "验证 hdc_log 工具可通过 debug agent 调用 list_devices，并稳定处理有设备或无设备输出。",
  steps: [
    "发现本机 DevEco Studio 安装路径。",
    "使用与其他 DevEco 工具用例一致的真实用户环境和 buildEnv。",
    "通过 debug agent 直接调用 hdc_log list_devices。",
    "解析 debug tool JSON 输出。",
    "验证 hdc_log 返回设备数量，并接受有设备和无设备两种结果。",
  ],
  expected: [
    "hdc_log 工具执行成功。",
    "返回的 input.action 为 list_devices。",
    "metadata.deviceCount 是数字。",
    "无设备时返回 No Devices；有设备时返回 Connected Devices。",
  ],
  code: "packages/opencode/test/live-e2e/cases/hdc-log-list-devices.case.ts",
  parallel: false,
  cleanup: "用例不创建临时工程；真实 DevEco 安装、auth/config 和设备状态只读不清理。",
  async run(ctx) {
    const home = await findDevEcoHome()
    if (!home) throw new Error("DevEco Studio was not found")

    const result = await ctx.runDeveco(
      ["debug", "agent", "build", "--tool", "hdc_log", "--params", JSON.stringify({ action: "list_devices" })],
      { env: makeEnv(home), timeoutMs: 60_000 },
    )

    await Promise.all([
      ctx.writeArtifact(CASE_ID, "stdout.log", result.stdout),
      ctx.writeArtifact(CASE_ID, "stderr.log", result.stderr),
    ])

    if (result.exitCode !== 0) {
      throw new Error(`hdc_log list_devices exited with ${result.exitCode}\nstderr: ${result.stderr}\nstdout: ${result.stdout}`)
    }

    const parsed = parseDebugToolResult(result.stdout)
    const output = validateListDevicesResult(parsed)

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      details: {
        exitCode: result.exitCode,
        commandDurationMs: result.durationMs,
        devecoHome: home,
        title: output.title,
        deviceCount: output.deviceCount,
        hasDevices: output.deviceCount > 0,
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

function parseDebugToolResult(stdout: string) {
  const clean = stripAnsi(stdout)
  const start = clean.indexOf("{")
  const end = clean.lastIndexOf("}")
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`debug tool stdout did not contain JSON: ${stdout}`)
  }
  return JSON.parse(clean.slice(start, end + 1)) as { tool?: unknown; input?: unknown; result?: unknown }
}

function objectOf(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function validateListDevicesResult(parsed: { tool?: unknown; input?: unknown; result?: unknown }) {
  if (parsed.tool !== "hdc_log") {
    throw new Error(`Expected debug tool result for hdc_log, got ${String(parsed.tool)}`)
  }

  const input = objectOf(parsed.input, "hdc_log input")
  if (input.action !== "list_devices") {
    throw new Error(`Expected hdc_log action list_devices, got ${String(input.action)}`)
  }

  const result = objectOf(parsed.result, "hdc_log result")
  const metadata = objectOf(result.metadata, "hdc_log metadata")
  if (typeof metadata.deviceCount !== "number" || metadata.deviceCount < 0) {
    throw new Error(`hdc_log metadata.deviceCount must be a non-negative number, got ${String(metadata.deviceCount)}`)
  }

  const title = typeof result.title === "string" ? result.title : ""
  const output = typeof result.output === "string" ? result.output : ""

  if (metadata.deviceCount === 0) {
    if (title !== "No Devices") throw new Error(`Expected No Devices title, got ${title}`)
    if (!output.includes("No connected devices detected.")) {
      throw new Error(`Expected no-device output, got:\n${output}`)
    }
    return { title, output, deviceCount: metadata.deviceCount }
  }

  if (title !== "Connected Devices") throw new Error(`Expected Connected Devices title, got ${title}`)
  if (!output.includes("Connected devices:")) {
    throw new Error(`Expected connected-devices output, got:\n${output}`)
  }
  return { title, output, deviceCount: metadata.deviceCount }
}

export default testCase
