import { createHash } from "crypto"
import fs from "fs/promises"
import path from "path"

const gitConfig = [
  "--no-optional-locks",
  "-c",
  "core.autocrlf=false",
  "-c",
  "core.fsmonitor=false",
  "-c",
  "core.quotepath=false",
] as const

const excludedDirectories = new Set([
  ".git",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "vendor",
])

const excludedNames = new Set([
  "bun.lock",
  "cargo.lock",
  "composer.lock",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
])

const excludedExtensions = new Set([
  ".7z",
  ".bin",
  ".bmp",
  ".class",
  ".dll",
  ".dylib",
  ".exe",
  ".gif",
  ".gz",
  ".ico",
  ".jar",
  ".jpeg",
  ".jpg",
  ".o",
  ".pdf",
  ".png",
  ".so",
  ".tar",
  ".webp",
  ".woff",
  ".woff2",
  ".zip",
])

const codeExtensions = new Set([
  ".arkts",
  ".astro",
  ".bash",
  ".bat",
  ".c",
  ".cc",
  ".cjs",
  ".clj",
  ".cmake",
  ".cmd",
  ".cpp",
  ".cs",
  ".css",
  ".dart",
  ".erl",
  ".ets",
  ".ex",
  ".exs",
  ".fish",
  ".fs",
  ".fsx",
  ".go",
  ".gql",
  ".gradle",
  ".graphql",
  ".h",
  ".hcl",
  ".hpp",
  ".hrl",
  ".htm",
  ".html",
  ".ini",
  ".java",
  ".js",
  ".json",
  ".json5",
  ".jsx",
  ".kt",
  ".kts",
  ".less",
  ".lua",
  ".m",
  ".mjs",
  ".mm",
  ".php",
  ".properties",
  ".proto",
  ".ps1",
  ".py",
  ".r",
  ".rb",
  ".rs",
  ".sass",
  ".scala",
  ".scss",
  ".sh",
  ".sql",
  ".svelte",
  ".swift",
  ".tf",
  ".toml",
  ".ts",
  ".tsx",
  ".vue",
  ".xml",
  ".yaml",
  ".yml",
  ".zsh",
])

const codeFileNames = new Set(["cmakelists.txt", "dockerfile", "jenkinsfile", "makefile", "meson.build"])

const maxCodeFileBytes = 1024 * 1024

interface GitResult {
  exitCode: number
  stdout: Buffer
  stderr: Buffer
}

export interface GitCommitChange {
  status: "added" | "deleted" | "modified" | "renamed"
  path: string
  oldPath?: string
}

export interface GitReflogEntry {
  oldHead: string
  newHead: string
  message: string
}

export interface GitReflogRead {
  entries: GitReflogEntry[]
  nextOffset: number
}

function eligiblePath(file: string): boolean {
  const normalized = file.replaceAll("\\", "/")
  const parts = normalized.toLowerCase().split("/")
  if (parts.some((part) => excludedDirectories.has(part))) return false
  const name = parts.at(-1) ?? ""
  if (excludedNames.has(name) || name.endsWith(".lock")) return false
  const extension = path.extname(name)
  if (excludedExtensions.has(extension)) return false
  if (
    /(?:^|[._-])generated(?:[._-]|$)/.test(name) ||
    /\.(?:min\.(?:css|js)|designer\.cs|g\.dart|pb\.(?:cc|go|h))$/.test(name) ||
    name.endsWith("_pb2.py")
  )
    return false
  return codeFileNames.has(name) || codeExtensions.has(extension)
}

function textContent(buffer: Buffer): string | undefined {
  if (buffer.byteLength > maxCodeFileBytes || buffer.includes(0)) return undefined
  return buffer.toString("utf8")
}

function statusKind(code: string): GitCommitChange["status"] {
  if (code.startsWith("A")) return "added"
  if (code.startsWith("D")) return "deleted"
  return "modified"
}

export class GitRepository {
  private constructor(
    readonly root: string,
    readonly reflogPath: string,
  ) {}

  static async discover(directory: string): Promise<GitRepository | null> {
    const cwd = path.resolve(directory)
    const rootResult = await GitRepository.runAt(cwd, ["rev-parse", "--show-toplevel"])
    if (rootResult.exitCode !== 0) return null
    const root = rootResult.stdout.toString("utf8").trim()
    if (!root) return null
    const reflogResult = await GitRepository.runAt(root, [
      "rev-parse",
      "--path-format=absolute",
      "--git-path",
      "logs/HEAD",
    ])
    if (reflogResult.exitCode !== 0) return null
    const rawReflogPath = reflogResult.stdout.toString("utf8").trim()
    const reflogPath = path.isAbsolute(rawReflogPath) ? rawReflogPath : path.resolve(root, rawReflogPath)
    return new GitRepository(await fs.realpath(root).catch(() => root), reflogPath)
  }

  private static async runAt(cwd: string, args: string[]): Promise<GitResult> {
    try {
      const process = Bun.spawn(["git", ...gitConfig, ...args], {
        cwd,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      })
      const [exitCode, stdout, stderr] = await Promise.all([
        process.exited,
        new Response(process.stdout).arrayBuffer(),
        new Response(process.stderr).arrayBuffer(),
      ])
      return {
        exitCode,
        stdout: Buffer.from(stdout),
        stderr: Buffer.from(stderr),
      }
    } catch (error) {
      return {
        exitCode: 1,
        stdout: Buffer.alloc(0),
        stderr: Buffer.from(error instanceof Error ? error.message : String(error)),
      }
    }
  }

  private run(args: string[]): Promise<GitResult> {
    return GitRepository.runAt(this.root, args)
  }

  async head(): Promise<string | null> {
    const result = await this.run(["rev-parse", "--verify", "HEAD"])
    if (result.exitCode !== 0) return null
    return result.stdout.toString("utf8").trim() || null
  }

  async dirtyPaths(): Promise<string[]> {
    const result = await this.run([
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
      "--no-renames",
      "-z",
      "--",
      ".",
    ])
    if (result.exitCode !== 0) return []
    const candidates = result.stdout
      .toString("utf8")
      .split("\0")
      .filter(Boolean)
      .map((entry) => entry.slice(3))
      .filter(eligiblePath)
    const paths: string[] = []
    for (const file of candidates) {
      const absolute = path.resolve(this.root, file)
      const stat = await fs.lstat(absolute).catch(() => null)
      if (!stat) {
        paths.push(file)
        continue
      }
      if (stat.isSymbolicLink() || !stat.isFile() || stat.size > maxCodeFileBytes) continue
      const buffer = await fs.readFile(absolute).catch(() => null)
      if (buffer && textContent(buffer) !== undefined) paths.push(file)
    }
    return paths.sort()
  }

  async readWorktree(file: string): Promise<string> {
    if (!eligiblePath(file)) return ""
    const absolute = path.resolve(this.root, file)
    const relative = path.relative(this.root, absolute)
    if (relative.startsWith("..") || path.isAbsolute(relative)) return ""
    const stat = await fs.lstat(absolute).catch(() => null)
    if (!stat?.isFile() || stat.isSymbolicLink() || stat.size > maxCodeFileBytes) return ""
    const buffer = await fs.readFile(absolute).catch(() => null)
    if (!buffer) return ""
    return textContent(buffer) ?? ""
  }

  async readBlob(ref: string, file: string): Promise<string> {
    if (!eligiblePath(file)) return ""
    const tree = await this.run(["ls-tree", ref, "--", file])
    if (tree.exitCode !== 0 || tree.stdout.toString("utf8").startsWith("120000 ")) return ""
    const result = await this.run(["show", `${ref}:${file}`])
    if (result.exitCode !== 0) return ""
    return textContent(result.stdout) ?? ""
  }

  async commitParent(commit: string): Promise<string | null> {
    const result = await this.run(["rev-list", "--parents", "-n", "1", commit])
    if (result.exitCode !== 0) return null
    return result.stdout.toString("utf8").trim().split(/\s+/)[1] ?? null
  }

  async commitChanges(base: string, commit: string): Promise<GitCommitChange[]> {
    const result = await this.run([
      "diff",
      "--name-status",
      "--no-ext-diff",
      "--find-renames",
      "-z",
      base,
      commit,
      "--",
      ".",
    ])
    if (result.exitCode !== 0) return []
    const values = result.stdout.toString("utf8").split("\0").filter(Boolean)
    const changes: GitCommitChange[] = []
    for (let index = 0; index < values.length; ) {
      const code = values[index++] ?? ""
      const oldPath = values[index++] ?? ""
      if (code.startsWith("R") || code.startsWith("C")) {
        const nextPath = values[index++] ?? ""
        if (eligiblePath(oldPath) || eligiblePath(nextPath)) {
          changes.push({ status: "renamed", oldPath, path: nextPath })
        }
        continue
      }
      if (eligiblePath(oldPath)) changes.push({ status: statusKind(code), path: oldPath })
    }
    return changes
  }

  async patchId(base: string, commit: string): Promise<string> {
    const result = await this.run(["diff", "--no-ext-diff", "--no-color", base, commit, "--", "."])
    const stable = result.stdout
      .toString("utf8")
      .split(/\r?\n/)
      .filter((line) => !line.startsWith("index "))
      .map((line) => (line.startsWith("@@") ? line.replace(/^@@ .* @@/, "@@") : line))
      .join("\n")
    return createHash("sha1").update(stable).digest("hex")
  }

  async reflogSize(): Promise<number> {
    return (await fs.stat(this.reflogPath).catch(() => null))?.size ?? 0
  }

  async readReflog(offset: number): Promise<GitReflogRead> {
    const handle = await fs.open(this.reflogPath, "r").catch(() => null)
    if (!handle) return { entries: [], nextOffset: 0 }
    let start = 0
    let pending = Buffer.alloc(0)
    try {
      const stat = await handle.stat()
      start = offset >= 0 && offset <= stat.size ? offset : 0
      pending = Buffer.alloc(stat.size - start)
      await handle.read(pending, 0, pending.byteLength, start)
    } finally {
      await handle.close()
    }
    const lastNewline = pending.lastIndexOf(10)
    if (lastNewline < 0) return { entries: [], nextOffset: start }
    const complete = pending.subarray(0, lastNewline + 1).toString("utf8")
    const entries = complete.split("\n").flatMap((line) => {
      if (!line) return []
      const tab = line.indexOf("\t")
      const metadata = tab === -1 ? line : line.slice(0, tab)
      const message = tab === -1 ? "" : line.slice(tab + 1)
      const match = metadata.match(/^([0-9a-f]{40,64}) ([0-9a-f]{40,64}) /)
      if (!match?.[1] || !match[2]) return []
      return [{ oldHead: match[1], newHead: match[2], message }]
    })
    return { entries, nextOffset: start + lastNewline + 1 }
  }
}
