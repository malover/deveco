import fs from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { cliEntry, realUserEnv } from "../env"
import type { CaseContext, LiveTestCase, RunCommandResult } from "../types"

const CASE_ID = "PROJECT_CUSTOM_SKILL"
const SKILL_NAME = "live-e2e-project-skill"
const SKILL_DESCRIPTION = "Returns the live e2e project skill marker."
const RESPONSE_MARKER = "PROJECT_SKILL_OK"

const testCase: LiveTestCase = {
  id: CASE_ID,
  title: "创建项目级 skill",
  category: "skill",
  priority: "P0",
  timeoutMs: 180_000,
  requires: ["huawei-auth", "real-llm", "deveco-provider"],
  description: "验证工程目录 .agents/skills 下的自定义 skill 仅在所属工程可查询和使用，不会泄漏到其他工程。",
  steps: [
    "创建隔离的临时用户目录、临时工程 A 和临时工程 B。",
    `在工程 A 的 .agents/skills/${SKILL_NAME}/SKILL.md 写入自定义 skill。`,
    "分别在工程 A 和工程 B 执行 deveco debug skill。",
    `在工程 B 执行 deveco run --command ${SKILL_NAME}，验证命令不可用。`,
    `在工程 A 执行 deveco run --command ${SKILL_NAME}，发送真实 LLM 请求。`,
    `解析 JSON line events，校验工程 A 的模型响应包含 ${RESPONSE_MARKER}。`,
  ],
  expected: [
    "工程 A 的 skill 列表包含自定义 skill 的名称、描述和工程内文件位置。",
    "工程 B 的 skill 列表不包含该自定义 skill。",
    "工程 B 使用该 skill 时退出码非零，且输出 error event。",
    `工程 A 使用该 skill 时退出码为 0，且模型响应包含 ${RESPONSE_MARKER}。`,
  ],
  code: "packages/opencode/test/live-e2e/cases/project-custom-skill.case.ts",
  parallel: false,
  cleanup: "执行结束后删除临时用户目录和两个临时工程；真实 auth/config 只读，不修改也不清理。",
  async run(ctx) {
    const home = await ctx.createTempWorkspace("project-custom-skill-home-")
    const projectA = await ctx.createTempWorkspace("project-custom-skill-a-")
    const projectB = await ctx.createTempWorkspace("project-custom-skill-b-")
    const skillFile = path.join(projectA, ".agents", "skills", SKILL_NAME, "SKILL.md")
    const env = { ...realUserEnv(), DEVECO_TEST_HOME: home }

    try {
      await writeSkill(skillFile)
      const listings = await verifySkillLists(ctx, env, projectA, projectB, skillFile)
      const unavailable = await verifyUnavailableCommand(ctx, env, projectB, listings.projectBEntry)
      const request = await verifyAvailableCommand(ctx, env, projectA, listings.projectAEntry)

      return {
        sentMessage: request.sentMessage,
        receivedText: request.receivedText,
        sessionID: request.events.find((event) => typeof event.sessionID === "string")?.sessionID as string | undefined,
        stdout: request.result.stdout,
        stderr: request.result.stderr,
        events: request.events,
        details: {
          projectAListExitCode: listings.projectAList.exitCode,
          projectBListExitCode: listings.projectBList.exitCode,
          projectARequestExitCode: request.result.exitCode,
          projectBRequestExitCode: unavailable.result.exitCode,
          projectBErrorEventCount: unavailable.events.filter((event) => event.type === "error").length,
          skillFile,
          projectA,
          projectB,
        },
      }
    } finally {
      await Promise.all([
        fs.rm(home, { recursive: true, force: true }),
        fs.rm(projectA, { recursive: true, force: true }),
        fs.rm(projectB, { recursive: true, force: true }),
      ])
    }
  },
}

async function writeSkill(skillFile: string) {
  await fs.mkdir(path.dirname(skillFile), { recursive: true })
  await Bun.write(
    skillFile,
    `---
name: ${SKILL_NAME}
description: ${SKILL_DESCRIPTION}
---

# Live E2E Project Skill

When invoked, reply with exactly \`${RESPONSE_MARKER}\` and nothing else.
Do not call tools.
`,
  )
}

async function verifySkillLists(
  ctx: CaseContext,
  env: Record<string, string | undefined>,
  projectA: string,
  projectB: string,
  skillFile: string,
) {
  const [projectAEntry, projectBEntry] = await Promise.all([createProjectCliEntry(projectA), createProjectCliEntry(projectB)])
  const [projectAList, projectBList] = await Promise.all([
    ctx.runDeveco(["debug", "skill"], { env, timeoutMs: 15_000, entry: projectAEntry }),
    ctx.runDeveco(["debug", "skill"], { env, timeoutMs: 15_000, entry: projectBEntry }),
  ])
  await writeListArtifacts(ctx, projectAList, projectBList)
  requireListSuccess(projectAList, "project A")
  requireListSuccess(projectBList, "project B")
  assertProjectSkillScope(projectAList, projectBList, skillFile)
  return { projectAEntry, projectBEntry, projectAList, projectBList }
}

async function writeListArtifacts(ctx: CaseContext, projectAList: RunCommandResult, projectBList: RunCommandResult) {
  await Promise.all([
    ctx.writeArtifact(CASE_ID, "project-a-list-stdout.log", projectAList.stdout),
    ctx.writeArtifact(CASE_ID, "project-a-list-stderr.log", projectAList.stderr),
    ctx.writeArtifact(CASE_ID, "project-b-list-stdout.log", projectBList.stdout),
    ctx.writeArtifact(CASE_ID, "project-b-list-stderr.log", projectBList.stderr),
  ])
}

function requireListSuccess(result: RunCommandResult, label: string) {
  if (result.exitCode !== 0) {
    throw new Error(`deveco debug skill in ${label} exited with ${result.exitCode}\nstderr: ${result.stderr}`)
  }
}

function assertProjectSkillScope(projectAList: RunCommandResult, projectBList: RunCommandResult, skillFile: string) {
  const projectASkill = parseSkills(projectAList.stdout).find((skill) => skill.name === SKILL_NAME)
  if (!projectASkill) throw new Error(`Expected project A skill list to contain ${SKILL_NAME}\nstdout: ${projectAList.stdout}`)
  if (projectASkill.description !== SKILL_DESCRIPTION) {
    throw new Error(`Expected ${SKILL_NAME} description to be ${SKILL_DESCRIPTION}`)
  }
  if (typeof projectASkill.location !== "string" || !projectASkill.location.includes(skillFile)) {
    throw new Error(`Expected ${SKILL_NAME} location to contain ${skillFile}, got: ${projectASkill.location}`)
  }
  if (parseSkills(projectBList.stdout).some((skill) => skill.name === SKILL_NAME)) {
    throw new Error(`Expected project B skill list not to contain ${SKILL_NAME}\nstdout: ${projectBList.stdout}`)
  }
}

async function verifyUnavailableCommand(
  ctx: CaseContext,
  env: Record<string, string | undefined>,
  projectB: string,
  entry: string,
) {
  const result = await ctx.runDeveco(requestArgs(projectB), { env, timeoutMs: 15_000, entry })
  await ctx.writeArtifact(CASE_ID, "project-b-stdout.log", result.stdout)
  await ctx.writeArtifact(CASE_ID, "project-b-stderr.log", result.stderr)
  const events = parseJsonLines(result.stdout)
  await ctx.writeArtifact(CASE_ID, "project-b-events.jsonl", events.map((event) => JSON.stringify(event)).join("\n"))
  if (result.exitCode === 0) throw new Error(`Expected project B command to fail because ${SKILL_NAME} is unavailable`)
  if (!events.some((event) => event.type === "error")) {
    throw new Error(`Expected project B command to emit an error event\nstdout: ${result.stdout}`)
  }
  return { result, events }
}

async function verifyAvailableCommand(
  ctx: CaseContext,
  env: Record<string, string | undefined>,
  projectA: string,
  entry: string,
) {
  const sentMessage = `/${SKILL_NAME} Follow the custom skill instructions.`
  const result = await ctx.runDeveco(requestArgs(projectA), { env, timeoutMs: 120_000, entry })
  await ctx.writeArtifact(CASE_ID, "project-a-stdout.log", result.stdout)
  await ctx.writeArtifact(CASE_ID, "project-a-stderr.log", result.stderr)
  const events = ctx.parseJsonLines(result.stdout)
  await ctx.writeArtifact(CASE_ID, "project-a-events.jsonl", events.map((event) => JSON.stringify(event)).join("\n"))
  if (result.exitCode !== 0) throw new Error(`deveco run in project A exited with ${result.exitCode}\nstderr: ${result.stderr}`)
  const receivedText = receivedTextFrom(events)
  if (!receivedText) throw new Error("No text event was emitted in project A")
  if (!receivedText.includes(RESPONSE_MARKER)) {
    throw new Error(`Expected received text to contain ${RESPONSE_MARKER}, got: ${receivedText || "(empty)"}`)
  }
  return { sentMessage, receivedText, result, events }
}

function requestArgs(project: string) {
  const args = ["run", "--format", "json", "--dir", project, "--command", SKILL_NAME, "Follow the custom skill instructions."]
  const model = process.env.DEVECO_LIVE_MODEL?.trim()
  if (model) args.push("--model", model)
  return args
}

function parseJsonLines(stdout: string) {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line) as Record<string, unknown>)
}

function parseSkills(stdout: string) {
  return JSON.parse(stdout) as Array<{
    name?: unknown
    description?: unknown
    location?: unknown
  }>
}

function receivedTextFrom(events: Array<Record<string, unknown>>) {
  return events
    .filter((event) => event.type === "text")
    .map(textFromEvent)
    .filter((text): text is string => Boolean(text))
    .join("\n")
}

function textFromEvent(event: Record<string, unknown>) {
  const part = event.part
  if (!part || typeof part !== "object") return undefined
  if (!("text" in part) || typeof part.text !== "string") return undefined
  return part.text
}

async function createProjectCliEntry(project: string) {
  const entry = path.join(project, "live-e2e-cli.ts")
  await Bun.write(
    entry,
    `process.chdir(${JSON.stringify(project)}); await import(${JSON.stringify(pathToFileURL(cliEntry).href)});`,
  )
  return entry
}

export default testCase
