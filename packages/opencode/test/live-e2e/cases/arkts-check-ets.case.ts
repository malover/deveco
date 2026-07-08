import type { LiveTestCase } from "../types"
import { opencodeRoot } from "../env"
import fs from "fs/promises"
import path from "path"

const CASE_ID = "ARKTS_CHECK_ETS"

const TEMPLATE_PROJECT = path.join(
  opencodeRoot,
  "resources",
  "skills",
  "deveco-create-project",
  "application",
)

// Erroneous Index.ets based on the template project, with `any` type usage
// that violates the arkts-no-any-unknown ArkTS rule.
const ERRONEOUS_INDEX_ETS = `@Entry
@Component
struct Index {
  @State message: string = 'Hello World';
  private data: any = null;

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
  title: "指定ets文件进行语法检查check_ets_files",
  category: "cli",
  priority: "P0",
  timeoutMs: 180_000,
  requires: ["huawei-auth", "real-llm", "deveco-provider"],
  description:
    "验证通过check_ets_files工具对指定ets文件进行ArkTS静态语法检查，基于鸿蒙项目代码构造包含语法错误的ets文件，调用工具检查并返回诊断结果。",
  steps: [
    "创建临时工作目录，复制鸿蒙工程模板。",
    "在工程中构造包含语法错误的ets文件（使用any类型，违反arkts-no-any-unknown规则）。",
    "执行deveco run，发送prompt指示agent使用check_ets_files工具检查该ets文件。",
    "解析stdout中的JSON line events。",
    "校验agent返回了检查结果，包含错误或诊断信息。",
  ],
  expected: [
    "进程退出码为0。",
    "stdout中至少存在一个text event。",
    "模型返回文本包含检查结果相关内容（错误/诊断/警告等关键词）。",
  ],
  code: "packages/opencode/test/live-e2e/cases/arkts-check-ets.case.ts",
  parallel: false,
  cleanup: "用例只创建临时工作目录；执行结束后删除临时目录。真实auth/config只读不清理。",
  async run(ctx) {
    const workspace = await ctx.createTempWorkspace("arkts-check-ets-")
    const etsPath = path.join(workspace, "entry", "src", "main", "ets", "pages", "Index.ets")

    try {
      // Copy template HarmonyOS project to workspace
      await fs.cp(TEMPLATE_PROJECT, workspace, { recursive: true })

      // Overwrite Index.ets with erroneous version (uses `any` type)
      await fs.writeFile(etsPath, ERRONEOUS_INDEX_ETS)

      // Prompt the agent to check the ets file using check_ets_files tool
      const sentMessage =
        `请使用 check_ets_files 工具检查文件 ${etsPath} 的 ArkTS 语法。` +
        `项目根目录为 ${workspace}。` +
        `如果未配置工程路径，请先调用 init_project_path 初始化。` +
        `检查完成后请告诉我具体的检查结果和发现的错误。`

      const args = ["run", "--format", "json", "--dir", workspace, sentMessage]
      const result = await ctx.runDeveco(args, { timeoutMs: 170_000 })

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

      // Verify the response contains diagnostic-related keywords,
      // indicating the check was performed and results were reported.
      const lowerText = receivedText.toLowerCase()
      const diagnosticKeywords = [
        "错误",
        "error",
        "诊断",
        "diagnostic",
        "警告",
        "warning",
        "arkts-no-any",
        "问题",
      ]
      const hasDiagnostic = diagnosticKeywords.some((kw) => lowerText.includes(kw.toLowerCase()))

      if (!hasDiagnostic) {
        throw new Error(
          `Expected response to contain diagnostic keywords, got: ${receivedText.substring(0, 300)}...`,
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
