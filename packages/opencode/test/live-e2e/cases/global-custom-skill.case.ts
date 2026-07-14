import fs from "node:fs/promises"
import path from "node:path"
import { realUserEnv } from "../env"
import type { CaseContext, LiveTestCase } from "../types"

const CASE_ID = "GLOBAL_CUSTOM_SKILL"
const SKILL_NAME = "live-e2e-global-skill"
const SKILL_DESCRIPTION = "Returns the live e2e custom skill marker."
const RESPONSE_MARKER = "GLOBAL_SKILL_OK"

function textFromEvent(event: Record<string, unknown>) {
  const part = event.part
  if (!part || typeof part !== "object") return undefined
  if (!("text" in part) || typeof part.text !== "string") return undefined
  return part.text
}

const testCase: LiveTestCase = {
  id: CASE_ID,
  title: "添加本地全局自定义 skill",
  category: "skill",
  priority: "P0",
  timeoutMs: 150_000,
  requires: ["huawei-auth", "real-llm", "deveco-provider"],
  description:
    "验证用户目录 ~/.agents/skills 下的自定义 skill 会出现在 /skills 列表中，并可作为 slash command 携带到真实 LLM 请求。",
  steps: [
    "创建临时用户目录和临时工作目录。",
    `在临时用户目录的 .agents/skills/${SKILL_NAME}/SKILL.md 写入自定义 skill。`,
    "执行 deveco debug skill，校验 /skills 的数据源包含新增 skill。",
    `执行 deveco run --command ${SKILL_NAME} --format json，发送携带该 skill 的真实请求。`,
    `解析 JSON line events，校验模型响应包含 ${RESPONSE_MARKER}。`,
  ],
  expected: [
    "skill 列表命令退出码为 0，且能查看新增自定义 skill 的名称、描述和用户目录位置。",
    "携带自定义 skill 的请求退出码为 0。",
    `stdout 中至少存在一个 text event，且模型响应包含 ${RESPONSE_MARKER}。`,
  ],
  code: "packages/opencode/test/live-e2e/cases/global-custom-skill.case.ts",
  parallel: false,
  cleanup: "执行结束后删除临时用户目录和临时工作目录；真实 auth/config 只读，不修改也不清理。",
  async run(ctx) {
    const home = await ctx.createTempWorkspace("global-custom-skill-home-")
    const workspace = await ctx.createTempWorkspace("global-custom-skill-workspace-")
    const skillFile = path.join(home, ".agents", "skills", SKILL_NAME, "SKILL.md")
    const env = { ...realUserEnv(), DEVECO_TEST_HOME: home }

    try {
      await writeSkill(skillFile)
      const listResult = await verifySkillList(ctx, env, skillFile)
      const request = await verifySkillRequest(ctx, env, workspace)

      return {
        sentMessage: request.sentMessage,
        receivedText: request.receivedText,
        sessionID: request.events.find((event) => typeof event.sessionID === "string")?.sessionID as string | undefined,
        stdout: request.result.stdout,
        stderr: request.result.stderr,
        events: request.events,
        details: {
          listExitCode: listResult.exitCode,
          requestExitCode: request.result.exitCode,
          skillFile,
          workspace,
        },
      }
    } finally {
      await Promise.all([
        fs.rm(home, { recursive: true, force: true }),
        fs.rm(workspace, { recursive: true, force: true }),
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

# Live E2E Global Skill

When invoked, reply with exactly \`${RESPONSE_MARKER}\` and nothing else.
Do not call tools.
`,
  )
}

async function verifySkillList(ctx: CaseContext, env: Record<string, string | undefined>, skillFile: string) {
  const result = await ctx.runDeveco(["debug", "skill"], { env, timeoutMs: 15_000 })
  await ctx.writeArtifact(CASE_ID, "list-stdout.log", result.stdout)
  await ctx.writeArtifact(CASE_ID, "list-stderr.log", result.stderr)
  if (result.exitCode !== 0) throw new Error(`deveco debug skill exited with ${result.exitCode}\nstderr: ${result.stderr}`)

  const listedSkill = parseSkills(result.stdout).find((skill) => skill.name === SKILL_NAME)
  if (!listedSkill) throw new Error(`Expected /skills data to contain ${SKILL_NAME}\nstdout: ${result.stdout}`)
  if (listedSkill.description !== SKILL_DESCRIPTION) {
    throw new Error(`Expected ${SKILL_NAME} description to be ${SKILL_DESCRIPTION}`)
  }
  if (typeof listedSkill.location !== "string" || !listedSkill.location.includes(skillFile)) {
    throw new Error(`Expected ${SKILL_NAME} location to contain ${skillFile}, got: ${listedSkill.location}`)
  }
  return result
}

function parseSkills(stdout: string) {
  return JSON.parse(stdout) as Array<{
    name?: unknown
    description?: unknown
    location?: unknown
  }>
}

async function verifySkillRequest(ctx: CaseContext, env: Record<string, string | undefined>, workspace: string) {
  const sentMessage = `/${SKILL_NAME} Follow the custom skill instructions.`
  const result = await ctx.runDeveco(requestArgs(workspace), { env, timeoutMs: 120_000 })
  await ctx.writeArtifact(CASE_ID, "stdout.log", result.stdout)
  await ctx.writeArtifact(CASE_ID, "stderr.log", result.stderr)
  const events = ctx.parseJsonLines(result.stdout)
  await ctx.writeArtifact(CASE_ID, "events.jsonl", events.map((event) => JSON.stringify(event)).join("\n"))
  if (result.exitCode !== 0) throw new Error(`deveco run exited with ${result.exitCode}\nstderr: ${result.stderr}`)

  const receivedText = receivedTextFrom(events)
  if (!receivedText) throw new Error("No text event was emitted")
  if (!receivedText.includes(RESPONSE_MARKER)) {
    throw new Error(`Expected received text to contain ${RESPONSE_MARKER}, got: ${receivedText || "(empty)"}`)
  }
  return { sentMessage, receivedText, result, events }
}

function requestArgs(workspace: string) {
  const args = ["run", "--format", "json", "--dir", workspace, "--command", SKILL_NAME, "Follow the custom skill instructions."]
  const model = process.env.DEVECO_LIVE_MODEL?.trim()
  if (model) args.push("--model", model)
  return args
}

function receivedTextFrom(events: Array<Record<string, unknown>>) {
  return events
    .filter((event) => event.type === "text")
    .map(textFromEvent)
    .filter((text): text is string => Boolean(text))
    .join("\n")
}

export default testCase
