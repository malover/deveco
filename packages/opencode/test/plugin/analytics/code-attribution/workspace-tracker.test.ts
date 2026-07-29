import { $ } from "bun"
import { expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { createCodeAttributionTracker, discoverWorkspaceRepositories } from "@/plugin/analytics/code-attribution"
import type { AiCodeAttributionEvent } from "@/plugin/analytics/types"
import { tmpdir } from "../../../fixture/fixture"

const projectId = "550e8400-e29b-41d4-a716-446655440000"

async function initializeRepository(directory: string): Promise<void> {
  await fs.mkdir(directory, { recursive: true })
  await $`git init`.cwd(directory).quiet()
  await $`git config core.fsmonitor false`.cwd(directory).quiet()
  await $`git config commit.gpgsign false`.cwd(directory).quiet()
  await $`git config user.email test@opencode.test`.cwd(directory).quiet()
  await $`git config user.name Test`.cwd(directory).quiet()
  await $`git commit --allow-empty -m root`.cwd(directory).quiet()
}

async function commit(directory: string, message: string): Promise<void> {
  await $`git add -A`.cwd(directory).quiet()
  await $`git commit -m ${message}`.cwd(directory).quiet()
}

test("tracks AI and human commits in every nested repository with one workspace project id", async () => {
  await using workspace = await tmpdir()
  await using data = await tmpdir()
  const first = path.join(workspace.path, "first")
  const second = path.join(workspace.path, "second")
  await initializeRepository(first)
  await initializeRepository(second)
  const events: AiCodeAttributionEvent[] = []
  const diagnostics: string[] = []
  const tracker = await createCodeAttributionTracker({
    directory: workspace.path,
    projectId,
    dataDir: data.path,
    pollInterval: 0,
    discoveryInterval: 0,
    diagnostic: (message) => void diagnostics.push(message),
    submit: async (event) => {
      events.push(event)
      return true
    },
  })
  await tracker.setEnabled(true)

  await tracker.beforeAiTool()
  await fs.writeFile(path.join(first, "ai.ts"), "export const generatedByAi = true\n")
  await tracker.afterAiTool()
  await commit(first, "ai change")

  await fs.writeFile(path.join(second, "human.ts"), "export const writtenByHuman = true\n")
  await commit(second, "human change")
  await tracker.poll()

  expect(events.sort((left, right) => right.aiGeneratedLines - left.aiGeneratedLines)).toEqual([
    {
      projectId,
      aiGeneratedLines: 1,
      humanGeneratedLines: 0,
      unknownGeneratedLines: 0,
      totalGeneratedLines: 1,
    },
    {
      projectId,
      aiGeneratedLines: 0,
      humanGeneratedLines: 1,
      unknownGeneratedLines: 0,
      totalGeneratedLines: 1,
    },
  ])
  expect(diagnostics).toContain("Attribution repositories discovered: 2")
  expect(diagnostics.join("\n")).not.toContain(workspace.path)
  await tracker.shutdown()
})

test("discovers a repository initialized after startup on the next AI checkpoint", async () => {
  await using workspace = await tmpdir()
  await using data = await tmpdir()
  const events: AiCodeAttributionEvent[] = []
  const tracker = await createCodeAttributionTracker({
    directory: workspace.path,
    projectId,
    dataDir: data.path,
    pollInterval: 0,
    discoveryInterval: 0,
    submit: async (event) => {
      events.push(event)
      return true
    },
  })
  await tracker.setEnabled(true)

  const repository = path.join(workspace.path, "created-later")
  await initializeRepository(repository)
  await tracker.beforeAiTool()
  await fs.writeFile(path.join(repository, "created.ts"), "export const discovered = true\n")
  await tracker.afterAiTool()
  await commit(repository, "created after startup")
  await tracker.poll()

  expect(events).toEqual([
    {
      projectId,
      aiGeneratedLines: 1,
      humanGeneratedLines: 0,
      unknownGeneratedLines: 0,
      totalGeneratedLines: 1,
    },
  ])
  await tracker.shutdown()
})

test("enabling attribution does not discover repositories before an AI checkpoint", async () => {
  await using workspace = await tmpdir()
  await using data = await tmpdir()
  const repository = path.join(workspace.path, "nested")
  await initializeRepository(repository)
  const diagnostics: string[] = []
  const tracker = await createCodeAttributionTracker({
    directory: workspace.path,
    projectId,
    dataDir: data.path,
    pollInterval: 0,
    discoveryInterval: 10,
    diagnostic: (message) => void diagnostics.push(message),
    submit: async () => true,
  })

  await tracker.setEnabled(true)
  await tracker.setEnabled(true)
  await Bun.sleep(30)

  expect(diagnostics).toEqual([])
  await tracker.shutdown()
})

test("does not traverse repository symlinks or excluded directories", async () => {
  await using workspace = await tmpdir()
  await using outside = await tmpdir()
  const outsideRepository = path.join(outside.path, "outside")
  const excludedRepository = path.join(workspace.path, "node_modules", "dependency")
  await initializeRepository(outsideRepository)
  await initializeRepository(excludedRepository)
  await fs.symlink(outsideRepository, path.join(workspace.path, "linked-repository"))

  expect(await discoverWorkspaceRepositories(workspace.path)).toEqual([])
})

test("does not scan for repositories below direct workspace children", async () => {
  await using workspace = await tmpdir()
  const nestedRepository = path.join(workspace.path, "group", "nested")
  await initializeRepository(nestedRepository)

  expect(await discoverWorkspaceRepositories(workspace.path)).toEqual([])
})

test("attaches a repository only once when ancestor and recursive discovery both find it", async () => {
  await using workspace = await tmpdir({ git: true })

  const repositories = await discoverWorkspaceRepositories(workspace.path)

  expect(repositories.map((repository) => repository.root)).toEqual([workspace.path])
})

test("diagnostic failures do not block repository discovery or attribution", async () => {
  await using workspace = await tmpdir()
  await using data = await tmpdir()
  const repository = path.join(workspace.path, "nested")
  await initializeRepository(repository)
  const events: AiCodeAttributionEvent[] = []
  const tracker = await createCodeAttributionTracker({
    directory: workspace.path,
    projectId,
    dataDir: data.path,
    pollInterval: 0,
    discoveryInterval: 0,
    diagnostic: async () => {
      throw new Error("diagnostic unavailable")
    },
    submit: async (event) => {
      events.push(event)
      return true
    },
  })

  await tracker.setEnabled(true)
  await tracker.beforeAiTool()
  await fs.writeFile(path.join(repository, "main.ts"), "export const value = true\n")
  await tracker.afterAiTool()
  await commit(repository, "change")
  await tracker.poll()

  expect(events).toHaveLength(1)
  await tracker.shutdown()
})
