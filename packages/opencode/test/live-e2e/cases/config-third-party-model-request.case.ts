import fs from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { cliEntry } from "../env"
import type { CaseContext, LiveTestCase, RunCommandResult } from "../types"

const CASE_ID = "CONFIG_THIRD_PARTY_MODEL_REQUEST"
const PROMPT = "Reply with a short confirmation that the model request succeeded."

type ProviderConfig = {
  provider: Record<string, { models?: Record<string, unknown> }>
}

type TestConfig = {
  thirdPartyModel: ProviderConfig
}

const testCase: LiveTestCase = {
  id: CASE_ID,
  title: "全局配置三方模型并发起请求",
  category: "llm",
  priority: "P1",
  timeoutMs: 300_000,
  requires: ["real-llm", "third-party-model"],
  description:
    "验证从通用测试配置文件读取三方模型配置并写入临时全局配置后，模型可通过 deveco models 查询，并可成功发起请求。",
  steps: [
    "读取 live-e2e 通用测试配置中的三方模型全局配置。",
    "确认该配置中已填入一个可用三方供应商和模型。",
    "创建隔离的临时全局配置目录和临时工作目录。",
    "将三方模型配置写入临时全局 deveco.jsonc。",
    "执行 deveco models，验证模型列表包含配置的三方模型。",
    "选择该三方模型执行 deveco run。",
    "解析 JSON line events，验证请求成功并返回文本。",
  ],
  expected: [
    "deveco models 输出包含配置的三方模型。",
    "deveco run 进程退出码为 0。",
    "请求至少返回一个非空 text event。",
  ],
  code: "packages/opencode/test/live-e2e/cases/config-third-party-model-request.case.ts",
  parallel: false,
  cleanup: "执行结束后删除临时全局配置目录和工作目录；不读取或修改用户真实 auth/config。",
  async run(ctx) {
    const config = await readThirdPartyConfig()
    const configuredModels = requireSingleModel(config)
    const globalConfigDir = await ctx.createTempWorkspace("e2e-third-party-global-")
    const workspace = await ctx.createTempWorkspace("e2e-third-party-workspace-")
    const globalConfigPath = path.join(globalConfigDir, "deveco.jsonc")

    try {
      await Bun.write(globalConfigPath, JSON.stringify(config, null, 2))
      const env = makeTestEnv(globalConfigPath, globalConfigDir)
      const entry = await createProjectCliEntry(workspace)
      const model = configuredModels[0]
      const modelsResult = await verifyModelsList(ctx, env, entry, model)
      const result = await runModelRequest(ctx, env, entry, workspace, model)
      const events = ctx.parseJsonLines(result.stdout)
      await ctx.writeArtifact(CASE_ID, "events.jsonl", events.map((event) => JSON.stringify(event)).join("\n"))

      const receivedText = receivedTextFrom(events)
      if (!receivedText) {
        throw new Error("Expected the model request to return at least one non-empty text event")
      }

      return {
        sentMessage: PROMPT,
        receivedText,
        sessionID: events.find((event) => typeof event.sessionID === "string")?.sessionID as string | undefined,
        stdout: result.stdout,
        stderr: result.stderr,
        events,
        details: {
          modelsExitCode: modelsResult.exitCode,
          requestExitCode: result.exitCode,
          configuredModels,
          requestedModel: model,
          globalConfigPath,
          workspace,
        },
      }
    } finally {
      await Promise.all([
        fs.rm(globalConfigDir, { recursive: true, force: true }),
        fs.rm(workspace, { recursive: true, force: true }),
      ])
    }
  },
}

async function readThirdPartyConfig() {
  return ((await Bun.file(new URL("../fixtures/live-e2e.config.json", import.meta.url)).json()) as TestConfig)
    .thirdPartyModel
}

function modelReferences(config: ProviderConfig) {
  return Object.entries(config.provider).flatMap(([provider, value]) =>
    Object.keys(value.models ?? {}).map((model) => `${provider}/${model}`),
  )
}

function requireSingleModel(config: ProviderConfig) {
  const configuredModels = modelReferences(config)
  if (configuredModels.length !== 1) {
    throw new Error(
      `Expected exactly one third-party model in live-e2e.config.json, got ${configuredModels.length}. Fill thirdPartyModel.provider with one local test provider/model before running this case.`,
    )
  }
  return configuredModels
}

async function verifyModelsList(
  ctx: CaseContext,
  env: Record<string, string | undefined>,
  entry: string,
  model: string,
) {
  const result = await ctx.runDeveco(["models"], { env, entry, timeoutMs: 130_000 })
  await Promise.all([
    ctx.writeArtifact(CASE_ID, "models-stdout.log", result.stdout),
    ctx.writeArtifact(CASE_ID, "models-stderr.log", result.stderr),
  ])
  if (result.exitCode !== 0) throw new Error(`deveco models exited with ${result.exitCode}\nstderr: ${result.stderr}`)
  if (!result.stdout.includes(model)) throw new Error(`deveco models output should contain ${model}.\nstdout:\n${result.stdout}`)
  return result
}

async function runModelRequest(
  ctx: CaseContext,
  env: Record<string, string | undefined>,
  entry: string,
  workspace: string,
  model: string,
) {
  const result = await ctx.runDeveco(
    ["run", "--format", "json", "--dir", workspace, "--title", "Live E2E third-party model", "--model", model, PROMPT],
    { env, entry, timeoutMs: 130_000 },
  )
  await Promise.all([
    ctx.writeArtifact(CASE_ID, "request-stdout.log", result.stdout),
    ctx.writeArtifact(CASE_ID, "request-stderr.log", result.stderr),
  ])
  if (result.exitCode !== 0) throw new Error(`deveco run exited with ${result.exitCode}\nstderr: ${result.stderr}`)
  return result
}

function makeTestEnv(globalConfigPath: string, home: string) {
  const env: Record<string, string | undefined> = {
    ...process.env,
    DEVECO_CONFIG: globalConfigPath,
    DEVECO_TEST_HOME: home,
    DEVECO_TEST_MANAGED_CONFIG_DIR: path.join(home, "managed"),
    DEVECO_DISABLE_MODELS_FETCH: "1",
    DEVECO_DISABLE_AUTOUPDATE: "1",
    DEVECO_DISABLE_AUTOCOMPACT: "1",
    XDG_DATA_HOME: path.join(home, "data"),
    XDG_CACHE_HOME: path.join(home, "cache"),
    XDG_CONFIG_HOME: path.join(home, "config"),
    XDG_STATE_HOME: path.join(home, "state"),
  }
  delete env.DEVECO_DISABLE_PROJECT_CONFIG
  delete env.DEVECO_AUTH_CONTENT
  delete env.DEVECO_MODELS_PATH
  delete env.DEVECO_DB
  return env
}

function receivedTextFrom(events: Array<Record<string, unknown>>) {
  return events
    .filter((event) => event.type === "text")
    .map(textFromEvent)
    .filter((text): text is string => Boolean(text?.trim()))
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
