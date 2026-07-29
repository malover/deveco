import { $ } from "bun"
import { expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { GitRepository } from "@/plugin/analytics/code-attribution/git-repository"
import { tmpdir } from "../../../fixture/fixture"

test("discovers the repository and reads eligible dirty text files", async () => {
  await using tmp = await tmpdir({ git: true })
  const nested = path.join(tmp.path, "src", "nested")
  await fs.mkdir(nested, { recursive: true })
  const repository = await GitRepository.discover(nested)
  expect(repository?.root).toBe(tmp.path)

  await fs.writeFile(path.join(tmp.path, "src", "main.ts"), "export const value = 1\n")
  await fs.writeFile(path.join(tmp.path, "src", "asset.bin"), Buffer.from([0, 1, 2]))
  await fs.writeFile(path.join(tmp.path, "README.md"), "# Not code\n")
  await fs.writeFile(path.join(tmp.path, "src", "api.generated.ts"), "export const generated = true\n")

  expect(await repository?.dirtyPaths()).toEqual(["src/main.ts"])
  expect(await repository?.readWorktree("src/main.ts")).toBe("export const value = 1\n")
})

test("never follows worktree symlinks outside the repository", async () => {
  await using tmp = await tmpdir({ git: true })
  await using outside = await tmpdir()
  const secret = path.join(outside.path, "secret.ts")
  await fs.writeFile(secret, "export const secret = 'private'\n")
  await fs.symlink(secret, path.join(tmp.path, "linked.ts"))
  const repository = await GitRepository.discover(tmp.path)

  expect(await repository?.dirtyPaths()).toEqual([])
  expect(await repository?.readWorktree("linked.ts")).toBe("")
})

test("returns rename-aware commit changes and a stable patch id", async () => {
  await using tmp = await tmpdir({ git: true })
  await fs.writeFile(path.join(tmp.path, "before.ts"), "export const value = 1\n")
  await $`git add before.ts`.cwd(tmp.path).quiet()
  await $`git commit -m before`.cwd(tmp.path).quiet()
  const parent = (await $`git rev-parse HEAD`.cwd(tmp.path).text()).trim()

  await $`git mv before.ts after.ts`.cwd(tmp.path).quiet()
  await fs.appendFile(path.join(tmp.path, "after.ts"), "export const next = 2\n")
  await $`git add after.ts`.cwd(tmp.path).quiet()
  await $`git commit -m after`.cwd(tmp.path).quiet()
  const commit = (await $`git rev-parse HEAD`.cwd(tmp.path).text()).trim()
  const repository = await GitRepository.discover(tmp.path)

  expect(await repository?.commitChanges(parent, commit)).toEqual([
    { status: "renamed", oldPath: "before.ts", path: "after.ts" },
  ])
  expect(await repository?.patchId(parent, commit)).toMatch(/^[0-9a-f]{40}$/)
})

test("reads only reflog entries appended after a byte cursor", async () => {
  await using tmp = await tmpdir({ git: true })
  const repository = await GitRepository.discover(tmp.path)
  const offset = await repository!.reflogSize()

  await fs.writeFile(path.join(tmp.path, "main.ts"), "export const value = 1\n")
  await $`git add main.ts`.cwd(tmp.path).quiet()
  await $`git commit -m change`.cwd(tmp.path).quiet()

  const result = await repository!.readReflog(offset)
  expect(result.nextOffset).toBeGreaterThan(offset)
  expect(result.entries).toHaveLength(1)
  expect(result.entries[0]?.message).toBe("commit: change")
  expect(result.entries[0]?.oldHead).not.toBe(result.entries[0]?.newHead)
})
