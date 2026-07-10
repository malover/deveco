import type { LiveTestCase } from "../types"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"

const CASE_ID = "SKILL_ARKUI_IMAGE_TEXT_MIX"

const SKILL_NAME = "arkui-knowledge"
const OPENCODE_SKILLS_DIR = path.join(os.homedir(), ".config", "opencode", "skills", SKILL_NAME)
const DEVECO_SKILLS_DIR = path.join(os.homedir(), ".local", "share", "deveco", "skills", SKILL_NAME)

function textFromEvent(event: Record<string, unknown>) {
  const part = event.part
  if (!part || typeof part !== "object") return undefined
  if (!("text" in part) || typeof part.text !== "string") return undefined
  return part.text
}

function codeFromToolEvent(event: Record<string, unknown>): string | undefined {
  const part = event.part
  if (!part || typeof part !== "object") return undefined
  if (event.type !== "tool_use") return undefined
  const partRecord = part as Record<string, unknown>
  if (partRecord.type !== "tool") return undefined
  const state = partRecord.state
  if (!state || typeof state !== "object") return undefined
  const input = (state as Record<string, unknown>).input
  if (!input || typeof input !== "object") return undefined
  const inputRecord = input as Record<string, unknown>
  if ("content" in inputRecord && typeof inputRecord.content === "string") {
    return inputRecord.content
  }
  if ("newString" in inputRecord && typeof inputRecord.newString === "string") {
    return inputRecord.newString
  }
  return undefined
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

async function ensureArkuiSkillAvailable() {
  const sourceExists = await fs.stat(OPENCODE_SKILLS_DIR).then(() => true).catch(() => false)
  if (!sourceExists) {
    throw new Error(`arkui-knowledge skill not found at ${OPENCODE_SKILLS_DIR}. Please install it first.`)
  }
  const destExists = await fs.stat(DEVECO_SKILLS_DIR).then(() => true).catch(() => false)
  if (destExists) return false
  await fs.cp(OPENCODE_SKILLS_DIR, DEVECO_SKILLS_DIR, { recursive: true })
  return true
}

async function cleanupArkuiSkill(copied: boolean) {
  if (!copied) return
  try {
    await fs.rm(DEVECO_SKILLS_DIR, { recursive: true, force: true })
  } catch {
    // ignore
  }
}

const testCase: LiveTestCase = {
  id: CASE_ID,
  title: "图文混排",
  category: "skill",
  priority: "P0",
  timeoutMs: 200_000,
  requires: ["huawei-auth", "real-llm", "deveco-provider"],
  description:
    "验证输入创建图文混排的指令（如通知卡片，左边图片，右边文字内容），AI 能自动加载 arkui-knowledge skill 并返回使用 Row+Flex(align-items) 实现图片与文字垂直居中对齐的代码。",
  steps: [
    "确保 arkui-knowledge skill 在 deveco skills 数据目录可用（从 opencode 配置目录复制）。",
    "创建临时工作目录。",
    "执行 deveco run --format json --dir <tmp>，发送图文混排创建请求。",
    "解析 stdout 中的 JSON line events。",
    "校验 text event 中包含 Row 组件、Flex 或 alignItems 对齐设置，以及 Image 和 Text 组件。",
    "清理复制的 skill 和临时目录。",
  ],
  expected: [
    "进程正常退出或超时前有 text event 输出。",
    "模型返回文本包含 Row 组件和 Flex 或 alignItems 对齐设置。",
    "模型返回文本包含 Image 和 Text 组件用于图文混排内容。",
  ],
  code: "packages/opencode/test/live-e2e/cases/skill-arkui-image-text-mix.case.ts",
  parallel: false,
  cleanup:
    "用例创建临时工作目录并可能复制 arkui-knowledge skill 到 deveco 数据目录；执行结束后删除临时目录和复制的 skill。真实 auth/config 只读不清理。",
  async run(ctx) {
    const skillCopied = await ensureArkuiSkillAvailable()
    const sentMessage = "请用ArkTS代码示例说明如何创建一个通知卡片，左边是图片，右边是文字内容。只需提供代码示例和简要说明，不需要创建项目或生成文件。"
    const workspace = await ctx.createTempWorkspace("skill-arkui-image-text-")

    try {
      const args = ["run", "--format", "json", "--dir", workspace, sentMessage]
      const result = await ctx.runDeveco(args, { timeoutMs: 190_000 })

      await ctx.writeArtifact(CASE_ID, "stdout.log", result.stdout)
      await ctx.writeArtifact(CASE_ID, "stderr.log", result.stderr)

      const events = parseEvents(result.stdout)
      await ctx.writeArtifact(CASE_ID, "events.jsonl", events.map((e) => JSON.stringify(e)).join("\n"))

      const textEvents = events.filter((event) => event.type === "text")
      const toolEvents = events.filter((event) => event.type === "tool_use")
      const receivedText = [
        ...textEvents.map(textFromEvent),
        ...toolEvents.map(codeFromToolEvent),
      ].filter((t): t is string => Boolean(t)).join("\n")
      const sessionID = events.find((event) => typeof event.sessionID === "string")?.sessionID as
        | string
        | undefined

      if (textEvents.length === 0 && toolEvents.length === 0) {
        throw new Error("No text or tool event was emitted")
      }

      const lower = receivedText.toLowerCase()
      const hasRow = receivedText.includes("Row") || lower.includes("row")
      const hasAlign =
        receivedText.includes("Flex") ||
        lower.includes("flex") ||
        receivedText.includes("alignItems") ||
        lower.includes("alignitems") ||
        lower.includes("align") ||
        receivedText.includes("VerticalAlign") ||
        lower.includes("verticalalign")
      const hasImage = receivedText.includes("Image") || lower.includes("image")
      const hasText = receivedText.includes("Text(") || lower.includes("text")

      if (!hasRow) {
        throw new Error(
          `Expected response to contain Row component for horizontal layout, got: ${receivedText.substring(0, 300)}...`,
        )
      }
      if (!hasAlign) {
        throw new Error(
          `Expected response to contain Flex or alignItems alignment setting, got: ${receivedText.substring(0, 300)}...`,
        )
      }
      if (!hasImage || !hasText) {
        const missing = [!hasImage && "Image", !hasText && "Text"].filter(Boolean).join(", ")
        throw new Error(
          `Expected response to contain Image and Text for mixed content. Missing: ${missing}. Got: ${receivedText.substring(0, 300)}...`,
        )
      }

      return {
        sentMessage,
        receivedText,
        sessionID,
        stdout: result.stdout,
        stderr: result.stderr,
        events,
        details: {
          exitCode: result.exitCode,
          commandDurationMs: result.durationMs,
          textEventCount: textEvents.length,
          toolEventCount: toolEvents.length,
          workspace,
          skillCopied,
        },
      }
    } finally {
      try {
        await fs.rm(workspace, { recursive: true, force: true })
      } catch {
        // ignore
      }
      await cleanupArkuiSkill(skillCopied)
    }
  },
}

export default testCase
