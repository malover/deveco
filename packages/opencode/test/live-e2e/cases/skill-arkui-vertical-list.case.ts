import type { LiveTestCase } from "../types"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { execFileSync } from "node:child_process"

const CASE_ID = "SKILL_ARKUI_VERTICAL_LIST"

const SKILL_NAME = "arkui-knowledge"
const OPENCODE_SKILLS_DIR = path.join(os.homedir(), ".config", "opencode", "skills", SKILL_NAME)
const DEVECO_SKILLS_DIR = path.join(os.homedir(), ".local", "share", "deveco", "skills", SKILL_NAME)

// Pre-create project constants: the test scaffolds the ArkTS project directly
// via copy-template.mjs so the model can focus on writing UI code instead of
// spending ~40s exploring skill paths to locate the script.
const DEVECO_DATA_SKILLS_DIR = path.join(os.homedir(), ".local", "share", "deveco", "skills")
const COPY_TEMPLATE_SCRIPT = path.join(DEVECO_DATA_SKILLS_DIR, "deveco-create-project", "scripts", "copy-template.mjs")
const APP_NAME = "UserList"
const BUNDLE_NAME = "com.example.userlist"

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

// Pre-create the ArkTS project by calling copy-template.mjs directly, so the
// model starts in a ready-made project and can focus on UI implementation
// without exploring skill paths to locate the scaffolding script.
async function preCreateProject(workspace: string): Promise<string> {
  const exists = await fs.stat(COPY_TEMPLATE_SCRIPT).then(() => true).catch(() => false)
  if (!exists) {
    throw new Error(
      `copy-template.mjs not found at ${COPY_TEMPLATE_SCRIPT}. Ensure deveco-create-project skill is installed.`,
    )
  }
  execFileSync("node", [COPY_TEMPLATE_SCRIPT, "--project-path", workspace, "--app-name", APP_NAME, "--bundle-name", BUNDLE_NAME], {
    timeout: 60_000,
    stdio: "pipe",
    encoding: "utf-8",
  })
  return path.join(workspace, APP_NAME)
}

const testCase: LiveTestCase = {
  id: CASE_ID,
  title: "垂直列表布局",
  category: "skill",
  priority: "P0",
  timeoutMs: 200_000,
  requires: ["huawei-auth", "real-llm", "deveco-provider"],
  description:
    "验证在预创建的 ArkTS 工程中输入垂直列表布局指令（如用户列表页面，包含头像、昵称和状态，垂直排列），AI 能自动加载 arkui-knowledge skill 并返回使用 List 或 ForEach+Column 实现垂直方向排列的代码。工程由测试直接预创建，避免模型浪费时间探索 skill 路径。",
  steps: [
    "确保 arkui-knowledge skill 在 deveco skills 数据目录可用（从 opencode 配置目录复制）。",
    "创建临时工作目录，并通过 copy-template.mjs 预创建 ArkTS 工程。",
    "执行 deveco run --format json --dir <projectPath>，发送垂直列表布局实现请求。",
    "解析 stdout 中的 JSON line events。",
    "校验 text event 中包含 List 或 ForEach+Column 垂直布局组件，以及 Image 和 Text 内容组件。",
    "清理复制的 skill 和临时目录。",
  ],
  expected: [
    "进程正常退出或超时前有 text event 输出。",
    "模型返回文本包含 List 组件或 ForEach+Column 组合用于垂直排列。",
    "模型返回文本包含 Image 和 Text 组件用于列表项内容。",
  ],
  code: "packages/opencode/test/live-e2e/cases/skill-arkui-vertical-list.case.ts",
  parallel: false,
  cleanup:
    "用例创建临时工作目录并通过 copy-template.mjs 预创建工程，可能复制 arkui-knowledge skill 到 deveco 数据目录；执行结束后删除临时目录和复制的 skill。真实 auth/config 只读不清理。",
  async run(ctx) {
    const skillCopied = await ensureArkuiSkillAvailable()
    const workspace = await ctx.createTempWorkspace("skill-arkui-vertical-list-")
    // Pre-create the ArkTS project so the model can focus on UI implementation
    // without exploring skill paths to locate copy-template.mjs.
    const projectPath = await preCreateProject(workspace)
    const sentMessage = "在当前 ArkTS 工程中，修改 Index.ets 实现一个用户列表页面，包含头像、昵称和状态，垂直排列"

    try {
      const args = ["run", "--format", "json", "--dir", projectPath, sentMessage]
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
      const hasList = receivedText.includes("List") || lower.includes("list")
      const hasForEach = receivedText.includes("ForEach") || lower.includes("foreach")
      const hasColumn = receivedText.includes("Column") || lower.includes("column")
      const hasVerticalLayout = hasList || (hasForEach && hasColumn)
      const hasAvatar =
        receivedText.includes("Image") ||
        lower.includes("image") ||
        receivedText.includes("Circle") ||
        lower.includes("circle") ||
        lower.includes("avatar") ||
        receivedText.includes("头像") ||
        receivedText.includes("Stack") ||
        lower.includes("stack")
      const hasText = receivedText.includes("Text(") || lower.includes("text")

      if (!hasVerticalLayout) {
        throw new Error(
          `Expected response to contain List or ForEach+Column for vertical layout, got: ${receivedText.substring(0, 300)}...`,
        )
      }
      if (!hasAvatar || !hasText) {
        const missing = [!hasAvatar && "Avatar(Image/Circle)", !hasText && "Text"].filter(Boolean).join(", ")
        throw new Error(
          `Expected response to contain avatar representation and Text for list item content. Missing: ${missing}. Got: ${receivedText.substring(0, 300)}...`,
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
          projectPath,
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
