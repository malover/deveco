import fs from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import stripAnsi from "strip-ansi"
import { buildEnv, findDevEcoHome, sdkPath } from "../../../src/tool/lib/env"
import { cliEntry, opencodeRoot, realUserEnv } from "../env"
import type { CaseContext, LiveTestCase, RunCommandResult } from "../types"

const CASE_ID = "INCREMENTAL_DEV_BUILD_PROJECT"
const APP_NAME = "LiveE2EIncrementalDev"
const BUNDLE_NAME = "com.example.livee2eincremental"

function partOf(event: Record<string, unknown>): Record<string, unknown> | undefined {
  const part = event.part
  if (!part || typeof part !== "object") return undefined
  return part as Record<string, unknown>
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

function textFromEvent(event: Record<string, unknown>) {
  const part = event.part
  if (!part || typeof part !== "object") return undefined
  if (!("text" in part) || typeof part.text !== "string") return undefined
  return part.text
}

function makeEnv(home: string) {
  return {
    ...realUserEnv(),
    ...buildEnv(home, sdkPath(home)),
  }
}

async function runCopyTemplate(workspace: string, env: Record<string, string | undefined>) {
  return runProcess(
    [
      "bun",
      path.join(opencodeRoot, "resources", "skills", "deveco-create-project", "scripts", "copy-template.mjs"),
      "--project-path",
      workspace,
      "--app-name",
      APP_NAME,
      "--bundle-name",
      BUNDLE_NAME,
    ],
    120_000,
    env,
  )
}

async function runProcess(cmd: string[], timeoutMs: number, env?: Record<string, string | undefined>) {
  const start = Date.now()
  const proc = Bun.spawn(cmd, {
    cwd: opencodeRoot,
    env: env ?? realUserEnv(),
    stdout: "pipe",
    stderr: "pipe",
  })
  const timeout = setTimeout(() => proc.kill(), timeoutMs)
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]).finally(() => clearTimeout(timeout))
  return { exitCode, stdout, stderr, durationMs: Date.now() - start } satisfies RunCommandResult
}

function fileModificationEvents(event: Record<string, unknown>): Array<{ filePath: string; content?: string }> {
  if (event.type !== "tool_use") return []
  const part = partOf(event)
  if (!part) return []
  const tool = part.tool as string
  if (tool !== "edit" && tool !== "write" && tool !== "apply_patch") return []
  const state = part.state as Record<string, unknown> | undefined
  if (!state) return []
  const input = state.input as Record<string, unknown> | undefined
  if (!input) return []

  if (tool === "apply_patch") {
    const metadata = state.metadata as Record<string, unknown> | undefined
    const files = Array.isArray(metadata?.files) ? metadata.files : []
    return files.flatMap((file) => {
      if (!file || typeof file !== "object") return []
      const item = file as Record<string, unknown>
      const filePath = typeof item.filePath === "string"
        ? item.filePath
        : typeof item.relativePath === "string"
          ? item.relativePath
          : undefined
      if (!filePath) return []
      const content = typeof input.patchText === "string" ? input.patchText : undefined
      return [{ filePath, content }]
    })
  }

  const filePath = typeof input.filePath === "string"
    ? input.filePath
    : typeof input.filepath === "string"
      ? input.filepath
      : typeof input.file_path === "string"
        ? input.file_path
        : typeof input.path === "string"
          ? input.path
          : undefined
  if (!filePath) return []
  const content = typeof input.content === "string"
    ? input.content
    : typeof input.newString === "string"
      ? input.newString
      : typeof state.output === "string"
        ? state.output
        : undefined
  return [{ filePath, content }]
}

async function findEtsFiles(projectRoot: string): Promise<string[]> {
  const entryDir = path.join(projectRoot, "entry", "src", "main", "ets")
  try {
    const stat = await fs.stat(entryDir)
    if (!stat.isDirectory()) return []
  } catch {
    return []
  }
  const files: string[] = []
  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (entry.name.endsWith(".ets")) files.push(full)
    }
  }
  await walk(entryDir)
  return files
}

function parseDebugToolResult(stdout: string) {
  const clean = stripAnsi(stdout)
  const start = clean.indexOf("{")
  const end = clean.lastIndexOf("}")
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`debug tool stdout did not contain JSON: ${stdout}`)
  }
  return JSON.parse(clean.slice(start, end + 1)) as { tool?: unknown; result?: unknown }
}

function outputOf(result: unknown) {
  if (typeof result === "string") return result
  if (result && typeof result === "object" && "output" in result && typeof result.output === "string") {
    return result.output
  }
  return JSON.stringify(result, null, 2)
}

function parseProjectInfo(stdout: string) {
  const match = stripAnsi(stdout).match(/\{[\s\S]*\}/)
  if (!match) throw new Error("copy-template stdout did not contain project info JSON")
  const info = JSON.parse(match[0]) as Record<string, unknown>
  if (typeof info.projectRoot !== "string") throw new Error("copy-template project info is missing projectRoot")
  if (info.verified !== true) throw new Error("copy-template project info is not verified")
  return info
}

function requireToolOutput(result: RunCommandResult, tool: string) {
  if (result.exitCode !== 0) {
    throw new Error(`${tool} exited with ${result.exitCode}\nstderr: ${result.stderr}\nstdout: ${result.stdout}`)
  }
  const parsed = parseDebugToolResult(result.stdout)
  if (parsed.tool !== tool) throw new Error(`Expected debug tool result for ${tool}, got ${String(parsed.tool)}`)
  return outputOf(parsed.result)
}

function assertNoFailure(tool: string, output: string) {
  const normalized = output.toLowerCase()
  const marker = ["failed", "failure", "exception", "失败", "异常"].find((item) =>
    normalized.includes(item),
  )
  if (marker) throw new Error(`${tool} output contains failure marker "${marker}":\n${output}`)
}

async function createProjectCliEntry(project: string) {
  const entry = path.join(project, "live-e2e-cli.ts")
  await Bun.write(
    entry,
    `process.chdir(${JSON.stringify(project)}); await import(${JSON.stringify(pathToFileURL(cliEntry).href)});`,
  )
  return entry
}

const testCase: LiveTestCase = {
  id: CASE_ID,
  title: "增量开发触发build_project",
  category: "skill",
  priority: "P1",
  timeoutMs: 900_000,
  requires: ["huawei-auth", "real-llm", "deveco-provider", "deveco-home"],
  description:
    "验证在已有鸿蒙工程上进行增量开发：先创建最小工程，再让 AI 添加'我的'页面和'清除缓存'菜单项，随后用 build_project 编译通过。",
  steps: [
    "创建临时工作目录，使用 copy-template 生成最小鸿蒙工程。",
    "在工程目录下启动 AI 对话，发送组合 prompt：先添加'我的'页面，再在'我的'页面里添加'清除缓存'菜单项。",
    "解析 stdout 中的 JSON line events。",
    "验证相关页面文件存在代码修改（包含'清除缓存'相关代码）。",
    "直接调用 build_project 工具编译工程。",
    "验证 build_project 编译通过且无 failure marker。",
  ],
  expected: [
    "相关页面文件被修改，包含'清除缓存'相关代码。",
    "build_project 工具执行完成。",
    "编译通过，无编译失败信号。",
  ],
  code: "packages/opencode/test/live-e2e/cases/incremental-dev-build-project.case.ts",
  parallel: false,
  cleanup: "用例创建临时工作目录；执行结束后删除临时目录。真实 auth/config 只读不清理。",
  async run(ctx) {
    const workspace = await ctx.createTempWorkspace("incremental-dev-")

    try {
      const setup = await prepareProject(ctx, workspace)
      const request = await runIncrementalRequest(ctx, setup.projectRoot, setup.env)
      const verification = await verifyCacheChange(setup.projectRoot, request.events)
      const build = await runBuild(ctx, setup.env, setup.entry)

      return {
        sentMessage: request.sentMessage,
        receivedText: receivedTextFrom(request.events),
        sessionID: request.events.find((event) => typeof event.sessionID === "string")?.sessionID as string | undefined,
        stdout: request.result.stdout,
        stderr: request.result.stderr,
        events: request.events,
        details: {
          exitCode: request.result.exitCode,
          commandDurationMs: request.result.durationMs,
          devecoHome: setup.home,
          projectRoot: setup.projectRoot,
          buildProfilePath: setup.buildProfilePath,
          fileModEventCount: verification.fileModEvents.length,
          hasCacheClearingCode: verification.hasCacheClearingCode,
          buildExitCode: build.exitCode,
          buildDurationMs: build.durationMs,
          buildHasFailure: false,
        },
      }
    } finally {
      try {
        await fs.rm(workspace, { recursive: true, force: true })
      } catch {
        // ignore EBUSY and other cleanup errors on Windows
      }
    }
  },
}

async function prepareProject(ctx: CaseContext, workspace: string) {
  const home = await findDevEcoHome()
  if (!home) throw new Error("DevEco Studio was not found")
  const env = makeEnv(home)
  const copyTemplate = await runCopyTemplate(workspace, env)
  await Promise.all([
    ctx.writeArtifact(CASE_ID, "copy-template-stdout.log", copyTemplate.stdout),
    ctx.writeArtifact(CASE_ID, "copy-template-stderr.log", copyTemplate.stderr),
  ])
  if (copyTemplate.exitCode !== 0) {
    throw new Error(`copy-template exited with ${copyTemplate.exitCode}\nstderr: ${copyTemplate.stderr}`)
  }

  const projectInfo = parseProjectInfo(copyTemplate.stdout)
  const projectRoot = String(projectInfo.projectRoot)
  const entry = await createProjectCliEntry(projectRoot)
  const buildProfilePath = path.join(projectRoot, "build-profile.json5")
  await requireBuildProfile(buildProfilePath)
  return { home, env, projectRoot, entry, buildProfilePath }
}

async function requireBuildProfile(buildProfilePath: string) {
  try {
    const stat = await fs.stat(buildProfilePath)
    if (!stat.isFile()) throw new Error(`build-profile.json5 is not a file at ${buildProfilePath}`)
  } catch (error) {
    throw new Error(
      `build-profile.json5 not found at ${buildProfilePath}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

async function runIncrementalRequest(
  ctx: CaseContext,
  projectRoot: string,
  env: Record<string, string | undefined>,
) {
  const sentMessage =
    "请为这个工程添加一个'我的'页面，包含基本的个人信息展示区域。完成后，帮我在'我的'页面里添加'清除缓存'菜单项。只需要修改代码并简要说明修改结果，不要编译。"
  const result = await ctx.runDeveco(["run", "--format", "json", "--dir", projectRoot, sentMessage], {
    env,
    timeoutMs: 300_000,
  })
  await ctx.writeArtifact(CASE_ID, "stdout.log", result.stdout)
  await ctx.writeArtifact(CASE_ID, "stderr.log", result.stderr)
  if (result.exitCode !== 0) {
    throw new Error(`deveco run exited with ${result.exitCode}\nstderr: ${result.stderr}\nstdout: ${result.stdout}`)
  }
  const events = parseEvents(result.stdout)
  await ctx.writeArtifact(CASE_ID, "events.jsonl", events.map((event) => JSON.stringify(event)).join("\n"))
  return { sentMessage, result, events }
}

async function verifyCacheChange(projectRoot: string, events: Array<Record<string, unknown>>) {
  const fileModEvents = events.flatMap(fileModificationEvents).filter(isCacheRelatedChange)
  const hasCacheClearingCode = fileModEvents.some((event) => hasCacheSignal(event.content ?? ""))
  if (hasCacheClearingCode) return { fileModEvents, hasCacheClearingCode }

  const etsFiles = await findEtsFiles(projectRoot)
  const etsContents = await Promise.all(etsFiles.map((file) => fs.readFile(file, "utf-8")))
  if (!etsContents.some(hasCacheSignal)) {
    throw new Error("No .ets file on disk contains '清除缓存' / cache-clearing related code")
  }
  return { fileModEvents, hasCacheClearingCode }
}

function isCacheRelatedChange(event: { filePath: string; content?: string }) {
  const lower = event.filePath.toLowerCase()
  const content = event.content ?? ""
  return (
    lower.includes("mine") ||
    lower.includes("profile") ||
    lower.includes("setting") ||
    lower.includes("cache") ||
    lower.includes("my") ||
    lower.includes("我") ||
    hasCacheSignal(content)
  )
}

function hasCacheSignal(content: string) {
  return content.includes("清除缓存") || content.includes("clearCache") || content.toLowerCase().includes("cache")
}

async function runBuild(
  ctx: CaseContext,
  env: Record<string, string | undefined>,
  entry: string,
) {
  const build = await ctx.runDeveco(
    ["debug", "agent", "build", "--tool", "build_project", "--params", JSON.stringify({ build_mode: "debug" })],
    { env, timeoutMs: 600_000, entry },
  )
  await Promise.all([
    ctx.writeArtifact(CASE_ID, "build-stdout.log", build.stdout),
    ctx.writeArtifact(CASE_ID, "build-stderr.log", build.stderr),
  ])
  assertNoFailure("build_project", requireToolOutput(build, "build_project"))
  return build
}

function receivedTextFrom(events: Array<Record<string, unknown>>) {
  return events
    .filter((event) => event.type === "text")
    .map(textFromEvent)
    .filter((text): text is string => Boolean(text))
    .join("\n")
}

export default testCase
