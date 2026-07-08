import type { LiveTestCase } from "../types"
import { opencodeRoot } from "../env"
import fs from "fs/promises"
import path from "path"

const CASE_ID = "BUILD_PROJECT"

const TEMPLATE_PROJECT = path.join(
  opencodeRoot,
  "resources",
  "skills",
  "deveco-create-project",
  "application",
)

const testCase: LiveTestCase = {
  id: CASE_ID,
  title: "支持鸿蒙项目代码构建build project",
  category: "cli",
  priority: "P0",
  timeoutMs: 360_000,
  requires: ["huawei-auth", "real-llm", "deveco-provider"],
  description:
    "验证通过build_project工具对鸿蒙项目工程进行编译构建，输入构建指令后agent调用build_project工具成功完成构建并返回构建结果。",
  steps: [
    "创建临时工作目录，复制鸿蒙工程模板。",
    "执行deveco run，输入'帮我用build project工具构建当前项目工程'。",
    "解析stdout中的JSON line events。",
    "校验agent调用了build_project工具，成功完成构建并返回构建结果。",
  ],
  expected: [
    "进程退出码为0。",
    "stdout中至少存在一个text event。",
    "模型返回文本包含构建成功相关内容（成功/success/完成/complete），不包含失败关键词。",
  ],
  code: "packages/opencode/test/live-e2e/cases/build-project.case.ts",
  parallel: false,
  cleanup: "用例只创建临时工作目录；执行结束后删除临时目录。真实auth/config只读不清理。",
  async run(ctx) {
    const workspace = await ctx.createTempWorkspace("build-project-")

    try {
      // Copy template HarmonyOS project to workspace
      await fs.cp(TEMPLATE_PROJECT, workspace, { recursive: true })

      // Use the exact prompt specified by the user
      const sentMessage = "帮我用build project工具构建当前项目工程"

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

      // Verify the response indicates build success
      const successKeywords = [
        "成功",
        "success",
        "完成",
        "complete",
        "build successful",
      ]
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
