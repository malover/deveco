import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { tmpdir } from "../../fixture/fixture"
import { Filesystem } from "@/util/filesystem"
import { resolveThreadDirectory, TuiThreadCommand } from "@/cli/cmd/tui"

describe("resolveThreadDirectory", () => {
  describe("no project argument", () => {
    test("should return resolved cwd when project is undefined", async () => {
      await using tmp = await tmpdir()
      const result = resolveThreadDirectory(undefined, undefined, tmp.path)
      expect(result).toBe(Filesystem.resolve(tmp.path))
    })

    test("should return resolved cwd when project is undefined and envPWD differs from cwd", async () => {
      await using tmp = await tmpdir({ git: true })
      const parentDir = path.dirname(tmp.path)
      const result = resolveThreadDirectory(undefined, parentDir, tmp.path)
      expect(result).toBe(Filesystem.resolve(tmp.path))
    })
  })

  describe("absolute project path", () => {
    test("should return resolved absolute project path directly", async () => {
      await using tmp = await tmpdir({ git: true })
      const projectDir = path.join(tmp.path, "subproject")
      await fs.mkdir(projectDir)
      const result = resolveThreadDirectory(projectDir, tmp.path, tmp.path)
      expect(result).toBe(Filesystem.resolve(projectDir))
    })

    test("should ignore envPWD when project is absolute", async () => {
      await using tmp1 = await tmpdir({ git: true })
      await using tmp2 = await tmpdir({ git: true })
      const result = resolveThreadDirectory(tmp2.path, tmp1.path, tmp1.path)
      expect(result).toBe(Filesystem.resolve(tmp2.path))
    })
  })

  describe("relative project path", () => {
    test("should resolve relative project from envPWD", async () => {
      await using tmp = await tmpdir({ git: true })
      const subdir = "my-project"
      await fs.mkdir(path.join(tmp.path, subdir))
      const result = resolveThreadDirectory(subdir, tmp.path, tmp.path)
      expect(result).toBe(Filesystem.resolve(path.join(tmp.path, subdir)))
    })

    test("should resolve relative project from cwd when envPWD is undefined", async () => {
      await using tmp = await tmpdir({ git: true })
      const subdir = "workspace"
      await fs.mkdir(path.join(tmp.path, subdir))
      const result = resolveThreadDirectory(subdir, undefined, tmp.path)
      expect(result).toBe(Filesystem.resolve(path.join(tmp.path, subdir)))
    })

    test("should resolve dot as cwd-equivalent relative path", async () => {
      await using tmp = await tmpdir({ git: true })
      const result = resolveThreadDirectory(".", tmp.path, tmp.path)
      expect(result).toBe(Filesystem.resolve(path.join(tmp.path, ".")))
    })

    test("should resolve relative project from envPWD when envPWD differs from cwd", async () => {
      await using tmp = await tmpdir({ git: true })
      const subdir = "project-b"
      await fs.mkdir(path.join(tmp.path, subdir))
      const envPWD = tmp.path
      const cwd = path.join(tmp.path, subdir)
      const nested = "nested-dir"
      await fs.mkdir(path.join(tmp.path, subdir, nested))
      const result = resolveThreadDirectory(nested, envPWD, cwd)
      expect(result).toBe(Filesystem.resolve(path.join(envPWD, nested)))
    })

    test("should treat empty string project as no project and return cwd", async () => {
      await using tmp = await tmpdir({ git: true })
      const result = resolveThreadDirectory("", tmp.path, tmp.path)
      expect(result).toBe(Filesystem.resolve(tmp.path))
    })

    test("should resolve relative project containing .. segments", async () => {
      await using tmp = await tmpdir({ git: true })
      const subdir = "sub"
      await fs.mkdir(path.join(tmp.path, subdir))
      const result = resolveThreadDirectory("sub/../sub", tmp.path, tmp.path)
      expect(result).toBe(Filesystem.resolve(path.join(tmp.path, subdir)))
    })
  })

  describe("symlink resolution", () => {
    async function withSymlink(project?: string) {
      await using tmp = await tmpdir({ git: true })
      const link = path.join(path.dirname(tmp.path), path.basename(tmp.path) + "-link")
      const type = process.platform === "win32" ? "junction" : "dir"
      try {
        await fs.symlink(tmp.path, link, type)
        const result = resolveThreadDirectory(project, link, tmp.path)
        expect(result).toBe(Filesystem.resolve(tmp.path))
      } finally {
        await fs.rm(link, { recursive: true, force: true }).catch(() => undefined)
      }
    }

    test("should resolve to canonical path when PWD points at a symlink", async () => {
      await withSymlink()
    })

    test("should resolve to canonical path when relative project is used with symlinked PWD", async () => {
      await withSymlink(".")
    })
  })
})

describe("TuiThreadCommand", () => {
  test("should define command as $0 with optional project positional", () => {
    expect(TuiThreadCommand.command).toBe("$0 [project]")
  })

  test("should have describe text", () => {
    expect(TuiThreadCommand.describe).toBe("start deveco tui")
  })

  test("should define expected positional and option keys in builder", () => {
    const keys: string[] = []
    const yargs = {
      positional: (name: string, _opts: unknown) => { keys.push(name); return yargs },
      option: (name: string, _opts: unknown) => { keys.push(name); return yargs },
      options: (_opts: unknown) => { keys.push("network"); return yargs },
    }
    const builder = TuiThreadCommand.builder
    if (typeof builder === "function") {
      builder(yargs as Parameters<typeof builder>[0])
    }
    expect(keys).toEqual(["network", "project", "model", "continue", "session", "fork", "prompt", "agent"])
  })
})
