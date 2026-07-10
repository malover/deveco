import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { findDevEcoHome, hdcPath } from "../../src/tool/lib/env"
import type { CaseContext, RunCommandResult } from "./types"

export const opencodeRoot = path.resolve(import.meta.dir, "../..")
export const repoRoot = path.resolve(opencodeRoot, "../..")
export const cliEntry = path.join(opencodeRoot, "src/index.ts")
export const latestReportDir = path.join(repoRoot, "reports", "live-e2e", "latest")
export const artifactDir = path.join(latestReportDir, "artifacts")

export function realUserEnv() {
  const env = { ...process.env }

  delete env.DEVECO_TEST_HOME
  delete env.DEVECO_AUTH_CONTENT
  delete env.DEVECO_MODELS_PATH
  delete env.DEVECO_DB
  delete env.XDG_DATA_HOME
  delete env.XDG_CACHE_HOME
  delete env.XDG_CONFIG_HOME
  delete env.XDG_STATE_HOME

  return {
    ...env,
    DEVECO_DISABLE_AUTOUPDATE: "1",
    DEVECO_DISABLE_AUTOCOMPACT: "1",
    DEVECO_DISABLE_PROJECT_CONFIG: "1",
    DEVECO_DISABLE_MODELS_FETCH: "1",
  }
}

export async function resetReportDir() {
  await fs.rm(latestReportDir, { recursive: true, force: true })
  await fs.mkdir(artifactDir, { recursive: true })
}

// The deveco-create-project skill may be partially installed in the user's
// config directory (~/.config/deveco/skills/) — SKILL.md is present but the
// scripts/ and application/ template directories are empty. The skill system
// discovers the skill from the config directory and resolves script paths
// relative to that base, so the AI gets MODULE_NOT_FOUND when it tries to
// run copy-template.mjs following the skill's instructions.
//
// This syncs the missing files from the bundled resources directory before
// running live tests so the AI can reliably find and execute the script.
export async function ensureBundledSkillScriptsAvailable() {
  const configSkillDir = path.join(os.homedir(), ".config", "deveco", "skills", "deveco-create-project")
  const configScript = path.join(configSkillDir, "scripts", "copy-template.mjs")

  // Scripts already present — no sync needed
  const scriptExists = await fs.stat(configScript).then(() => true).catch(() => false)
  if (scriptExists) return false

  // Only sync if the config dir has a partial install (SKILL.md present)
  const skillMdExists = await fs.stat(path.join(configSkillDir, "SKILL.md")).then(() => true).catch(() => false)
  if (!skillMdExists) return false

  // Copy complete skill from bundled resources, overwriting the partial install
  const resourcesSkillDir = path.join(opencodeRoot, "resources", "skills", "deveco-create-project")
  await fs.cp(resourcesSkillDir, configSkillDir, { recursive: true, force: true })
  return true
}

export async function createTempWorkspace(prefix = "deveco-live-e2e-") {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix))
}

export async function runDeveco(
  args: string[],
  options: { timeoutMs?: number; cwd?: string; stdin?: string; env?: Record<string, string | undefined>; entry?: string; stallMs?: number } = {},
): Promise<RunCommandResult> {
  const start = Date.now()
  const entry = options.entry ?? cliEntry
  const env = options.env ?? realUserEnv()
  const proc = Bun.spawn(
    [
      process.execPath,
      "run",
      "--preload",
      path.join(opencodeRoot, "node_modules", "@opentui", "solid", "scripts", "preload.ts"),
      "--conditions=browser",
      entry,
      ...args,
    ],
    {
      cwd: options.cwd ?? opencodeRoot,
      env,
      stdin: options.stdin ? "pipe" : "ignore",
      stdout: "pipe",
      stderr: "pipe",
    },
  )

  const stdin = proc.stdin
  if (options.stdin && stdin) {
    stdin.write(options.stdin)
    stdin.end()
  }

  const effectiveTimeout = options.timeoutMs ?? 120_000
  const stallMs = options.stallMs ?? 60_000

  // Read stdout incrementally to support stall detection.
  // If no new data arrives for stallMs, kill the process early instead of
  // waiting the full timeout. This turns a 120-190s hang into a ~30s fast-fail.
  const decoder = new TextDecoder()
  let stdout = ""
  let stallTimer: ReturnType<typeof setTimeout> | undefined
  const armStall = () => {
    if (stallTimer) clearTimeout(stallTimer)
    stallTimer = setTimeout(() => proc.kill(), stallMs)
  }
  armStall()

  const stdoutReader = proc.stdout.getReader()
  const readStdout = (async () => {
    while (true) {
      const { done, value } = await stdoutReader.read()
      if (done) break
      stdout += decoder.decode(value, { stream: true })
      armStall()
    }
  })()

  const timeout = setTimeout(() => proc.kill(), effectiveTimeout)
  try {
    const stderrPromise = new Response(proc.stderr).text()
    const [exitCode, , stderr] = await Promise.all([proc.exited, readStdout, stderrPromise])
    return {
      exitCode,
      stdout,
      stderr,
      durationMs: Date.now() - start,
      suspectedRateLimit: stdout.length === 0 && stderr.length === 0,
    }
  } finally {
    if (stallTimer) clearTimeout(stallTimer)
    clearTimeout(timeout)
  }
}

export async function runDevecoPrompt(
  message: string,
  options: { timeoutMs?: number; model?: string; workspace?: string } = {},
) {
  const workspace = options.workspace ?? (await createTempWorkspace())
  const ownsWorkspace = options.workspace === undefined
  try {
    const args = ["run", "--format", "json", "--dir", workspace]
    const model = options.model ?? process.env.DEVECO_LIVE_MODEL?.trim()
    if (model) args.push("--model", model)
    return await runDeveco(args, { timeoutMs: options.timeoutMs, stdin: message })
  } finally {
    if (ownsWorkspace) await fs.rm(workspace, { recursive: true, force: true })
  }
}

export function parseJsonLines(stdout: string) {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>)
}

export async function writeArtifact(caseID: string, filename: string, content: string) {
  const safeCaseID = caseID.replace(/[^a-zA-Z0-9._-]/g, "_")
  const file = path.join(artifactDir, `${safeCaseID}.${filename}`)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, content)
  return file
}

export function makeContext(): CaseContext {
  return {
    reportDir: latestReportDir,
    artifactDir,
    createTempWorkspace,
    writeArtifact,
    runDeveco,
    runDevecoPrompt,
    parseJsonLines,
  }
}

function isEmulatorTarget(target: string) {
  return /^127\.0\.0\.1:\d+/.test(target)
}

// DevEco Studio persists installed (not running) emulator definitions under
// <user-local-data>/Huawei/Emulator/deployed/. Each emulator has a `.ini` file
// whose basename is the emulator name (e.g. `Pura 90.ini`). The start_app tool
// reads this directory to list startable emulators; we replicate the lookup
// here so the runner can skip emulator-dependent cases when none are installed.
function emulatorDeployedDir() {
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Huawei", "Emulator", "deployed")
  }
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local")
  return path.join(localAppData, "Huawei", "Emulator", "deployed")
}

async function listInstalledEmulators(): Promise<string[]> {
  try {
    const entries = await fs.readdir(emulatorDeployedDir(), { withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ini"))
      .map((entry) => entry.name.replace(/\.ini$/, ""))
  } catch {
    return []
  }
}

type ThirdPartyModelEnv = {
  available: boolean
  models: string[]
}

// Reads the shared live-e2e fixture config and reports whether a third-party
// provider/model is configured. Cases that actually issue a model request can
// declare the `third-party-model` requirement so the runner skips them when the
// fixture is left empty (the default skeleton ships with an empty provider).
async function collectThirdPartyModelConfig(): Promise<ThirdPartyModelEnv> {
  try {
    const configPath = path.join(import.meta.dir, "fixtures", "live-e2e.config.json")
    const raw = (await Bun.file(configPath).json()) as {
      thirdPartyModel?: { provider?: Record<string, { models?: Record<string, unknown> }> }
    }
    const provider = raw.thirdPartyModel?.provider ?? {}
    const models = Object.entries(provider).flatMap(([providerName, value]) =>
      Object.keys(value.models ?? {}).map((model) => `${providerName}/${model}`),
    )
    return { available: models.length > 0, models }
  } catch {
    return { available: false, models: [] }
  }
}

async function runProcess(cmd: string[], timeoutMs = 30_000) {
  const proc = Bun.spawn(cmd, {
    stdout: "pipe",
    stderr: "pipe",
  })
  const timeout = setTimeout(() => proc.kill(), timeoutMs)
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]).finally(() => clearTimeout(timeout))
  return { exitCode, stdout, stderr }
}

async function collectDevEcoEnvironment() {
  const installedEmulators = await listInstalledEmulators()
  const home = await findDevEcoHome()
  if (!home) {
    return {
      home: undefined,
      hdc: undefined,
      devices: [] as string[],
      emulators: [] as string[],
      installedEmulators,
      hdcList: undefined,
    }
  }

  const hdc = hdcPath(home)
  if (!(await Bun.file(hdc).exists())) {
    return {
      home,
      hdc,
      devices: [] as string[],
      emulators: [] as string[],
      installedEmulators,
      hdcList: {
        exitCode: undefined,
        stdout: "",
        stderr: `hdc not found: ${hdc}`,
      },
    }
  }

  const hdcList = await runProcess([hdc, "list", "targets"], 10_000)
  const devices =
    hdcList.exitCode === 0
      ? hdcList.stdout
          .split(/\r?\n/)
          .map((item) => item.trim())
          .filter((item) => item && !item.includes("[Empty]"))
      : []
  return {
    home,
    hdc,
    devices,
    emulators: devices.filter(isEmulatorTarget),
    installedEmulators,
    hdcList,
  }
}

export async function collectEnvironment() {
  const [paths, auth, toolchain, thirdPartyModel] = await Promise.all([
    runDeveco(["debug", "paths"], { timeoutMs: 30_000 }),
    runDeveco(["auth", "list"], { timeoutMs: 30_000 }),
    collectDevEcoEnvironment(),
    collectThirdPartyModelConfig(),
  ])

  const authStdout = auth.stdout.toLowerCase()

  return {
    liveEnabled: process.env.DEVECO_LIVE_LLM === "1",
    selectedModel: process.env.DEVECO_LIVE_MODEL || "(default)",
    opencodeRoot,
    reportDir: latestReportDir,
    deveco: toolchain,
    thirdPartyModel,
    paths: {
      exitCode: paths.exitCode,
      stdout: paths.stdout,
      stderr: paths.stderr,
    },
    auth: {
      exitCode: auth.exitCode,
      stdout: auth.stdout,
      stderr: auth.stderr,
      hasDevecoOAuth:
        auth.exitCode === 0 &&
        authStdout.includes("oauth") &&
        (authStdout.includes("deveco code") || authStdout.includes("deveco")),
    },
  }
}
