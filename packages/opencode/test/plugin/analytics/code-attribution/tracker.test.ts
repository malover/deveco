import { $ } from "bun"
import { expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { createCodeAttributionTracker } from "@/plugin/analytics/code-attribution"
import type { AiCodeAttributionEvent } from "@/plugin/analytics/types"
import { tmpdir } from "../../../fixture/fixture"

const projectId = "550e8400-e29b-41d4-a716-446655440000"

async function commit(directory: string, message: string): Promise<void> {
  await $`git add -A`.cwd(directory).quiet()
  await $`git commit -m ${message}`.cwd(directory).quiet()
}

test("attributes only final retained lines across AI-human-AI-human edits", async () => {
  await using tmp = await tmpdir({ git: true })
  await using data = await tmpdir()
  const events: AiCodeAttributionEvent[] = []
  const diagnostics: string[] = []
  const tracker = await createCodeAttributionTracker({
    directory: tmp.path,
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
  const file = path.join(tmp.path, "main.ts")

  await tracker.beforeAiTool()
  await fs.writeFile(file, "const retainedAi = 1\nconst overwrittenAi = 2\n")
  await tracker.afterAiTool()

  await fs.writeFile(file, "const retainedHuman = 10\nconst overwrittenAi = 2\n")
  await tracker.beforeAiTool()
  await fs.writeFile(file, "const retainedHuman = 10\nconst finalAi = 20\nconst retainedAi = 30\n")
  await tracker.afterAiTool()

  await fs.writeFile(file, "const retainedHuman = 10\nconst finalHuman = 20\nconst retainedAi = 30\n")
  await commit(tmp.path, "mixed change")
  await tracker.poll()
  await tracker.poll()

  expect(events).toEqual([
    {
      projectId,
      aiGeneratedLines: 1,
      humanGeneratedLines: 2,
      unknownGeneratedLines: 0,
      totalGeneratedLines: 3,
    },
  ])
  expect(diagnostics).toContain("Attribution commit: ai=1, human=2, unknown=0, total=3, queued=true")
  expect(diagnostics.join("\n")).not.toContain(tmp.path)
  expect(diagnostics.join("\n")).not.toContain("const retainedAi")
  await tracker.shutdown()
})

test("recovers commits made while stopped and keeps unobserved lines unknown", async () => {
  await using tmp = await tmpdir({ git: true })
  await using data = await tmpdir()
  const file = path.join(tmp.path, "main.ts")
  const first = await createCodeAttributionTracker({
    directory: tmp.path,
    projectId,
    dataDir: data.path,
    pollInterval: 0,
    submit: async () => true,
  })
  await first.setEnabled(true)
  await first.beforeAiTool()
  await fs.writeFile(file, "const retainedAi = 1\n")
  await first.afterAiTool()
  await first.shutdown()

  await fs.appendFile(file, "const changedWhileClosed = 2\n")
  await commit(tmp.path, "offline change")

  const events: AiCodeAttributionEvent[] = []
  const reopened = await createCodeAttributionTracker({
    directory: tmp.path,
    projectId,
    dataDir: data.path,
    pollInterval: 0,
    submit: async (event) => {
      events.push(event)
      return true
    },
  })
  await reopened.setEnabled(true)
  await reopened.poll()

  expect(events).toEqual([
    {
      projectId,
      aiGeneratedLines: 1,
      humanGeneratedLines: 0,
      unknownGeneratedLines: 1,
      totalGeneratedLines: 2,
    },
  ])
  await reopened.shutdown()
})

test("pausing attribution preserves previously observed AI lines", async () => {
  await using tmp = await tmpdir({ git: true })
  await using data = await tmpdir()
  const events: AiCodeAttributionEvent[] = []
  const tracker = await createCodeAttributionTracker({
    directory: tmp.path,
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
  await tracker.beforeAiTool()
  await fs.writeFile(path.join(tmp.path, "main.ts"), "const generatedBeforePause = true\n")
  await tracker.afterAiTool()

  await tracker.setEnabled(false)
  await commit(tmp.path, "commit while attribution is paused")
  await tracker.setEnabled(true)

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

test("attributes a commit created inside an AI bash checkpoint to AI", async () => {
  await using tmp = await tmpdir({ git: true })
  await using data = await tmpdir()
  const events: AiCodeAttributionEvent[] = []
  const tracker = await createCodeAttributionTracker({
    directory: tmp.path,
    projectId,
    dataDir: data.path,
    pollInterval: 0,
    submit: async (event) => {
      events.push(event)
      return true
    },
  })
  await tracker.setEnabled(true)

  await tracker.beforeAiTool()
  await fs.writeFile(path.join(tmp.path, "main.ts"), "const committedByAiTool = true\n")
  await commit(tmp.path, "commit inside tool")
  await tracker.afterAiTool()

  expect(events[0]).toEqual({
    projectId,
    aiGeneratedLines: 1,
    humanGeneratedLines: 0,
    unknownGeneratedLines: 0,
    totalGeneratedLines: 1,
  })
  await tracker.shutdown()
})

test("does not let polling classify a commit while an AI tool is active", async () => {
  await using tmp = await tmpdir({ git: true })
  await using data = await tmpdir()
  const events: AiCodeAttributionEvent[] = []
  const tracker = await createCodeAttributionTracker({
    directory: tmp.path,
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

  await tracker.beforeAiTool()
  await fs.writeFile(path.join(tmp.path, "main.ts"), "const committedByLongAiTool = true\n")
  await commit(tmp.path, "commit while tool is running")
  await tracker.poll()
  expect(events).toEqual([])

  await tracker.afterAiTool()
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

test("does not rewrite the ledger while the reflog is unchanged", async () => {
  await using tmp = await tmpdir({ git: true })
  await using data = await tmpdir()
  const tracker = await createCodeAttributionTracker({
    directory: tmp.path,
    projectId,
    dataDir: data.path,
    pollInterval: 0,
    discoveryInterval: 0,
    submit: async () => true,
  })
  await tracker.setEnabled(true)
  await tracker.beforeAiTool()
  await tracker.afterAiTool()
  const directory = path.join(data.path, "analytics", "code-attribution")
  const [ledger] = await fs.readdir(directory)
  const file = path.join(directory, ledger!)
  const before = await fs.readFile(file, "utf8")

  await tracker.poll()

  expect(await fs.readFile(file, "utf8")).toBe(before)
  await tracker.shutdown()
})

test("preserves AI attribution when shutdown finalizes an active tool", async () => {
  await using tmp = await tmpdir({ git: true })
  await using data = await tmpdir()
  const file = path.join(tmp.path, "main.ts")
  const first = await createCodeAttributionTracker({
    directory: tmp.path,
    projectId,
    dataDir: data.path,
    pollInterval: 0,
    discoveryInterval: 0,
    submit: async () => true,
  })
  await first.setEnabled(true)
  await first.beforeAiTool()
  await fs.writeFile(file, "const generatedBeforeShutdown = true\n")
  await first.shutdown()
  await commit(tmp.path, "commit after shutdown")

  const events: AiCodeAttributionEvent[] = []
  const reopened = await createCodeAttributionTracker({
    directory: tmp.path,
    projectId,
    dataDir: data.path,
    pollInterval: 0,
    discoveryInterval: 0,
    submit: async (event) => {
      events.push(event)
      return true
    },
  })
  await reopened.setEnabled(true)
  await reopened.poll()

  expect(events).toEqual([
    {
      projectId,
      aiGeneratedLines: 1,
      humanGeneratedLines: 0,
      unknownGeneratedLines: 0,
      totalGeneratedLines: 1,
    },
  ])
  await reopened.shutdown()
})

test("does not backfill existing dirty lines or upload branch checkout", async () => {
  await using tmp = await tmpdir({ git: true })
  await using data = await tmpdir()
  const file = path.join(tmp.path, "main.ts")
  await fs.writeFile(file, "const beforeBaseline = 1\n")
  await commit(tmp.path, "existing branch commit")
  await $`git branch existing`.cwd(tmp.path).quiet()
  await $`git reset --hard HEAD~1`.cwd(tmp.path).quiet()
  await fs.writeFile(file, "const dirtyBeforeOpen = 2\n")

  const events: AiCodeAttributionEvent[] = []
  const tracker = await createCodeAttributionTracker({
    directory: tmp.path,
    projectId,
    dataDir: data.path,
    pollInterval: 0,
    submit: async (event) => {
      events.push(event)
      return true
    },
  })
  await tracker.setEnabled(true)
  await commit(tmp.path, "baseline content")
  await tracker.poll()
  await $`git checkout existing`.cwd(tmp.path).quiet()
  await tracker.poll()

  expect(events).toEqual([])
  await tracker.shutdown()
})

test("preserves dirty AI lines across a branch transition", async () => {
  await using tmp = await tmpdir({ git: true })
  await using data = await tmpdir()
  const events: AiCodeAttributionEvent[] = []
  const tracker = await createCodeAttributionTracker({
    directory: tmp.path,
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

  await tracker.beforeAiTool()
  await fs.writeFile(path.join(tmp.path, "main.ts"), "const generatedBeforeCheckout = true\n")
  await tracker.afterAiTool()
  await $`git checkout -b other`.cwd(tmp.path).quiet()
  await tracker.poll()
  await commit(tmp.path, "commit generated line after checkout")
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

test("deduplicates the same patch when it is cherry-picked onto another branch", async () => {
  await using tmp = await tmpdir({ git: true })
  await using data = await tmpdir()
  const root = (await $`git rev-parse HEAD`.cwd(tmp.path).text()).trim()
  const events: AiCodeAttributionEvent[] = []
  const tracker = await createCodeAttributionTracker({
    directory: tmp.path,
    projectId,
    dataDir: data.path,
    pollInterval: 0,
    submit: async (event) => {
      events.push(event)
      return true
    },
  })
  await tracker.setEnabled(true)
  await tracker.beforeAiTool()
  await fs.writeFile(path.join(tmp.path, "main.ts"), "const generated = true\n")
  await tracker.afterAiTool()
  await commit(tmp.path, "generated")
  const generatedCommit = (await $`git rev-parse HEAD`.cwd(tmp.path).text()).trim()
  await tracker.poll()

  await $`git checkout -b replay ${root}`.cwd(tmp.path).quiet()
  await $`git cherry-pick ${generatedCommit}`.cwd(tmp.path).quiet()
  await tracker.poll()

  expect(events).toHaveLength(1)
  expect(events[0]?.aiGeneratedLines).toBe(1)
  await tracker.shutdown()
})

test("an amend reports only newly added lines instead of recounting the original commit", async () => {
  await using tmp = await tmpdir({ git: true })
  await using data = await tmpdir()
  const events: AiCodeAttributionEvent[] = []
  const tracker = await createCodeAttributionTracker({
    directory: tmp.path,
    projectId,
    dataDir: data.path,
    pollInterval: 0,
    submit: async (event) => {
      events.push(event)
      return true
    },
  })
  await tracker.setEnabled(true)
  const file = path.join(tmp.path, "main.ts")
  await tracker.beforeAiTool()
  await fs.writeFile(file, "const generated = true\n")
  await tracker.afterAiTool()
  await commit(tmp.path, "generated")
  await tracker.poll()

  await fs.appendFile(file, "const amendedByHuman = true\n")
  await $`git add main.ts`.cwd(tmp.path).quiet()
  await $`git commit --amend --no-edit`.cwd(tmp.path).quiet()
  await tracker.poll()

  expect(events).toEqual([
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
  await tracker.shutdown()
})

test("non-git directories remain a no-op", async () => {
  await using tmp = await tmpdir()
  const events: AiCodeAttributionEvent[] = []
  const tracker = await createCodeAttributionTracker({
    directory: tmp.path,
    projectId,
    dataDir: tmp.path,
    pollInterval: 0,
    submit: async (event) => {
      events.push(event)
      return true
    },
  })

  await tracker.setEnabled(true)
  await tracker.beforeAiTool()
  await tracker.afterAiTool()
  await tracker.poll()
  expect(events).toEqual([])
})
