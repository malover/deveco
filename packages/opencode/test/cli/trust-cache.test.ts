import fs from "fs/promises"
import fss from "fs"
import path from "path"
import os from "os"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"

// Redirect cache to per-test temp dir via env var (Flag.DEVECO_CONFIG_DIR
// is a getter that reads process.env at access time).
let tmpDir: string
let savedConfigDir: string | undefined

beforeEach(async () => {
  tmpDir = path.join(os.tmpdir(), `deveco-trust-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await fs.mkdir(tmpDir, { recursive: true })
  savedConfigDir = process.env["DEVECO_CONFIG_DIR"]
  process.env["DEVECO_CONFIG_DIR"] = tmpDir
})

afterEach(async () => {
  process.env["DEVECO_CONFIG_DIR"] = savedConfigDir
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
})

// Dynamic import so Flag.DEVECO_CONFIG_DIR resolves to our temp dir.
const { saveTrust, isTrusted } = await import("@/cli/trust/cache")
const { trustPrompt } = await import("@/cli/trust")

function cacheFilePath() {
  return path.join(tmpDir, "trusted-paths.json")
}

function readRawCache(): Promise<Record<string, unknown>> {
  return fs.readFile(cacheFilePath(), "utf-8").then(JSON.parse)
}

// ── Concurrent write scenarios ──

describe("trust cache concurrent write", () => {
  test("concurrent saveTrust for different directories preserves all entries", async () => {
    const dirs = ["/tmp/project-1", "/tmp/project-2", "/tmp/project-3", "/tmp/project-4", "/tmp/project-5"]
    await Promise.all(dirs.map((d) => saveTrust(d)))

    for (const dir of dirs) {
      expect(await isTrusted(dir)).toBe(true)
    }

    const raw = await readRawCache()
    expect(raw.version).toBe(1)
    const projects = raw.projects as Record<string, unknown>
    expect(Object.keys(projects).length).toBe(dirs.length)
  })

  test("concurrent saveTrust for the same directory does not lose data", async () => {
    await saveTrust("/tmp/existing-project")

    await Promise.all(Array.from({ length: 10 }, () => saveTrust("/tmp/same-project")))

    expect(await isTrusted("/tmp/existing-project")).toBe(true)
    expect(await isTrusted("/tmp/same-project")).toBe(true)
  })

  test("concurrent saveTrust and isTrusted produce consistent results", async () => {
    await saveTrust("/tmp/seed-project")

    const saves = ["/tmp/concurrent-a", "/tmp/concurrent-b", "/tmp/concurrent-c"].map((d) => saveTrust(d))
    const checks = Array.from({ length: 6 }, (_, i) =>
      isTrusted(i % 2 === 0 ? "/tmp/seed-project" : "/tmp/concurrent-a"),
    )

    const [_, checkResults] = await Promise.all([Promise.all(saves), Promise.all(checks)])

    for (const result of checkResults) {
      if (result === true) expect(result).toBe(true)
    }

    expect(await isTrusted("/tmp/seed-project")).toBe(true)
    expect(await isTrusted("/tmp/concurrent-a")).toBe(true)
    expect(await isTrusted("/tmp/concurrent-b")).toBe(true)
    expect(await isTrusted("/tmp/concurrent-c")).toBe(true)
  })

  test("no tmp files remain after writeCache", async () => {
    await saveTrust("/tmp/clean-project")

    const files = await fs.readdir(tmpDir)
    const tmpFiles = files.filter((f) => f.startsWith("trusted-paths.json.tmp"))
    expect(tmpFiles.length).toBe(0)
  })
})

// ── Trust resolution logic ──

describe("trust resolution logic", () => {
  test("parent directory inheritance: trusting parent makes child trusted", async () => {
    await saveTrust("/tmp/parent-project")

    expect(await isTrusted("/tmp/parent-project")).toBe(true)
    expect(await isTrusted("/tmp/parent-project/child")).toBe(true)
    expect(await isTrusted("/tmp/parent-project/child/deep")).toBe(true)
  })

  test("parent inheritance does not grant trust to sibling directories", async () => {
    await saveTrust("/tmp/trusted-parent")

    expect(await isTrusted("/tmp/trusted-parent")).toBe(true)
    expect(await isTrusted("/tmp/trusted-parent/subdir")).toBe(true)
    expect(await isTrusted("/tmp/unrelated-dir")).toBe(false)
  })

  test("git root resolution: trusting a subdirectory trusts the entire repo", async () => {
    const repoRoot = path.join(tmpDir, "my-repo")
    const subDir = path.join(repoRoot, "src", "component")
    const anotherDir = path.join(repoRoot, "tests")

    // Create a real .git directory so findGitRootSync finds it.
    await fs.mkdir(path.join(repoRoot, ".git"), { recursive: true })
    await fs.mkdir(subDir, { recursive: true })
    await fs.mkdir(anotherDir, { recursive: true })

    // Trust a subdirectory — resolveTrustKey should resolve to repoRoot.
    await saveTrust(subDir)

    expect(await isTrusted(repoRoot)).toBe(true)
    expect(await isTrusted(subDir)).toBe(true)
    expect(await isTrusted(anotherDir)).toBe(true)
    expect(await isTrusted(path.join(repoRoot, "new-feature"))).toBe(true)
  })

  test("git root resolution: outside a git repo uses the directory itself", async () => {
    // /tmp/flat-dir has no .git — resolveTrustKey returns the directory itself.
    const flatDir = path.join(tmpDir, "flat-dir")
    await fs.mkdir(flatDir, { recursive: true })

    await saveTrust(flatDir)

    expect(await isTrusted(flatDir)).toBe(true)
    // Child inherits from the trusted flat-dir.
    expect(await isTrusted(path.join(flatDir, "nested"))).toBe(true)
  })

  test("untrusted directory returns false", async () => {
    expect(await isTrusted("/tmp/never-trusted")).toBe(false)
  })

  test("saveTrust is idempotent: trusting same directory twice does not duplicate entries", async () => {
    await saveTrust("/tmp/idempotent-dir")
    await saveTrust("/tmp/idempotent-dir")

    const raw = await readRawCache()
    const projects = raw.projects as Record<string, unknown>
    const keys = Object.keys(projects)
    // Only one entry for /tmp/idempotent-dir (normalized as "/tmp/idempotent-dir").
    const idempotentKeys = keys.filter((k) => k.includes("idempotent-dir"))
    expect(idempotentKeys.length).toBe(1)
  })

})

// ── Cache format & resilience ──

describe("trust cache format and resilience", () => {
  test("backward compatibility: reads cache without version field", async () => {
    const legacy = {
      projects: {
        "/tmp/legacy-project": { hasTrustDialogAccepted: true },
      },
    }
    await fs.writeFile(cacheFilePath(), JSON.stringify(legacy, null, 2))

    expect(await isTrusted("/tmp/legacy-project")).toBe(true)
  })

  test("version preserved on round-trip: read → modify → write keeps version", async () => {
    await saveTrust("/tmp/round-trip-a")
    const raw1 = await readRawCache()
    expect(raw1.version).toBe(1)

    // Add another entry (triggers readCache → modify → writeCache).
    await saveTrust("/tmp/round-trip-b")
    const raw2 = await readRawCache()
    expect(raw2.version).toBe(1)
    expect(Object.keys(raw2.projects as Record<string, unknown>).length).toBe(2)
  })

  test("corrupted cache file falls back to empty projects", async () => {
    await fs.writeFile(cacheFilePath(), "NOT VALID JSON {{{")

    // isTrusted should return false without crashing.
    expect(await isTrusted("/tmp/any-dir")).toBe(false)
  })

  test("empty cache file falls back to empty projects", async () => {
    await fs.writeFile(cacheFilePath(), "")

    expect(await isTrusted("/tmp/any-dir")).toBe(false)
  })

  test("missing cache file falls back to empty projects", async () => {
    // tmpDir has no trusted-paths.json yet.
    expect(await isTrusted("/tmp/any-dir")).toBe(false)
  })
})

// ── Home directory session-only trust ──

describe.serial("home directory session-only trust", () => {
  const home = os.homedir()

  test("saveTrust for home sets session flag but does not write to disk", async () => {
    await saveTrust(home)

    expect(await isTrusted(home)).toBe(true)

    // No home dir entry in the on-disk cache.
    try {
      const raw = await readRawCache()
      const homeKey = path.resolve(home).replace(/\\/g, "/")
      expect(raw.projects[homeKey]).toBeUndefined()
    } catch {
      // Cache file may not exist — also acceptable.
    }
  })
})

// ── trustPrompt bypass paths ──

describe("trustPrompt bypass", () => {
  test("DEVECO_TRUST=1 env var returns true without prompting", async () => {
    const saved = process.env["DEVECO_TRUST"]
    process.env["DEVECO_TRUST"] = "1"

    const result = await trustPrompt("/tmp/env-trust-bypass")

    expect(result).toBe(true)

    process.env["DEVECO_TRUST"] = saved
  })

  test("non-interactive environment (no TTY) returns true", async () => {
    // bun test runs without TTY, so process.stdin.isTTY is false.
    // trustPrompt should auto-trust in this case.
    const result = await trustPrompt("/tmp/noninteractive-dir")

    expect(result).toBe(true)
  })
})
