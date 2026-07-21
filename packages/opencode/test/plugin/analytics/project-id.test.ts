import { expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { getOrCreateProjectId } from "@/plugin/analytics/project-id"
import { tmpdir } from "../../fixture/fixture"

test("project id is stable per directory and different across directories", async () => {
  await using tmp = await tmpdir()
  const dataDir = path.join(tmp.path, "data")
  const firstProject = path.join(tmp.path, "projects", "first")
  const secondProject = path.join(tmp.path, "projects", "second")
  await fs.mkdir(firstProject, { recursive: true })
  await fs.mkdir(secondProject, { recursive: true })

  const first = await getOrCreateProjectId(firstProject, dataDir)
  const repeated = await getOrCreateProjectId(firstProject, dataDir)
  const second = await getOrCreateProjectId(secondProject, dataDir)

  expect(first).toMatch(/^[0-9a-f-]{36}$/)
  expect(repeated).toBe(first)
  expect(second).not.toBe(first)
})

test("project id storage contains only directory hashes and UUIDs", async () => {
  await using tmp = await tmpdir()
  const dataDir = path.join(tmp.path, "data")
  const project = path.join(tmp.path, "private-project")
  await fs.mkdir(project, { recursive: true })

  const projectId = await getOrCreateProjectId(project, dataDir)
  const file = path.join(dataDir, "analytics", "project-ids.json")
  const text = await fs.readFile(file, "utf8")
  const stored = JSON.parse(text) as { schemaVersion: number; projects: Record<string, string> }

  expect(text).not.toContain(project)
  expect(stored.schemaVersion).toBe(1)
  expect(Object.keys(stored.projects)).toHaveLength(1)
  expect(Object.keys(stored.projects)[0]).toMatch(/^[0-9a-f]{64}$/)
  expect(Object.values(stored.projects)).toEqual([projectId])
})
