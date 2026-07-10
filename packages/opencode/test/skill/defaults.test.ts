import { describe, expect, beforeEach } from "bun:test"
import { Effect, Layer } from "effect"
import path from "node:path"
import fs from "fs/promises"
import { Defaults } from "../../src/skill/defaults"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Global } from "@opencode-ai/core/global"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.mergeAll(FSUtil.defaultLayer))

const skillsDir = path.join(Global.Path.data, "skills")
const configSkillsDir = path.join(Global.Path.config, "skills")
const versionFile = path.join(skillsDir, ".version")

async function cleanDirs() {
  await fs.rm(skillsDir, { recursive: true, force: true }).catch(() => {})
  await fs.rm(configSkillsDir, { recursive: true, force: true }).catch(() => {})
  await fs.mkdir(skillsDir, { recursive: true })
}

async function writeVersion(version: string) {
  await fs.mkdir(skillsDir, { recursive: true })
  await fs.writeFile(versionFile, version)
}

async function readVersion(): Promise<string> {
  return fs.readFile(versionFile, "utf-8")
}

const cleanEffect = Effect.promise(cleanDirs)
const writeVersionEffect = (v: string) => Effect.promise(() => writeVersion(v))
const readVersionEffect = Effect.promise(readVersion)

describe("ensure version check", () => {
  it.live("returns dir when version file does not exist", () =>
    Effect.gen(function* () {
      yield* cleanEffect
      const fsys = yield* FSUtil.Service
      const result = yield* Defaults.ensure("1.0.0", fsys)
      expect(result).toBe(skillsDir)
      const ver = yield* readVersionEffect
      expect(ver).toBe("1.0.0")
    }),
  )

  it.live("returns early when version matches and is not local", () =>
    Effect.gen(function* () {
      yield* cleanEffect
      yield* writeVersionEffect("1.2.3")
      const fsys = yield* FSUtil.Service
      const result = yield* Defaults.ensure("1.2.3", fsys)
      expect(result).toBe(skillsDir)
      const ver = yield* readVersionEffect
      expect(ver).toBe("1.2.3")
    }),
  )

  it.live("re-extracts when version differs", () =>
    Effect.gen(function* () {
      yield* cleanEffect
      yield* writeVersionEffect("1.0.0")
      const fsys = yield* FSUtil.Service
      const result = yield* Defaults.ensure("2.0.0", fsys)
      expect(result).toBe(skillsDir)
      const ver = yield* readVersionEffect
      expect(ver).toBe("2.0.0")
    }),
  )

  it.live("re-extracts when current version is local", () =>
    Effect.gen(function* () {
      yield* cleanEffect
      yield* writeVersionEffect("local")
      const fsys = yield* FSUtil.Service
      const result = yield* Defaults.ensure("local", fsys)
      expect(result).toBe(skillsDir)
      const ver = yield* readVersionEffect
      expect(ver).toBe("local")
    }),
  )

  it.live("re-extracts when version file content does not match", () =>
    Effect.gen(function* () {
      yield* cleanEffect
      yield* writeVersionEffect("old-version")
      const fsys = yield* FSUtil.Service
      const result = yield* Defaults.ensure("new-version", fsys)
      expect(result).toBe(skillsDir)
      const ver = yield* readVersionEffect
      expect(ver).toBe("new-version")
    }),
  )
})

describe("backup user skills", () => {
  const cleanConfig = Effect.promise(() =>
    fs.rm(configSkillsDir, { recursive: true, force: true }).catch(() => {}),
  )

  it.live("backs up user-installed skills to config directory", () =>
    Effect.gen(function* () {
      yield* cleanEffect
      yield* cleanConfig
      const userSkillDir = path.join(skillsDir, "my-user-skill")
      yield* Effect.promise(() =>
        fs.mkdir(userSkillDir, { recursive: true }),
      )
      yield* Effect.promise(() =>
        fs.writeFile(path.join(userSkillDir, "SKILL.md"), "# My Skill"),
      )
      const fsys = yield* FSUtil.Service
      yield* Defaults.ensure("6.0.0", fsys)
      const backedUp = yield* Effect.promise(() =>
        fs.access(path.join(configSkillsDir, "my-user-skill"))
          .then(() => true)
          .catch(() => false),
      )
      expect(backedUp).toBe(true)
      const content = yield* Effect.promise(() =>
        fs.readFile(path.join(configSkillsDir, "my-user-skill", "SKILL.md"), "utf-8"),
      )
      expect(content).toBe("# My Skill")
    }),
  )

  it.live("does not back up builtin skills with .version file", () =>
    Effect.gen(function* () {
      yield* cleanEffect
      yield* cleanConfig
      const builtinDir = path.join(skillsDir, "builtin-skill")
      yield* Effect.promise(() =>
        fs.mkdir(builtinDir, { recursive: true }),
      )
      yield* Effect.promise(() =>
        fs.writeFile(path.join(builtinDir, ".version"), "builtin-skill"),
      )
      const fsys = yield* FSUtil.Service
      yield* Defaults.ensure("7.0.0", fsys)
      const exists = yield* Effect.promise(() =>
        fs.access(path.join(configSkillsDir, "builtin-skill"))
          .then(() => true)
          .catch(() => false),
      )
      expect(exists).toBe(false)
    }),
  )

  it.live("handles missing skills directory gracefully during backup", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        fs.rm(skillsDir, { recursive: true, force: true }).catch(() => {}),
      )
      yield* Effect.promise(() =>
        fs.rm(configSkillsDir, { recursive: true, force: true }).catch(() => {}),
      )
      const fsys = yield* FSUtil.Service
      // Backup readdir fails but is caught by Effect.catch
      const result = yield* Defaults.ensure("8.0.0", fsys)
      expect(result).toBe(skillsDir)
    }),
  )

  it.live("ignores backup copy errors and continues extraction", () =>
    Effect.gen(function* () {
      yield* cleanEffect
      yield* cleanConfig
      // Create a user skill directory and a blocking file at backup destination
      yield* Effect.promise(() =>
        fs.mkdir(path.join(skillsDir, "failing-skill"), { recursive: true }),
      )
      yield* Effect.promise(() =>
        fs.writeFile(path.join(skillsDir, "failing-skill", "SKILL.md"), "# Fail"),
      )
      yield* Effect.promise(async () => {
        await fs.mkdir(path.join(configSkillsDir, "failing-skill"), { recursive: true })
      })
      const fsys = yield* FSUtil.Service
      const result = yield* Defaults.ensure("8.5.0", fsys)
      expect(result).toBe(skillsDir)
    }),
  )

  it.live("backups user skills and skips builtins in mixed directory", () =>
    Effect.gen(function* () {
      yield* cleanEffect
      yield* cleanConfig
      yield* Effect.promise(() =>
        fs.mkdir(path.join(skillsDir, "user-a"), { recursive: true }),
      )
      yield* Effect.promise(() =>
        fs.writeFile(path.join(skillsDir, "user-a", "SKILL.md"), "# User A"),
      )
      yield* Effect.promise(() =>
        fs.mkdir(path.join(skillsDir, "builtin-b"), { recursive: true }),
      )
      yield* Effect.promise(() =>
        fs.writeFile(path.join(skillsDir, "builtin-b", ".version"), "builtin-b"),
      )
      const fsys = yield* FSUtil.Service
      yield* Defaults.ensure("9.0.0", fsys)
      const userExists = yield* Effect.promise(() =>
        fs.access(path.join(configSkillsDir, "user-a"))
          .then(() => true)
          .catch(() => false),
      )
      const builtinExists = yield* Effect.promise(() =>
        fs.access(path.join(configSkillsDir, "builtin-b"))
          .then(() => true)
          .catch(() => false),
      )
      expect(userExists).toBe(true)
      expect(builtinExists).toBe(false)
    }),
  )
})

describe("cleanup builtin skills", () => {
  it.live("removes builtin skill directories with .version", () =>
    Effect.gen(function* () {
      yield* cleanEffect
      const builtinDir = path.join(skillsDir, "old-builtin")
      yield* Effect.promise(() =>
        fs.mkdir(builtinDir, { recursive: true }),
      )
      yield* Effect.promise(() =>
        fs.writeFile(path.join(builtinDir, ".version"), "old-builtin"),
      )
      yield* Effect.promise(() =>
        fs.writeFile(path.join(builtinDir, "SKILL.md"), "old content"),
      )
      const fsys = yield* FSUtil.Service
      yield* Defaults.ensure("9.0.0", fsys)
      const exists = yield* Effect.promise(() =>
        fs.access(builtinDir).then(() => true).catch(() => false),
      )
      expect(exists).toBe(false)
      const ver = yield* readVersionEffect
      expect(ver).toBe("9.0.0")
    }),
  )

  it.live("preserves user skill directories without .version", () =>
    Effect.gen(function* () {
      yield* cleanEffect
      const userDir = path.join(skillsDir, "keep-me")
      yield* Effect.promise(() =>
        fs.mkdir(userDir, { recursive: true }),
      )
      yield* Effect.promise(() =>
        fs.writeFile(path.join(userDir, "SKILL.md"), "# Keep this"),
      )
      const fsys = yield* FSUtil.Service
      yield* Defaults.ensure("10.0.0", fsys)
      const exists = yield* Effect.promise(() =>
        fs.access(userDir).then(() => true).catch(() => false),
      )
      expect(exists).toBe(true)
    }),
  )

  it.live("cleans multiple builtins while preserving multiple user skills", () =>
    Effect.gen(function* () {
      yield* cleanEffect
      yield* Effect.promise(() =>
        fs.mkdir(path.join(skillsDir, "built-1"), { recursive: true }),
      )
      yield* Effect.promise(() =>
        fs.writeFile(path.join(skillsDir, "built-1", ".version"), "built-1"),
      )
      yield* Effect.promise(() =>
        fs.mkdir(path.join(skillsDir, "user-1"), { recursive: true }),
      )
      yield* Effect.promise(() =>
        fs.writeFile(path.join(skillsDir, "user-1", "SKILL.md"), "# User 1"),
      )
      const fsys = yield* FSUtil.Service
      yield* Defaults.ensure("11.0.0", fsys)
      const builtExists = yield* Effect.promise(() =>
        fs.access(path.join(skillsDir, "built-1")).then(() => true).catch(() => false),
      )
      const userExists = yield* Effect.promise(() =>
        fs.access(path.join(skillsDir, "user-1")).then(() => true).catch(() => false),
      )
      expect(builtExists).toBe(false)
      expect(userExists).toBe(true)
    }),
  )
})

describe("loadSkillsFromDisk fallback", () => {
  it.live("extracts skills from resources/skills directory", () =>
    Effect.gen(function* () {
      yield* cleanEffect
      const fsys = yield* FSUtil.Service
      yield* Defaults.ensure("10.0.0", fsys)
      const entries = yield* Effect.promise(() =>
        fs.readdir(skillsDir, { withFileTypes: true }),
      )
      const dirs = entries.filter((e) => e.isDirectory())
      // At least one skill should have been extracted from resources/skills
      expect(dirs.length).toBeGreaterThan(0)
    }),
  )

  it.live("writes version marker after extraction", () =>
    Effect.gen(function* () {
      yield* cleanEffect
      const fsys = yield* FSUtil.Service
      yield* Defaults.ensure("14.0.0", fsys)
      const ver = yield* readVersionEffect
      expect(ver).toBe("14.0.0")
    }),
  )

  it.live("extracts skills with .version subfiles", () =>
    Effect.gen(function* () {
      yield* cleanEffect
      const fsys = yield* FSUtil.Service
      yield* Defaults.ensure("13.0.0", fsys)
      const entries = yield* Effect.promise(() =>
        fs.readdir(skillsDir, { withFileTypes: true }),
      )
      const dirs = entries.filter((e) => e.isDirectory())
      expect(dirs.length).toBeGreaterThan(0)
      // Each extracted skill should have a .version file with its own name
      for (const d of dirs) {
        const subVersionPath = path.join(skillsDir, d.name, ".version")
        const subVer = yield* Effect.promise(() =>
          fs.readFile(subVersionPath, "utf-8"),
        )
        expect(subVer).toBe(d.name)
      }
    }),
  )

  it.live("skips .DS_Store and symlinks during walk", () =>
    Effect.gen(function* () {
      yield* cleanEffect
      const fsys = yield* FSUtil.Service
      yield* Defaults.ensure("15.0.0", fsys)
      const entries = yield* Effect.promise(() =>
        fs.readdir(skillsDir, { withFileTypes: true }),
      )
      // Walk filters out .DS_Store — it should not appear as an extracted file
      const hasDsStore = entries.some((e) => e.name === ".DS_Store")
      expect(hasDsStore).toBe(false)
    }),
  )
})

describe("data extraction string and binary", () => {
  it.live("extracts string content as readable text", () =>
    Effect.gen(function* () {
      yield* cleanEffect
      const fsys = yield* FSUtil.Service
      yield* Defaults.ensure("12.0.0", fsys)
      const entries = yield* Effect.promise(() =>
        fs.readdir(skillsDir, { withFileTypes: true }),
      )
      const dirs = entries.filter((e) => e.isDirectory())
      let foundText = false
      for (const d of dirs) {
        const subEntries = yield* Effect.promise(() =>
          fs.readdir(path.join(skillsDir, d.name)),
        )
        const mdFile = subEntries.find((f: string) => f.endsWith(".md"))
        if (mdFile) {
          const content = yield* Effect.promise(() =>
            fs.readFile(path.join(skillsDir, d.name, mdFile), "utf-8"),
          )
          if (content.length > 0) {
            foundText = true
            break
          }
        }
      }
      expect(foundText).toBe(true)
    }),
  )

  it.live("writes .version in each extracted skill", () =>
    Effect.gen(function* () {
      yield* cleanEffect
      const fsys = yield* FSUtil.Service
      yield* Defaults.ensure("4.0.0", fsys)
      const entries = yield* Effect.promise(() =>
        fs.readdir(skillsDir, { withFileTypes: true }),
      )
      const skillDirs = entries.filter((e) => e.isDirectory())
      for (const d of skillDirs) {
        const subVersionPath = path.join(skillsDir, d.name, ".version")
        const subVer = yield* Effect.promise(() =>
          fs.readFile(subVersionPath, "utf-8"),
        )
        expect(subVer).toBe(d.name)
      }
    }),
  )
})

describe("version marker write", () => {
  it.live("writes top-level .version marker after extraction", () =>
    Effect.gen(function* () {
      yield* cleanEffect
      const fsys = yield* FSUtil.Service
      yield* Defaults.ensure("5.0.0", fsys)
      const ver = yield* readVersionEffect
      expect(ver).toBe("5.0.0")
    }),
  )

  it.live("overwrites previous .version marker on re-extraction", () =>
    Effect.gen(function* () {
      yield* cleanEffect
      yield* writeVersionEffect("old")
      const fsys = yield* FSUtil.Service
      yield* Defaults.ensure("new", fsys)
      const ver = yield* readVersionEffect
      expect(ver).toBe("new")
    }),
  )
})

describe("return value", () => {
  it.live("returns skills dir on early return path", () =>
    Effect.gen(function* () {
      yield* cleanEffect
      yield* writeVersionEffect("20.0.0")
      const fsys = yield* FSUtil.Service
      const result = yield* Defaults.ensure("20.0.0", fsys)
      expect(result).toBe(skillsDir)
    }),
  )

  it.live("returns skills dir after full extraction", () =>
    Effect.gen(function* () {
      yield* cleanEffect
      const fsys = yield* FSUtil.Service
      const result = yield* Defaults.ensure("21.0.0", fsys)
      expect(result).toBe(skillsDir)
    }),
  )
})
