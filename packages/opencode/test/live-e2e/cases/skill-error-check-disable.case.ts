import type { CaseContext, LiveTestCase } from "../types"
import fs from "node:fs/promises"

const CASE_ID = "SKILL_ERROR_DISABLE_CHECK"

function textFromEvent(event: Record<string, unknown>) {
  const part = event.part
  if (!part || typeof part !== "object") return undefined
  if (!("text" in part) || typeof part.text !== "string") return undefined
  return part.text
}

function parseEvents(stdout: string): Array<Record<string, unknown>> {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as Record<string, unknown>]
      } catch {
        return []
      }
    })
}

const testCase: LiveTestCase = {
  id: CASE_ID,
  title: "关闭ArkTS类型检查",
  category: "skill",
  priority: "P1",
  timeoutMs: 200_000,
  requires: ["huawei-auth", "real-llm", "deveco-provider"],
  description:
    "验证提问是否可以通过关闭ArkTS类型检查来保留动态属性写法时，AI 自动加载 arkts-error-fixes skill 并返回不能或不可关闭检查的建议。",
  steps: [
    "创建临时工作目录。",
    "执行 deveco run --format json --dir <tmp>，发送提问：是否可以通过关闭类型检查来保留动态属性写法。",
    "解析 stdout 中的 JSON line events。",
    "校验 text event 中包含不能或不可关闭类型检查的建议。",
  ],
  expected: [
    "进程正常退出或超时前有 text event 输出。",
    "模型返回文本包含不能或不可关闭类型检查的表述。",
  ],
  code: "packages/opencode/test/live-e2e/cases/skill-error-check-disable.case.ts",
  parallel: false,
  cleanup: "用例只创建临时工作目录；执行结束后删除临时目录。真实 auth/config 只读不清理。",
  async run(ctx) {
    const sentMessage = "在 ArkTS 中，是否可以通过关闭类型检查来保留动态属性写法，例如 obj[dynamicKey] = value？"
    const workspace = await ctx.createTempWorkspace("skill-disable-check-")

    try {
      const result = await runPrompt(ctx, workspace, sentMessage)
      const response = await parseAndVerifyResponse(ctx, result.stdout)

      return {
        sentMessage,
        receivedText: response.receivedText,
        sessionID: response.sessionID,
        stdout: result.stdout,
        stderr: result.stderr,
        events: response.events,
        details: {
          exitCode: result.exitCode,
          commandDurationMs: result.durationMs,
          textEventCount: response.textEventCount,
          workspace,
        },
      }
    } finally {
      try {
        await fs.rm(workspace, { recursive: true, force: true })
      } catch {
        // ignore cleanup errors
      }
    }
  },
}

async function runPrompt(ctx: CaseContext, workspace: string, sentMessage: string) {
  const result = await ctx.runDeveco(["run", "--format", "json", "--dir", workspace, sentMessage], {
    timeoutMs: 190_000,
  })
  await ctx.writeArtifact(CASE_ID, "stdout.log", result.stdout)
  await ctx.writeArtifact(CASE_ID, "stderr.log", result.stderr)
  return result
}

async function parseAndVerifyResponse(ctx: CaseContext, stdout: string) {
  const events = parseEvents(stdout)
  await ctx.writeArtifact(CASE_ID, "events.jsonl", events.map((event) => JSON.stringify(event)).join("\n"))
  const textEvents = events.filter((event) => event.type === "text")
  const receivedText = textEvents.map(textFromEvent).filter((text): text is string => Boolean(text)).join("\n")
  if (textEvents.length === 0) throw new Error("No text event was emitted")
  if (!hasCannotDisable(receivedText)) {
    throw new Error(
      `Expected response to contain cannot-disable suggestion (不能/不可/不建议/无法关闭), got: ${receivedText.substring(0, 300)}...`,
    )
  }
  return {
    events,
    receivedText,
    textEventCount: textEvents.length,
    sessionID: events.find((event) => typeof event.sessionID === "string")?.sessionID as string | undefined,
  }
}

function hasCannotDisable(receivedText: string) {
  return (
    receivedText.includes("不能") ||
    receivedText.includes("不可") ||
    receivedText.includes("不建议") ||
    receivedText.includes("无法关闭") ||
    receivedText.includes("不建议关闭")
  )
}

export default testCase
