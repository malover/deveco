import type { LiveTestCase } from "../types"
import { opencodeRoot } from "../env"
import fs from "fs/promises"
import path from "path"

const CASE_ID = "SWITCH_CWD_PROJECT_BUILD"

const TEMPLATE_PROJECT = path.join(
  opencodeRoot,
  "resources",
  "skills",
  "deveco-create-project",
  "application",
)

const testCase: LiveTestCase = {
  id: CASE_ID,
  title: "支持指定目录项目代码构建switch_cwd",
  category: "cli",
  priority: "P0",
  timeoutMs: 360_000,
  requires: ["huawei-auth", "real-llm", "deveco-provider"],
  description:
    "验证使用switch_cwd工具切换到包含完整鸿蒙工程的目录后，调用build_project工具能够正常切换并完成编译构建。",
  steps: [
    "创建临时工作目录，复制鸿蒙工程模板。",
    "执行deveco run，发送prompt指示agent先使用switch_cwd工具切换到该工程目录，再使用build_project工具进行编译构建。",
    "解析stdout中的JSON line events。",
    "校验agent正常切换到指定路径，并完成编译构建。",
  ],
  expected: [
    "进程退出码为0。",
    "stdout中至少存在一个text event。",
    "模型返回文本包含切换相关内容，且包含构建成功相关内容。",
  ],
  code: "packages/opencode/test/live-e2e/cases/switch-cwd-project-build.case.ts",
  parallel: false,
  cleanup: "用例只创建临时工作目录；执行结束后删除临时目录。真实auth/config只读不清理。",
  async run(ctx) {
    const workspace = await ctx.createTempWorkspace("switch-cwd-project-build-")

    try {
      // Copy template HarmonyOS project to workspace
      await fs.cp(TEMPLATE_PROJECT, workspace, { recursive: true })

      const sentMessage =
        `请按以下步骤操作：\n` +
        `1. 使用 switch_cwd 工具，将构建项目路径切换到 ${workspace}（该目录包含一个完整的鸿蒙工程）\n` +
        `2. 使用 build_project 工具进行编译构建\n` +
        `请告诉我每一步的执行结果和具体输出。`

      const args = ["run", "--format", "json", "--dir", workspace, sentMessage]
      const result = await ctx.runDeveco(args, { timeoutMs: 340_000 })

      await ctx.writeArtifact(CASE_ID, "stdout.log", result.stdout)
      await ctx.writeArtifact(CASE_ID, "stderr.log", result.stderr)

      let events: Array<Record<string, unknown>> = []
      try {
        events = ctx.parseJsonLines(result.stdout)
      } catch (error) {
        throw new Error(
          `stdout is not valid JSON lines: ${error instanceof Error ? error.message : String(error)}`,
        )
      }

      await ctx.writeArtifact(CASE_ID, "events.jsonl", events.map((e) => JSON.stringify(e)).join("\n"))

      if (result.exitCode !== 0) {
        throw new Error(`deveco run exited with ${result.exitCode}`)
      }

      const textEvents = events.filter((e) => e.type === "text")
      const receivedText = textEvents
        .map((e) => {
          const part = e.part
          if (!part || typeof part !== "object") return undefined
          if (!("text" in part) || typeof part.text !== "string") return undefined
          return part.text
        })
        .filter((t): t is string => Boolean(t))
        .join("\n")

      const sessionID = events.find((e) => typeof e.sessionID === "string")?.sessionID as
        | string
        | undefined

      if (textEvents.length === 0) {
        throw new Error("No text event was emitted")
      }

      const lowerText = receivedText.toLowerCase()

      // Verify the response mentions the switch (switch_cwd was called)
      const switchKeywords = ["切换", "switch"]
      const hasSwitch = switchKeywords.some((kw) => lowerText.includes(kw.toLowerCase()))
      if (!hasSwitch) {
        throw new Error(
          `Expected response to mention switch_cwd, got: ${receivedText.substring(0, 300)}...`,
        )
      }

      // Verify the response indicates build success
      const successKeywords = ["成功", "success", "完成", "complete"]
      const hasSuccess = successKeywords.some((kw) => lowerText.includes(kw.toLowerCase()))
      if (!hasSuccess) {
        throw new Error(
          `Expected response to indicate build success, got: ${receivedText.substring(0, 300)}...`,
        )
      }

      // Verify the response does NOT contain build failure keywords
      const failureKeywords = [
        "失败",
        "fail",
        "报错",
        "异常",
        "无法",
        "cannot",
        "not found",
        "找不到",
        "不存在",
      ]
      const hasFailure = failureKeywords.some((kw) => lowerText.includes(kw.toLowerCase()))
      if (hasFailure) {
        throw new Error(
          `Expected build to succeed but response contains failure keywords, got: ${receivedText.substring(0, 400)}...`,
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

export default testCase
