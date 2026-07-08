import type { LiveTestCase } from "../types"
import fs from "fs/promises"

const CASE_ID = "SWITCH_CWD_BUILD"

const testCase: LiveTestCase = {
  id: CASE_ID,
  title: "指定目录不存在项目代码构建switch_cwd",
  category: "cli",
  priority: "P0",
  timeoutMs: 200_000,
  requires: ["huawei-auth", "real-llm", "deveco-provider"],
  description:
    "验证使用switch_cwd工具切换到不包含任何鸿蒙工程的空目录后，调用build_project工具进行编译构建时，能够正常切换并提示无工程存在。",
  steps: [
    "创建一个空的临时工作目录（不包含任何鸿蒙工程文件）。",
    "执行deveco run，发送prompt指示agent先使用switch_cwd工具切换到该空目录，再使用build_project工具进行编译构建。",
    "解析stdout中的JSON line events。",
    "校验agent正常切换到指定路径，并提示无工程存在或构建失败。",
  ],
  expected: [
    "进程退出码为0。",
    "stdout中至少存在一个text event。",
    "模型返回文本包含切换相关内容和无工程/构建失败相关内容。",
  ],
  code: "packages/opencode/test/live-e2e/cases/switch-cwd-build.case.ts",
  parallel: false,
  cleanup: "用例只创建临时工作目录；执行结束后删除临时目录。真实auth/config只读不清理。",
  async run(ctx) {
    // Create an empty temp workspace — no build-profile.json5, no oh-package.json5,
    // no entry/ directory. This is the "no project" directory for switch_cwd.
    const workspace = await ctx.createTempWorkspace("switch-cwd-build-")

    try {
      const sentMessage =
        `请按以下步骤操作：\n` +
        `1. 使用 switch_cwd 工具，将构建项目路径切换到 ${workspace}（该目录是一个空目录，不包含任何鸿蒙工程文件）\n` +
        `2. 使用 build_project 工具进行编译构建\n` +
        `请告诉我每一步的执行结果和具体输出。`

      const args = ["run", "--format", "json", "--dir", workspace, sentMessage]
      const result = await ctx.runDeveco(args, { timeoutMs: 190_000 })

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

      // Verify the response indicates no project / build failure
      const noProjectKeywords = [
        "无工程",
        "不存在",
        "no project",
        "not found",
        "找不到",
        "构建失败",
        "失败",
        "fail",
        "错误",
        "error",
        "无法",
        "cannot",
        "报错",
        "未找到",
        "无效",
        "invalid",
      ]
      const hasNoProject = noProjectKeywords.some((kw) => lowerText.includes(kw.toLowerCase()))
      if (!hasNoProject) {
        throw new Error(
          `Expected response to indicate no project or build failure, got: ${receivedText.substring(0, 300)}...`,
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
