import fs from "fs/promises"
import fsSync from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { Global } from "@opencode-ai/core/global"

const PACKAGE_NAMES = ["@deveco/deveco-cli", "@deveco-test/deveco-cli"] as const
const VENDOR_DIRNAME = "deveco-cli"
const PATH_MARKER = ".deveco-cli-path"
const SHIM_NAME = "devecocli"

export type DevecoCliShellEnv = {
  PATH: string
  Path?: string
}

function pathSep() {
  return process.platform === "win32" ? ";" : ":"
}

function resolveVendoredEntry(vendorRoot: string): string | undefined {
  for (const name of PACKAGE_NAMES) {
    const candidate = path.join(vendorRoot, "node_modules", ...name.split("/"), "dist", "cli.js")
    if (exists(candidate)) return candidate
  }
  const flat = path.join(vendorRoot, "dist", "cli.js")
  if (exists(flat)) return flat
  return undefined
}

function exists(file: string) {
  return fsSync.existsSync(file)
}

function candidateVendorRoots(): string[] {
  const roots: string[] = []
  const execDir = path.dirname(process.execPath)
  roots.push(path.join(execDir, "..", "vendor", VENDOR_DIRNAME))

  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
  roots.push(path.join(packageRoot, ".build-cache", VENDOR_DIRNAME))

  return roots
}

let testEntryOverride: string | undefined

export function __setTestDevecoCliEntry(entry: string | undefined) {
  testEntryOverride = entry
}

export function resolveBundledDevecoCliEntry(): string | undefined {
  if (testEntryOverride && exists(testEntryOverride)) return path.resolve(testEntryOverride)

  for (const root of candidateVendorRoots()) {
    const entry = resolveVendoredEntry(root)
    if (entry) return path.resolve(entry)
  }

  let current = path.dirname(fileURLToPath(import.meta.url))
  for (;;) {
    for (const name of PACKAGE_NAMES) {
      const entry = path.join(current, "node_modules", ...name.split("/"), "dist", "cli.js")
      if (exists(entry)) return path.resolve(entry)
    }
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }

  return undefined
}

function normalizePathKey(dir: string) {
  const resolved = path.resolve(dir)
  return process.platform === "win32" ? resolved.toLowerCase() : resolved
}

export function isolatedShellPath(current: string | undefined, shimDir: string) {
  const sep = pathSep()
  const shimKey = normalizePathKey(shimDir)
  // Prepending the bundled shim is enough to shadow a global devecocli.
  // Keep the remaining directories because one may also provide node itself.
  const filtered: string[] = [shimDir]
  const seen = new Set<string>([shimKey])

  for (const part of (current ?? "").split(sep).filter(Boolean)) {
    const key = normalizePathKey(part)
    if (seen.has(key)) continue
    seen.add(key)
    filtered.push(part)
  }

  return filtered.join(sep)
}

function unixShimContents() {
  return `#!/usr/bin/env sh
DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
CLI="$(cat "$DIR/${PATH_MARKER}")"
exec node "$CLI" "$@"
`
}

function windowsShimContents() {
  return `@ECHO OFF\r\nSETLOCAL\r\nSET /P CLI=<"%~dp0${PATH_MARKER}"\r\nnode "%CLI%" %*\r\nENDLOCAL & exit /b %ERRORLEVEL%\r\n`
}

async function shimNeedsUpdate(binDir: string, entry: string) {
  const marker = path.join(binDir, PATH_MARKER)
  try {
    const current = (await fs.readFile(marker, "utf8")).trim()
    if (current !== entry) return true
  } catch {
    return true
  }

  const shimPath = path.join(binDir, process.platform === "win32" ? `${SHIM_NAME}.cmd` : SHIM_NAME)
  const expected = process.platform === "win32" ? windowsShimContents() : unixShimContents()
  try {
    const current = await fs.readFile(shimPath, "utf8")
    return current !== expected
  } catch {
    return true
  }
}

export async function ensureDevecoCliShim(binDir = Global.Path.bin): Promise<string | undefined> {
  const entry = resolveBundledDevecoCliEntry()
  if (!entry) return undefined

  await fs.mkdir(binDir, { recursive: true })

  if (!(await shimNeedsUpdate(binDir, entry))) {
    return binDir
  }

  await fs.writeFile(path.join(binDir, PATH_MARKER), `${entry}\n`, "utf8")

  if (process.platform === "win32") {
    await fs.writeFile(path.join(binDir, `${SHIM_NAME}.cmd`), windowsShimContents(), "utf8")
  } else {
    const shimPath = path.join(binDir, SHIM_NAME)
    await fs.writeFile(shimPath, unixShimContents(), "utf8")
    await fs.chmod(shimPath, 0o755)
  }

  return binDir
}

export async function buildDevecoCliShellEnv(): Promise<DevecoCliShellEnv | null> {
  const prepared = await prepareBundledDevecoCli()
  return prepared?.env ?? null
}

let shellEnvReady: Promise<DevecoCliShellEnv | null> | undefined

export function ensureDevecoCliShellEnv() {
  shellEnvReady ??= buildDevecoCliShellEnv()
  return shellEnvReady
}

export function __resetDevecoCliShellEnvCache() {
  shellEnvReady = undefined
}

function devecoCliShimPath(shimDir: string) {
  return path.join(shimDir, process.platform === "win32" ? `${SHIM_NAME}.cmd` : SHIM_NAME)
}

async function prepareBundledDevecoCli(): Promise<{ cli: string; env: DevecoCliShellEnv } | null> {
  const shimDir = await ensureDevecoCliShim()
  const entry = resolveBundledDevecoCliEntry()
  if (!shimDir || !entry) return null

  const pathValue = isolatedShellPath(process.env.PATH || process.env.Path, shimDir)
  const env: DevecoCliShellEnv = { PATH: pathValue }
  if (process.platform === "win32") {
    env.Path = pathValue
  }

  return { cli: devecoCliShimPath(shimDir), env }
}

export function buildDevecoCliBuildArgs(input: {
  clean?: boolean
  product?: string
  modules?: readonly string[]
  build_mode?: string
}): string[] {
  if (input.clean) return ["build", "clean"]

  const args = ["build"]
  const product = input.product?.trim()
  const buildMode = input.build_mode?.trim()
  const modules = (input.modules ?? []).map((item) => item.trim()).filter(Boolean)

  if (product) args.push("--product", product)
  if (modules.length > 0) args.push("--modules", ...modules)
  if (buildMode) args.push("--build-mode", buildMode)
  return args
}

export function buildDevecoCliRunArgs(input: {
  device: string
  ability?: string
  module?: string
  target?: string
}): string[] {
  const args = ["run", "--skip-build", "--device", input.device.trim()]
  const module = input.module?.trim()
  const target = input.target?.trim()
  const ability = input.ability?.trim()

  if (module || target) {
    args.push("--module", target ? `${module || "entry"}@${target}` : module!)
  }
  if (ability) args.push("--ability", ability)
  return args
}

export function buildDevecoCliStartAppCommands(input: {
  hvd?: string | null
  ability?: string | null
  module?: string | null
  target?: string | null
}): string[][] {
  const device = input.hvd?.trim()
  if (!device) {
    return [
      ["device", "list"],
      ["emulator", "list"],
    ]
  }

  return [["device", "list"]]
}

export function devecoCliListContainsTarget(output: string, target: string): boolean {
  const normalizedTarget = target.trim()
  if (!normalizedTarget) return false
  return output
    .split(/\r?\n/)
    .some((line) => line.includes(normalizedTarget))
}

export function buildDevecoCliLogArgs(input: {
  device?: string
  keyword?: string
  tail?: number
}): string[] {
  const args = ["log"]
  const device = input.device?.trim()
  const keyword = input.keyword?.trim()

  if (device) args.push("--device", device)
  if (keyword) args.push("--keyword", keyword)
  if (input.tail !== undefined) args.push("--tail", String(input.tail))
  return args
}

export async function runBundledDevecoCli(
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const prepared = await prepareBundledDevecoCli()
  if (!prepared) {
    throw new Error("Bundled deveco-cli is not available. Reinstall or rebuild deveco-code.")
  }

  const proc = Bun.spawn({
    cmd: [prepared.cli, ...args],
    cwd,
    env: { ...process.env, ...prepared.env },
    stdout: "pipe",
    stderr: "pipe",
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    proc.stdout ? Bun.readableStreamToText(proc.stdout) : Promise.resolve(""),
    proc.stderr ? Bun.readableStreamToText(proc.stderr) : Promise.resolve(""),
    proc.exited,
  ])

  return { stdout, stderr, exitCode }
}
