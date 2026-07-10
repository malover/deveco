import type { LiveTestCase } from "../types"
import { opencodeRoot } from "../env"
import fs from "fs/promises"
import path from "path"

const CASE_ID = "BUILD_FAILURE_CHECK"

const TEMPLATE_PROJECT = path.join(
  opencodeRoot,
  "resources",
  "skills",
  "deveco-create-project",
  "application",
)

// Erroneous Index.ets based on the template, with multiple compilation errors:
// 1. `any` type usage — violates arkts-no-any-unknown rule
// 2. Type mismatch — assigning string to number variable
// Both errors cause ArkTS compilation failure, making build_project fail.
const ERRONEOUS_INDEX_ETS = `@Entry
@Component
struct Index {
  @State message: string = 'Hello World';
  private data: any = null;
  private count: number = "not a number";

  build() {
    RelativeContainer() {
      Text(this.message)
        .id('HelloWorld')
        .fontSize($r('app.float.page_text_font_size'))
        .fontWeight(FontWeight.Bold)
        .alignRules({
          center: { anchor: '__container__', align: VerticalAlign.Center },
          middle: { anchor: '__container__', align: HorizontalAlign.Center }
        })
        .onClick(() => {
          this.message = 'Welcome';
        })
    }
    .height('100%')
    .width('100%')
  }
}
`

const testCase: LiveTestCase = {
  id: CASE_ID,
  title: "编译构建结果检查",
  category: "cli",
  priority: "P0",
  timeoutMs: 240_000,
  stallMs: 180_000,
  requires: ["huawei-auth", "real-llm", "deveco-provider"],
  description:
    "验证对包含编译错误的鸿蒙项目调用build_project工具进行编译构建时，能够返回失败检查结果。",
  steps: [
    "创建临时工作目录，复制鸿蒙工程模板。",
    "覆盖Index.ets为包含编译错误的版本（使用any类型、类型不匹配）。",
    "执行deveco run，输入'帮我用build project工具构建当前项目工程'。",
    "解析stdout中的JSON line events。",
    "校验agent返回了构建失败检查结果。",
  ],
  expected: [
    "进程退出码为0。",
    "stdout中至少存在一个text event。",
    "模型返回文本包含构建失败相关内容（失败/fail/错误/error/报错）。",
  ],
  code: "packages/opencode/test/live-e2e/cases/build-failure-check.case.ts",
  parallel: false,
  cleanup: "用例只创建临时工作目录；执行结束后删除临时目录。真实auth/config只读不清理。",
  async run(ctx) {
    const workspace = await ctx.createTempWorkspace("build-failure-check-")
    const etsPath = path.join(workspace, "entry", "src", "main", "ets", "pages", "Index.ets")

    try {
      // Copy template HarmonyOS project to workspace
      await fs.cp(TEMPLATE_PROJECT, workspace, { recursive: true })

      // Overwrite Index.ets with erroneous version (any type + type mismatch)
      await fs.writeFile(etsPath, ERRONEOUS_INDEX_ETS)

      // Use the same prompt as the success case
      const sentMessage = "帮我用build project工具构建当前项目工程"

      const args = ["run", "--format", "json", "--dir", workspace, sentMessage]
      const result = await ctx.runDeveco(args, { timeoutMs: 220_000 })

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

      // Verify the response contains build failure keywords
      const lowerText = receivedText.toLowerCase()
      const failureKeywords = [
        "失败",
        "fail",
        "错误",
        "error",
        "报错",
        "异常",
        "无法",
        "cannot",
      ]
      const hasFailure = failureKeywords.some((kw) => lowerText.includes(kw.toLowerCase()))
      if (!hasFailure) {
        throw new Error(
          `Expected response to contain build failure keywords, got: ${receivedText.substring(0, 400)}...`,
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
          etsFile: etsPath,
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
