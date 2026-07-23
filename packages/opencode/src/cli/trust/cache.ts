import fs from "fs"
import path from "path"
import os from "os"
import { Global } from "@opencode-ai/core/global"
import { Flag } from "@opencode-ai/core/flag/flag"
import { Flock } from "@opencode-ai/core/util/flock"

/**
 * Trust directory cache — persists workspace trust decisions to
 * the XDG data directory so the trust prompt is only shown once per
 * directory (with parent-directory inheritance).
 *
 * Previously stored in the config directory; migrated to the data
 * directory on first read (see migrateFromConfigDir).
 */

// ── Session-only trust for home directory ──

// Home directory trust is NOT persisted to disk (mirrors Claude Code's
// setSessionTrustAccepted behavior) — prevents accidentally trusting
// ALL home subdirectories.
let sessionHomeTrusted = false

// ── Cache file path ──

function getCacheFilePath(): string {
  //   macOS / Linux: ~/.local/share/deveco/trusted-paths.json
  //   Windows:       %APPDATA%/deveco/trusted-paths.json
  //   XDG data dir (not config) — trust records are app-generated state, not user preferences.
  return path.join(Flag.DEVECO_CONFIG_DIR ?? Global.Path.data, "trusted-paths.json")
}

// ── Data shape (matches Claude Code's ~/.claude/.claude.json) ──

interface TrustCache {
  // Schema version for future format migrations.
  version?: number
  // key: normalized directory path (git root when available)
  // value matches Claude Code's project config shape
  projects: Record<string, { hasTrustDialogAccepted: boolean }>
}

// ── Path normalization ──

/**
 * Normalize a directory path for consistent JSON key lookup:
 * resolve symlinks/relative segments, then convert backslashes
 * to forward slashes (Windows-safe).
 */
function normalizePath(p: string): string {
  return path.resolve(p).replace(/\\/g, "/")
}

// ── Git root resolution (synchronous, for pre-bootstrap) ──

/**
 * Walk upward from directory looking for `.git`.
 * Returns the git root if found, undefined otherwise.
 * Used to resolve the trust key — trusting a subdirectory
 * of a git repo actually trusts the entire repo root.
 */
function findGitRootSync(directory: string): string | undefined {
  let current = path.resolve(directory)
  while (true) {
    if (fs.existsSync(path.join(current, ".git"))) return current
    const parent = path.resolve(current, "..")
    if (parent === current) return undefined // reached filesystem root
    current = parent
  }
}

/**
 * Resolve the trust key for a directory:
 * - Inside a git repo → use git root (trust the whole repo)
 * - Outside a git repo → use the directory itself
 */
function resolveTrustKey(directory: string): string {
  const gitRoot = findGitRootSync(directory)
  return normalizePath(gitRoot ?? directory)
}

// ── Read / write ──

async function readCache(): Promise<TrustCache> {
  const filePath = getCacheFilePath()
  try {
    const content = await fs.promises.readFile(filePath, "utf-8")
    return JSON.parse(content)
  } catch {
    return { projects: {} }
  }
}

async function flushToDisk(filePath: string): Promise<void> {
  const fd = await fs.promises.open(filePath, "r+")
  await fd.sync()
  await fd.close()
}

async function writeCache(cache: TrustCache): Promise<void> {
  const filePath = getCacheFilePath()
  const dir = path.dirname(filePath)
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`
  const content = JSON.stringify({ version: 1, ...cache }, null, 2)

  await fs.promises.mkdir(dir, { recursive: true })

  try {
    await fs.promises.writeFile(tmp, content, { encoding: "utf-8", mode: 0o600 })
    await flushToDisk(tmp)
    // rename is atomic on POSIX and NTFS (>= Windows 10), preventing readers
    // from ever seeing a partially-written file.
    await fs.promises.rename(tmp, filePath)
  } catch {
    await fs.promises.unlink(tmp).catch(() => {})
    // Fallback: non-atomic direct write (avoids total data loss when atomic path fails)
    await fs.promises.writeFile(filePath, content, { encoding: "utf-8", mode: 0o600 })
    await flushToDisk(filePath).catch(() => {})
  }
}

// ── Public API ──

/**
 * Check whether a directory has been trusted.
 *
 * Home directory uses session-only trust (not persisted).
 * For other directories: direct match first, then parent-directory
 * inheritance (if any ancestor was trusted, the directory is
 * considered trusted as well). Mirrors Claude Code's
 * computeTrustDialogAccepted traverse-up logic.
 */
export async function isTrusted(directory: string): Promise<boolean> {
  if (path.resolve(directory) === os.homedir()) {
    return sessionHomeTrusted
  }

  const cache = await Flock.withLock("trust-cache", async () => readCache())
  const trustKey = resolveTrustKey(directory)

  if (cache.projects[trustKey]?.hasTrustDialogAccepted) return true

  // Parent-directory inheritance: walk upward
  let current = trustKey
  while (true) {
    const parent = path.dirname(current)
    if (parent === current) break
    if (cache.projects[parent]?.hasTrustDialogAccepted) return true
    current = parent
  }

  return false
}

/**
 * Persist a trust decision for the given directory.
 *
 * Home directory trust is session-only (not written to disk).
 * For git repos, trust is recorded at the git root level.
 */
export async function saveTrust(directory: string): Promise<void> {
  // Home directory: session-only, never persist
  if (path.resolve(directory) === os.homedir()) {
    sessionHomeTrusted = true
    return
  }

  await Flock.withLock("trust-cache", async () => {
    const cache = await readCache()
    const trustKey = resolveTrustKey(directory)
    cache.projects[trustKey] = { hasTrustDialogAccepted: true }
    await writeCache(cache)
  })
}

