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
const maxGitDuration = 10_000
const maxPatchFiles = 256
const maxReflogReadBytes = 16 * 1024 * 1024
const maxTrackedCodeBytes = 16 * 1024 * 1024
const maxTrackedCodeFiles = 1024

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

export interface GitWorktreeFile {
  path: string
  content: string
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
      const subprocess = Bun.spawn(["git", ...gitConfig, ...args], {
        cwd,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      })
      const timeout = setTimeout(() => {
        try {
          subprocess.kill()
        } catch {
          // The process may have exited between the timer firing and kill.
        }
      }, maxGitDuration)
      timeout.unref?.()
      try {
        const [exitCode, stdout, stderr] = await Promise.all([
          subprocess.exited,
          new Response(subprocess.stdout).arrayBuffer(),
          new Response(subprocess.stderr).arrayBuffer(),
        ])
        return {
          exitCode,
          stdout: Buffer.from(stdout),
          stderr: Buffer.from(stderr),
        }
      } finally {
        clearTimeout(timeout)
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

  async dirtyFiles(): Promise<GitWorktreeFile[]> {
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
      .sort()
    const files: GitWorktreeFile[] = []
    let bytes = 0
    for (const file of candidates) {
      if (files.length >= maxTrackedCodeFiles) break
      const absolute = path.resolve(this.root, file)
      const stat = await fs.lstat(absolute).catch(() => null)
      if (!stat) {
        files.push({ path: file, content: "" })
        continue
      }
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxCodeFileBytes) continue
      if (bytes + stat.size > maxTrackedCodeBytes) continue
      const buffer = await fs.readFile(absolute).catch(() => null)
      if (!buffer) continue
      const content = textContent(buffer)
      if (content === undefined) continue
      bytes += buffer.byteLength
      files.push({ path: file, content })
    }
    return files
  }

  async dirtyPaths(): Promise<string[]> {
    return (await this.dirtyFiles()).map((file) => file.path)
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
    const tree = await this.run(["ls-tree", "-l", ref, "--", file])
    const metadata = tree.stdout.toString("utf8")
    const size = Number(metadata.match(/^\d+\s+\w+\s+\w+\s+(\d+|-)\t/)?.[1])
    if (tree.exitCode !== 0 || metadata.startsWith("120000 ") || !Number.isSafeInteger(size) || size > maxCodeFileBytes)
      return ""
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

  async patchId(base: string, commit: string, changes?: GitCommitChange[]): Promise<string> {
    const eligibleChanges = changes ?? (await this.commitChanges(base, commit))
    if (eligibleChanges.length > maxPatchFiles) {
      // Avoid buffering an arbitrarily large patch. Very large commits keep
      // commit-level de-duplication but intentionally skip cross-commit patch
      // de-duplication.
      return createHash("sha1").update(`commit:${commit}`).digest("hex")
    }
    const files = [
      ...new Set(eligibleChanges.flatMap((change) => [change.oldPath, change.path]).filter(Boolean) as string[]),
    ].sort()
    if (files.length === 0) return createHash("sha1").update("empty").digest("hex")
    // Raw diff metadata contains paths and before/after blob IDs, so equivalent
    // cherry-picks remain de-duplicated without buffering source-code patches.
    const result = await this.run([
      "diff",
      "--raw",
      "--no-abbrev",
      "--no-ext-diff",
      "--no-renames",
      "-z",
      base,
      commit,
      "--",
      ...files,
    ])
    if (result.exitCode !== 0) return createHash("sha1").update(`commit:${commit}`).digest("hex")
    return createHash("sha1").update(result.stdout).digest("hex")
  }

  async reflogSize(): Promise<number> {
    return (await fs.stat(this.reflogPath).catch(() => null))?.size ?? 0
  }

  async readReflog(offset: number): Promise<GitReflogRead> {
    const handle = await fs.open(this.reflogPath, "r").catch(() => null)
    if (!handle) return { entries: [], nextOffset: 0 }
    let start = 0
    let fileSize = 0
    let aligned = true
    let pending = Buffer.alloc(0)
    try {
      const stat = await handle.stat()
      fileSize = stat.size
      start = offset >= 0 && offset <= stat.size ? offset : 0
      if (start > 0) {
        const previous = Buffer.alloc(1)
        await handle.read(previous, 0, 1, start - 1)
        aligned = previous[0] === 10
      }
      pending = Buffer.alloc(Math.min(stat.size - start, maxReflogReadBytes))
      await handle.read(pending, 0, pending.byteLength, start)
    } finally {
      await handle.close()
    }
    if (!aligned) {
      const firstNewline = pending.indexOf(10)
      if (firstNewline < 0) return { entries: [], nextOffset: start + pending.byteLength }
      start += firstNewline + 1
      pending = pending.subarray(firstNewline + 1)
    }
    const lastNewline = pending.lastIndexOf(10)
    if (lastNewline < 0) {
      const readEnd = start + pending.byteLength
      return { entries: [], nextOffset: readEnd < fileSize ? readEnd : start }
    }
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
