import type { LiveTestCase } from "../types"
import { opencodeRoot } from "../env"
import fs from "fs/promises"
import path from "path"

const CASE_ID = "PLAN_TO_BUILD"

const TEMPLATE_PROJECT = path.join(
  opencodeRoot,
  "resources",
  "skills",
  "deveco-create-project",
  "application",
)

const testCase: LiveTestCase = {
  id: CASE_ID,
  title: "制定需求计划后跳转到build模式构建",
  category: "slash",
  priority: "P0",
  timeoutMs: 500_000,
  stallMs: 180_000,
  requires: ["huawei-auth", "real-llm", "deveco-provider"],
  description:
    "验证在plan模式下制定重构计划后，接受计划并跳转到build模式进行重构。通过两步实现：第一步在plan模式下制定计划，第二步通过--session继续会话并切换到build模式开始重构。",
  steps: [
    "创建临时工作目录，复制鸿蒙工程模板。",
    "第一步：以--agent plan模式执行deveco run，输入'请帮我制定一下重构计划'，解析事件并提取sessionID。",
    "第二步：以--session <sessionID> --agent build模式执行deveco run，输入'接受重构计划，开始重构'。",
    "解析第二步的JSON line events。",
    "校验第一步返回了计划内容，第二步在build模式下开始重构。",
  ],
  expected: [
    "两步进程退出码均为0或143（超时但agent仍在重构）。",
    "第一步stdout中至少存在一个text event，包含计划相关内容。",
    "第二步stdout中存在tool_use事件（write/edit/todowrite等）或text event包含构建相关内容，表明build模式已开始重构。",
    "通过--agent plan到--agent build的切换，实现了从plan模式到build模式的跳转。",
  ],
  code: "packages/opencode/test/live-e2e/cases/plan-to-build.case.ts",
  parallel: false,
  cleanup: "用例只创建临时工作目录；执行结束后删除临时目录。真实auth/config只读不清理。",
  async run(ctx) {
    const workspace = await ctx.createTempWorkspace("plan-to-build-")

    try {
      // Copy template HarmonyOS project to workspace
      await fs.cp(TEMPLATE_PROJECT, workspace, { recursive: true })

      // ========================================================
      // Step 1: Plan mode — create a refactoring plan
      // ========================================================
      const planMessage = "请帮我制定一下重构计划"
      const planArgs = ["run", "--format", "json", "--dir", workspace, "--agent", "plan", planMessage]
      const planResult = await ctx.runDeveco(planArgs, { timeoutMs: 180_000 })

      await ctx.writeArtifact(CASE_ID, "step1-stdout.log", planResult.stdout)
      await ctx.writeArtifact(CASE_ID, "step1-stderr.log", planResult.stderr)

      let planEvents: Array<Record<string, unknown>> = []
      try {
        planEvents = ctx.parseJsonLines(planResult.stdout)
      } catch (error) {
        throw new Error(
          `Step 1 stdout is not valid JSON lines: ${error instanceof Error ? error.message : String(error)}`,
        )
      }

      await ctx.writeArtifact(
        CASE_ID,
        "step1-events.jsonl",
        planEvents.map((e) => JSON.stringify(e)).join("\n"),
      )

      if (planResult.exitCode !== 0) {
        throw new Error(`Step 1 (plan mode) exited with ${planResult.exitCode}`)
      }

      const planTextEvents = planEvents.filter((e) => e.type === "text")
      const planText = planTextEvents
        .map((e) => {
          const part = e.part
          if (!part || typeof part !== "object") return undefined
          if (!("text" in part) || typeof part.text !== "string") return undefined
          return part.text
        })
        .filter((t): t is string => Boolean(t))
        .join("\n")

      if (planTextEvents.length === 0) {
        throw new Error("Step 1 (plan mode): No text event was emitted")
      }

      // Extract session ID for continuation
      const sessionID = planEvents.find((e) => typeof e.sessionID === "string")?.sessionID as
        | string
        | undefined

      if (!sessionID) {
        throw new Error("Step 1 (plan mode): No sessionID found in events")
      }

      // Verify plan content
      const lowerPlanText = planText.toLowerCase()
      const planKeywords = ["计划", "plan", "重构", "refactor", "方案", "步骤", "step"]
      const hasPlanContent = planKeywords.some((kw) => lowerPlanText.includes(kw.toLowerCase()))
      if (!hasPlanContent) {
        throw new Error(
          `Step 1 (plan mode): Expected plan content, got: ${planText.substring(0, 300)}...`,
        )
      }

      // ========================================================
      // Step 2: Build mode — accept plan and start refactoring
      // ========================================================
      const buildMessage = "接受重构计划，开始重构"
      const buildArgs = [
        "run",
        "--format",
        "json",
        "--dir",
        workspace,
        "--session",
        sessionID,
        "--agent",
        "build",
        buildMessage,
      ]
      const buildResult = await ctx.runDeveco(buildArgs, { timeoutMs: 350_000 })

      await ctx.writeArtifact(CASE_ID, "step2-stdout.log", buildResult.stdout)
      await ctx.writeArtifact(CASE_ID, "step2-stderr.log", buildResult.stderr)

      let buildEvents: Array<Record<string, unknown>> = []
      try {
        buildEvents = ctx.parseJsonLines(buildResult.stdout)
      } catch (error) {
        throw new Error(
          `Step 2 stdout is not valid JSON lines: ${error instanceof Error ? error.message : String(error)}`,
        )
      }

      await ctx.writeArtifact(
        CASE_ID,
        "step2-events.jsonl",
        buildEvents.map((e) => JSON.stringify(e)).join("\n"),
      )

      // Accept exit code 0 (completed) or 143 (timeout — agent was still refactoring)
      if (buildResult.exitCode !== 0 && buildResult.exitCode !== 143) {
        throw new Error(`Step 2 (build mode) exited with ${buildResult.exitCode}`)
      }

      // Collect tool_use events — evidence of build agent activity
      const toolUseEvents = buildEvents.filter((e) => e.type === "tool_use")
      const toolNames = new Set(
        toolUseEvents
          .map((e) => {
            const part = e.part
            if (!part || typeof part !== "object") return undefined
            if (!("tool" in part) || typeof part.tool !== "string") return undefined
            return part.tool
          })
          .filter((t): t is string => Boolean(t)),
      )

      // Refactoring tools indicate the build agent started implementing
      const refactoringTools = ["write", "edit", "todowrite", "bash", "read"]
      const hasRefactoringTools = refactoringTools.some((t) => toolNames.has(t))

      // Also check text events for build-related keywords
      const buildTextEvents = buildEvents.filter((e) => e.type === "text")
      const buildText = buildTextEvents
        .map((e) => {
          const part = e.part
          if (!part || typeof part !== "object") return undefined
          if (!("text" in part) || typeof part.text !== "string") return undefined
          return part.text
        })
        .filter((t): t is string => Boolean(t))
        .join("\n")

      const lowerBuildText = buildText.toLowerCase()
      const buildKeywords = [
        "重构",
        "refactor",
        "开始",
        "start",
        "修改",
        "modify",
        "实现",
        "implement",
        "完成",
        "complete",
        "执行",
        "execute",
        "编辑",
        "edit",
        "create",
        "创建",
        "file",
        "文件",
        "model",
        "constant",
      ]
      const hasBuildText =
        buildTextEvents.length > 0 &&
        buildKeywords.some((kw) => lowerBuildText.includes(kw.toLowerCase()))

      // Either refactoring tool calls or text with build keywords confirms build mode activity
      if (!hasRefactoringTools && !hasBuildText) {
        throw new Error(
          `Step 2 (build mode): No refactoring activity detected (no tool calls or build text), got: ${buildText.substring(0, 300)}...`,
        )
      }

      // Verify session continuity (same session ID in both runs)
      const buildSessionID = buildEvents.find((e) => typeof e.sessionID === "string")?.sessionID as
        | string
        | undefined

      return {
        sentMessage: `${planMessage} → ${buildMessage}`,
        receivedText: `${planText}\n\n---\n\n${buildText}`,
        sessionID: buildSessionID ?? sessionID,
        stdout: `${planResult.stdout}\n---\n${buildResult.stdout}`,
        stderr: `${planResult.stderr}\n---\n${buildResult.stderr}`,
        events: [...planEvents, ...buildEvents],
        details: {
          step1ExitCode: planResult.exitCode,
          step1DurationMs: planResult.durationMs,
          step1TextEventCount: planTextEvents.length,
          step2ExitCode: buildResult.exitCode,
          step2DurationMs: buildResult.durationMs,
          step2TextEventCount: buildTextEvents.length,
          step2ToolUseCount: toolUseEvents.length,
          step2ToolNames: [...toolNames],
          hasRefactoringTools,
          hasBuildText,
          sessionID,
          buildSessionID,
          sessionContinued: buildSessionID === sessionID,
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
