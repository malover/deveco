import fs from "node:fs/promises"
import path from "node:path"
import { realUserEnv } from "../env"
import type { LiveTestCase } from "../types"

const CASE_ID = "AGENT_CREATE"

const testCase: LiveTestCase = {
  id: CASE_ID,
  title: "创建 agent 配置",
  category: "llm",
  priority: "P1",
  timeoutMs: 180_000,
  requires: ["huawei-auth", "real-llm", "deveco-provider"],
  description: "验证 deveco agent create 可使用真实模型在临时目录生成非交互 agent 配置。",
  steps: [
    "创建隔离临时工作目录。",
    "使用完整非交互参数执行 deveco agent create。",
    "检查临时 .deveco/agents 目录中的生成文件。",
  ],
  expected: [
    "deveco agent create 退出码为 0。",
    "临时目录中恰好生成一个 agent Markdown 文件，包含 mode: subagent 和非空 prompt。",
  ],
  code: "packages/opencode/test/live-e2e/cases/agent-create.case.ts",
  parallel: false,
  cleanup: "执行结束后删除临时工作目录；真实 auth/config 仅用于模型请求，不修改也不清理。",
  async run(ctx) {
    const workspace = await ctx.createTempWorkspace("agent-create-")
    const target = path.join(workspace, ".deveco")
    try {
      const result = await ctx.runDeveco(createArgs(target), { env: realUserEnv(), cwd: workspace, timeoutMs: 150_000 })
      await Promise.all([
        ctx.writeArtifact(CASE_ID, "stdout.log", result.stdout),
        ctx.writeArtifact(CASE_ID, "stderr.log", result.stderr),
      ])
      if (result.exitCode !== 0) {
        throw new Error(
          `deveco agent create exited with ${result.exitCode}\nstderr: ${result.stderr}\nstdout: ${result.stdout}`,
        )
      }

      const agentFile = await createdAgent(path.join(target, "agents"))
      const content = await fs.readFile(agentFile, "utf8")
      validateAgent(content)
      await ctx.writeArtifact(CASE_ID, "agent.md", content)

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        details: { exitCode: result.exitCode, commandDurationMs: result.durationMs, agentFile },
      }
    } finally {
      await fs.rm(workspace, { recursive: true, force: true }).catch(() => undefined)
    }
  },
}

function createArgs(target: string) {
  const args = [
    "agent",
    "create",
    "--path",
    target,
    "--description",
    "Review ArkTS application code and provide concise, actionable fixes.",
    "--mode",
    "subagent",
    "--permissions",
    "",
  ]
  const model = process.env.DEVECO_LIVE_MODEL?.trim()
  if (model) args.push("--model", model)
  return args
}

async function createdAgent(directory: string) {
  const files = (await fs.readdir(directory)).filter((file) => file.endsWith(".md"))
  if (files.length !== 1)
    throw new Error(`Expected exactly one generated agent Markdown file, got ${files.join(", ") || "none"}`)
  return path.join(directory, files[0])
}

function validateAgent(content: string) {
  const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n([\s\S]+)$/)
  if (!match) throw new Error("Generated agent file does not contain frontmatter and prompt")
  if (!/^mode:\s*subagent\s*$/m.test(match[1]))
    throw new Error("Generated agent frontmatter does not set mode: subagent")
  if (!match[2].trim()) throw new Error("Generated agent prompt is empty")
}

export default testCase
