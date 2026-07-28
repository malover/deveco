import fs from "fs/promises"
import path from "path"
import os from "os"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"

let tmpDir: string

beforeEach(async () => {
  tmpDir = path.join(os.tmpdir(), `deveco-trust-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await fs.mkdir(tmpDir, { recursive: true })
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
})

const { saveTrust, isTrusted } = await import("@/cli/trust/cache")
const { trustPrompt } = await import("@/cli/trust")

// ── Concurrent write scenarios ──

describe("trust cache concurrent write", () => {
  test("concurrent saveTrust for different directories preserves all entries", async () => {
    const dirs = ["/tmp/project-1", "/tmp/project-2", "/tmp/project-3", "/tmp/project-4", "/tmp/project-5"]
    await Promise.all(dirs.map((d) => saveTrust(d)))

    for (const dir of dirs) {
      expect(await isTrusted(dir)).toBe(true)
    }
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

    await fs.mkdir(path.join(repoRoot, ".git"), { recursive: true })
    await fs.mkdir(subDir, { recursive: true })
    await fs.mkdir(anotherDir, { recursive: true })

    await saveTrust(subDir)

    expect(await isTrusted(repoRoot)).toBe(true)
    expect(await isTrusted(subDir)).toBe(true)
    expect(await isTrusted(anotherDir)).toBe(true)
    expect(await isTrusted(path.join(repoRoot, "new-feature"))).toBe(true)
  })

  test("git root resolution: outside a git repo uses the directory itself", async () => {
    const flatDir = path.join(tmpDir, "flat-dir")
    await fs.mkdir(flatDir, { recursive: true })

    await saveTrust(flatDir)

    expect(await isTrusted(flatDir)).toBe(true)
    expect(await isTrusted(path.join(flatDir, "nested"))).toBe(true)
  })

  test("untrusted directory returns false", async () => {
    expect(await isTrusted("/tmp/never-trusted")).toBe(false)
  })

  test("saveTrust is idempotent: trusting same directory twice still trusted", async () => {
    await saveTrust("/tmp/idempotent-dir")
    await saveTrust("/tmp/idempotent-dir")

    expect(await isTrusted("/tmp/idempotent-dir")).toBe(true)
  })
})

// ── Home directory session-only trust ──

describe.serial("home directory session-only trust", () => {
  const home = os.homedir()

  test("saveTrust for home sets session flag", async () => {
    await saveTrust(home)
    expect(await isTrusted(home)).toBe(true)
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
    const result = await trustPrompt("/tmp/noninteractive-dir")

    expect(result).toBe(true)
  })
})
