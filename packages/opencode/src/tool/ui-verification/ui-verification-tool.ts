import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js"
import { DEVECO_API_URL, getTaskDefaultModelMap } from "@/plugin/deveco-models"
import { ACCESS_TOKEN_EXPIRES_MS, devecoAuth } from "@/plugin/deveco"
import { Session } from "@/session/session"
import { Effect, Schema } from "effect"
import fs from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import { findDevEcoHome, hdcPath, nodePath } from "../lib/env"
import { getSessionCwd } from "../lib/session-cwd"
import { define, type Context, type ExecuteResult } from "../tool"


const VerifyUiParameters = Schema.Struct({
  bundleName: Schema.optional(Schema.String).annotate({
    description: "待测试的应用包名，不填写时自动从项目中获取",
  }),
  device: Schema.optional(Schema.String).annotate({
    description: "接受设备名称（支持子串匹配）或序列号（例如 127.0.0.1:5555）；仅连接一台设备时自动选中，多设备环境下必须指定。",
  }),
  testPlan: Schema.String.annotate({
    description: "自然语言描述的测试用例计划，包括每步的步骤以及预期结果",
  }),
  freshStart: Schema.optional(Schema.Boolean).annotate({
    description: "是否在测试前重新启动应用",
  }),
})

const GetLogParameters = Schema.Struct({
  id: Schema.String.annotate({
    description: "校验ID",
  }),
  maxLogSize: Schema.optional(Schema.Number).annotate({
    description: "可选的日志总字符数限制：默认为5000字符；传-1代表不限制字符数",
  }),
  searchKeywords: Schema.optional(Schema.String).annotate({
    description: "可选的日志搜索关键词。若需要获取完整日志内容，请传空字符串。",
  }),
})

const SaveScreenshotParameters = Schema.Struct({
  id: Schema.String.annotate({
    description: "verify_ui 工具返回的校验任务 ID",
  }),
  dirname: Schema.String.annotate({
    description: "截图保存目录，必须为绝对路径",
  }),
})

type UiVerifyParams = {
  baseURL: string | null
  apiKey: string | null
  modelName: string | null
}

type ToolName = "verify_ui" | "get_ui_verification_log" | "save_ui_screenshot"

type RuntimeState = {
  client: Client
  transport: StdioClientTransport
  schemaProperties: Map<string, Set<string>>
}

const TOOL_NAME_MAP: Record<ToolName, string> = {
  verify_ui: "verifyUI",
  get_ui_verification_log: "getLog",
  save_ui_screenshot: "saveScreenshot",
}

const MISSING_MODEL_MESSAGE =
  "工具调用失败。请将以下内容原文告知用户，不要修改或补充，告知后立即停止，不要再调用任何工具：「UI 意图校验功能不可用：未配置多模态模型。请在配置文件中为 ui_verification agent 配置一个支持多模态的模型，或登录账号以使用内置多模态模型。」"

let gate: Promise<void> = Promise.resolve()
let bound = ""
let runtime: RuntimeState | undefined

export const VerifyUiTool: ReturnType<
  typeof define<typeof VerifyUiParameters, { id?: string }, Session.Service, "verify_ui">
> = define<typeof VerifyUiParameters, { id?: string }, Session.Service, "verify_ui">(
  "verify_ui",
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    return {
      description:
        "在提供自然语言描述的功能步骤之后，本工具可以在HarmonyOS设备上运行应用，根据截图进行判断，执行UI操作，验证功能是否可以正确完成。\n注意：当前支持点击、双击、滑动、长按、按键等触控操作，以及鼠标和键盘操作。\n返回的successPart、failPart字段描述了本次验证过程的主要步骤，id字段是本次校验的唯一标识符，可用于后续的日志查询。\n使用场景：\n开发时验证：通过自然语言描述测试用例，自动执行UI操作，验证应用功能。\n获取运行时日志：配合getLog工具使用，在执行UI操作的同时，收集设备日志，帮助定位问题。\n保存截图：配合saveScreenshot工具使用，在执行UI操作的同时，保存截图，帮助定位问题。",
      parameters: VerifyUiParameters,
      execute: (args, ctx): Effect.Effect<ExecuteResult<{ id?: string }>> =>
        Effect.gen(function* () {
          yield* ctx.ask({ permission: "verify_ui", metadata: {}, patterns: ["*"], always: ["*"] })
          const worktree = yield* Effect.promise(() => resolveWorktree(ctx, sessions))
          if (yield* Effect.promise(() => isBoundDevecoOauthExpired(worktree))) {
            yield* Effect.promise(() => ensureInitialized(worktree))
          }
          const params = yield* Effect.promise(() => resolveUIVerifyParams(worktree))
          if (!params.baseURL || !params.apiKey || !params.modelName) {
            return { title: "UI verification unavailable", output: MISSING_MODEL_MESSAGE, metadata: {} }
          }

          const bundleName = args.bundleName ?? (yield* Effect.promise(() => readBundleName(worktree)))
          const payload = {
            bundleName,
            ...(args.device ? { device: args.device } : {}),
            testPlan: args.testPlan,
            freshStart: args.freshStart ?? false,
            sessionId: ctx.sessionID,
          }
          const result = yield* Effect.promise(() => callUiVerificationTool(worktree, "verify_ui", payload))
          return {
            title: "UI verification",
            output: textFromCallResult(result),
            metadata: readResultId(result),
          }
        }).pipe(Effect.orDie),
    }
  }),
)

export const GetUiVerificationLogTool: ReturnType<
  typeof define<typeof GetLogParameters, Record<string, never>, Session.Service, "get_ui_verification_log">
> = define<typeof GetLogParameters, Record<string, never>, Session.Service, "get_ui_verification_log">(
  "get_ui_verification_log",
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    return {
      description: "根据校验ID获取对应的设备运行日志",
      parameters: GetLogParameters,
      execute: (args, ctx): Effect.Effect<ExecuteResult<Record<string, never>>> =>
        Effect.gen(function* () {
          yield* ctx.ask({ permission: "get_ui_verification_log", metadata: {}, patterns: ["*"], always: ["*"] })
          const worktree = yield* Effect.promise(() => resolveWorktree(ctx, sessions))
          const result = yield* Effect.promise(() =>
            callUiVerificationTool(worktree, "get_ui_verification_log", {
              id: args.id,
              ...(args.maxLogSize === undefined ? {} : { maxLogSize: args.maxLogSize }),
              ...(args.searchKeywords === undefined ? {} : { searchKeywords: args.searchKeywords }),
            }),
          )
          return { title: "UI verification log", output: textFromCallResult(result), metadata: {} }
        }).pipe(Effect.orDie),
    }
  }),
)

export const SaveUiScreenshotTool: ReturnType<
  typeof define<typeof SaveScreenshotParameters, Record<string, never>, Session.Service, "save_ui_screenshot">
> = define<typeof SaveScreenshotParameters, Record<string, never>, Session.Service, "save_ui_screenshot">(
  "save_ui_screenshot",
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    return {
      description: "根据校验ID保存某次校验的每一步截图，返回截图文件名列表",
      parameters: SaveScreenshotParameters,
      execute: (args, ctx): Effect.Effect<ExecuteResult<Record<string, never>>> =>
        Effect.gen(function* () {
          yield* ctx.ask({ permission: "save_ui_screenshot", metadata: {}, patterns: ["*"], always: ["*"] })
          const worktree = yield* Effect.promise(() => resolveWorktree(ctx, sessions))
          const result = yield* Effect.promise(() =>
            callUiVerificationTool(worktree, "save_ui_screenshot", {
              id: args.id,
              dirname: sanitizeFilePath(args.dirname, worktree),
            }),
          )
          return { title: "UI screenshots", output: textFromCallResult(result), metadata: {} };
        }).pipe(Effect.orDie),
    }
  }),
);

async function resolveWorktree(ctx: Context, sessions: Session.Interface): Promise<string> {
  const sessionCwd = getSessionCwd(ctx.sessionID)
  if (sessionCwd) {
    return sessionCwd;
  }
  const session = await Effect.runPromise(sessions.get(ctx.sessionID).pipe(Effect.catch(() => Effect.succeed(undefined))))
  return session?.directory ?? process.cwd();
}

export async function resolveUIVerifyParams(worktree: string): Promise<UiVerifyParams> {
  try {
    const { Effect } = await import("effect")
    const { AppRuntime } = await import("@/effect/app-runtime")
    const { Config } = await import("@/config/config")
    const { Provider } = await import("@/provider/provider")
    const { InstanceStore } = await import("@/project/instance-store")
    const result = await AppRuntime.runPromise(
      InstanceStore.Service.use((store) =>
        store.provide(
          { directory: worktree },
          Effect.gen(function* () {
            const config = yield* Config.Service
            const cfg = yield* config.get()
            const modelStr = cfg.agent?.["ui_verification"]?.model
            if (!modelStr) return null
            const { providerID, modelID } = Provider.parseModel(modelStr)
            const svc = yield* Provider.Service
            const provider = yield* svc.getProvider(providerID).pipe(Effect.catch(() => Effect.succeed(null)))
            const model = yield* svc.getModel(providerID, modelID).pipe(Effect.catch(() => Effect.succeed(null)))
            if (!provider || !model) return null
            return {
              baseURL: (provider.options?.baseURL as string | undefined) ?? model.api.url ?? null,
              apiKey: provider.key ?? (provider.options?.apiKey as string | undefined) ?? null,
              modelName: model.api.id ?? null,
            }
          }),
        ),
      ),
    )
    if (result) {
      return result;
    }
  } catch {}

  if (process.env.UI_VERIFY_BASE_URL && process.env.UI_VERIFY_API_KEY && process.env.UI_VERIFY_MODEL_NAME) {
    return {
      baseURL: process.env.UI_VERIFY_BASE_URL,
      apiKey: process.env.UI_VERIFY_API_KEY,
      modelName: process.env.UI_VERIFY_MODEL_NAME,
    }
  }

  try {
    const { Effect } = await import("effect")
    const { AppRuntime } = await import("@/effect/app-runtime")
    const { Auth } = await import("@/auth")
    const getAuth = () =>
      AppRuntime.runPromise(
        Effect.gen(function* () {
          const svc = yield* Auth.Service
          return yield* svc.get("deveco")
        }),
      ).catch(() => undefined)
    let auth = await getAuth()
    if (auth instanceof Auth.Oauth && auth.access) {
      if (auth.expires < Date.now()) {
        const tokens = await devecoAuth.refreshToken()
        if (tokens) {
          await AppRuntime.runPromise(
            Effect.gen(function* () {
              const svc = yield* Auth.Service
              yield* svc.set(
                "deveco",
                new Auth.Oauth({
                  type: "oauth",
                  access: tokens.accessToken,
                  refresh: tokens.refreshToken,
                  expires: Date.now() + ACCESS_TOKEN_EXPIRES_MS,
                }),
              )
            }),
          )
          auth = await getAuth()
        }
      }
      if (auth instanceof Auth.Oauth && auth.access && auth.expires > Date.now()) {
        return {
          baseURL: DEVECO_API_URL + "/no-stream",
          apiKey: auth.access,
          modelName: getTaskDefaultModelMap()["ui_verification"] ?? "Qwen3_VL_235B_A22B_Instruct",
        }
      }
    }
  } catch {}

  return { baseURL: null, apiKey: null, modelName: null };
}

async function ensureInitialized(worktree: string): Promise<void> {
  gate = gate.then(async () => {
    if (bound === worktree) {
      const { Effect } = await import("effect")
      const { AppRuntime } = await import("@/effect/app-runtime")
      const { Auth } = await import("@/auth")
      const auth = await AppRuntime.runPromise(
        Effect.gen(function* () {
          const svc = yield* Auth.Service
          return yield* svc.get('deveco');
        }),
      ).catch(() => undefined)
      if (!(auth instanceof Auth.Oauth) || auth.expires > Date.now()) {
        return;
      }
    }
    bound = worktree
    await startUiVerificationMcp(worktree)
  })
  await gate;
}

async function isBoundDevecoOauthExpired(worktree: string): Promise<boolean> {
  if (bound !== worktree) {
    return false;
  }
  try {
    const { Effect } = await import("effect")
    const appRuntimeModule: typeof import("@/effect/app-runtime") = await import("@/effect/app-runtime")
    const authModule: typeof import("@/auth") = await import("@/auth")
    const auth: unknown = await appRuntimeModule.AppRuntime.runPromise(
      Effect.gen(function* () {
        const svc = yield* authModule.Auth.Service
        return yield* svc.get('deveco')
      }),
    ).catch(() => undefined)
    return auth instanceof authModule.Auth.Oauth && auth.expires <= Date.now();
  } catch {
    return false;
  }
}

async function startUiVerificationMcp(worktree: string): Promise<void> {
  await stopUiVerificationMcp()
  bound = worktree
  const devecoHome = await findDevEcoHome()
  const resolvedHdcPath = devecoHome ? hdcPath(devecoHome) : undefined
  const verifiedHdcPath = resolvedHdcPath && (await Bun.file(resolvedHdcPath).exists()) ? resolvedHdcPath : undefined
  const logDir = uiVerificationLogDir()
  fs.mkdirSync(logDir, { recursive: true })
  const params = await resolveUIVerifyParams(worktree)
  const script = resolveUiVerificationScript()
  const { AppRuntime } = await import("@/effect/app-runtime")
  await AppRuntime.runPromise(Effect.logInfo("ui_verification model", { service: "ui-verification", baseURL: params.baseURL, modelName: params.modelName }))

  const transport = new StdioClientTransport({
    command: devecoHome ? nodePath(devecoHome) : "node",
    args: [script, logDir],
    cwd: worktree,
    stderr: "ignore",
    env: {
      ...processEnv(verifiedHdcPath ? [] : ["UI_VERIFY_HDC_PATH"]),
      LOG_PATH: logDir,
      ...(verifiedHdcPath ? { UI_VERIFY_HDC_PATH: verifiedHdcPath } : {}),
      UI_VERIFY_BASE_URL: params.baseURL ?? "",
      UI_VERIFY_API_KEY: params.apiKey ?? "",
      UI_VERIFY_MODEL_NAME: params.modelName ?? "",
    },
  })
  const client = new Client({ name: "deveco-ui-verification", version: "1.0.0" })
  await client.connect(transport)
  const listed = await client.listTools()
  runtime = {
    client,
    transport,
    schemaProperties: new Map(
      listed.tools.map((item) => [
        item.name,
        new Set(
          item.inputSchema?.properties && typeof item.inputSchema.properties === "object"
            ? Object.keys(item.inputSchema.properties)
            : [],
        ),
      ]),
    ),
  };
}

function processEnv(omit: string[] = []): Record<string, string> {
  const omitted = new Set(omit)
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined && !omitted.has(entry[0]),
    ),
  );
}

async function callUiVerificationTool(worktree: string, toolName: ToolName, args: Record<string, unknown>): Promise<unknown> {
  await ensureInitialized(worktree)
  if (!runtime) {
    throw new Error('ui-verification-mcp is not initialized');
  }
  const name = TOOL_NAME_MAP[toolName]
  return await runtime.client.callTool(
    {
      name,
      arguments: filterArguments(name, args),
    },
    CallToolResultSchema,
    {
      resetTimeoutOnProgress: true,
      timeout: 30 * 60 * 1000,
    },
  );
}

export async function stopUiVerificationMcp(): Promise<void> {
  const current = runtime
  runtime = undefined
  bound = ""
  if (!current) {
    return;
  }
  try {
    await current.client.close();
  } catch {}
}

function filterArguments(toolName: string, args: Record<string, unknown>): Record<string, unknown> {
  const properties = runtime?.schemaProperties.get(toolName)
  if (!properties || properties.size === 0) {
    return args;
  }
  if (args.device !== undefined && !properties.has("device")) {
    throw new Error("The installed ui-verification-mcp package does not support the device parameter.")
  }
  return Object.fromEntries(
    Object.entries(args).filter(([key]) => properties.has(key) || (toolName === 'verifyUI' && key === 'sessionId')),
  );
}

function uiVerificationLogDir(): string {
  return path.join(
    process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share", "deveco"),
    "log",
    "deveco-mcp",
    "uiVerificationLog",
  );
}

function resolveUiVerificationScript(): string {
  const execDir = path.dirname(process.execPath)
  const vendor = path.join(execDir, "..", "vendor", "ui-verification-mcp", "uiVerification.mjs")
  if (fs.existsSync(vendor)) {
    return vendor;
  }

  const legacy = path.join(execDir, "ui-verification-mcp", "uiVerification.mjs")
  if (fs.existsSync(legacy)) {
    return legacy;
  }

  const pkgJson = createRequire(import.meta.url).resolve("ui-verification-mcp/package.json")
  return path.join(path.dirname(pkgJson), "dist", "uiVerification.mjs");
}

function textFromCallResult(result: unknown): string {
  if (!result || typeof result !== "object") return JSON.stringify(result, null, 2)
  const content = (result as { content?: unknown }).content
  if (!Array.isArray(content)) {
    return JSON.stringify(result, null, 2);
  }
  const text = content
    .map((item) =>
      item && typeof item === "object" && typeof (item as { text?: unknown }).text === "string"
        ? (item as { text: string }).text
        : "",
    )
    .filter(Boolean)
    .join('\n')
  return text || JSON.stringify(result, null, 2);
}

function readResultId(result: unknown): { id?: string } {
  const text = textFromCallResult(result)
  try {
    const parsed = JSON.parse(text) as { id?: unknown }
    return typeof parsed.id === "string" ? { id: parsed.id } : {}
  } catch {
    return {};
  }
}

async function readBundleName(worktree: string): Promise<string> {
  const project = await findHarmonyProject(worktree)
  const appJson = path.join(project, "AppScope", "app.json5")
  const content = await fs.promises.readFile(appJson, "utf8")
  const match = /"bundleName"\s*:\s*"([^"]+)"/.exec(content)
  if (!match?.[1]) {
    throw new Error("bundleName 未填写，自动从 AppScope/app.json5 获取失败: bundleName not found")
  }
  return match[1];
}

async function findHarmonyProject(start: string): Promise<string> {
  const root = path.resolve(start)
  const stat = await fs.promises.stat(root).catch(() => undefined)
  if (!stat) throw new Error(`The path does not exist: ${root}`)
  const initial = stat.isDirectory() ? root : path.dirname(root)
  if (isHarmonyProject(initial)) return initial
  const found = searchHarmonyProject(initial, 0, 3)
  if (found) {
    return found;
  }
  throw new Error(`在路径 '${initial}' 及其子目录中未找到 Harmony 工程。`);
}

function searchHarmonyProject(current: string, depth: number, maxDepth: number): string | undefined {
  if (depth >= maxDepth) {
    return undefined;
  }
  const entries = fs.readdirSync(current, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }
    const next = path.join(current, entry.name)
    if (isHarmonyProject(next)) {
      return next;
    }
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name === 'oh_modules') {
      continue
    }
    const found = searchHarmonyProject(path.join(current, entry.name), depth + 1, maxDepth)
    if (found) {
      return found;
    }
  }
  return undefined;
}

function isHarmonyProject(dir: string): boolean {
  return (
    fs.existsSync(path.join(dir, "build-profile.json5")) &&
    (fs.existsSync(path.join(dir, "hvigorfile.js")) || fs.existsSync(path.join(dir, "hvigorfile.ts")))
  );
}

function sanitizeFilePath(filePath: string, worktree: string): string {
  const resolved = path.resolve(worktree, filePath)
  const realResolved = fs.existsSync(resolved) ? fs.realpathSync(resolved) : resolved
  const realWorktree = fs.existsSync(worktree) ? fs.realpathSync(worktree) : worktree
  const normalizedResolved = path.normalize(realResolved)
  const normalizedWorktree = path.normalize(realWorktree)
  const prefix = normalizedWorktree.endsWith(path.sep) ? normalizedWorktree : normalizedWorktree + path.sep
  if (normalizedResolved !== normalizedWorktree && !normalizedResolved.startsWith(prefix)) {
    throw new Error(`Path traversal detected: ${filePath} resolves to ${resolved}, which is outside worktree ${worktree}`)
  }
  return realResolved;
}
