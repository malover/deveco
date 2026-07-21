import { afterEach, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Global } from "@opencode-ai/core/global"
import { LocalCrypto } from "@/security/local-crypto"
import { ANALYTICS_ACTION } from "@/plugin/analytics/types"
import type { AiSessionEvent } from "@/plugin/analytics/types"
import {
  ANALYTICS_SCHEMA_VERSION,
  enqueuePendingEvent,
  getPendingEvents,
  loadStorage,
} from "@/plugin/analytics/storage"
import { tmpdir } from "../../fixture/fixture"

const originalDataDir = Global.Path.data

afterEach(() => {
  Global.Path.data = originalDataDir
})

function event(): AiSessionEvent {
  return {
    sourceType: "DevEco-Code-Cli",
    sourceVersion: "1.2.3",
    os_arch: "arm64",
    os_name: process.platform,
    os_version: "os-version",
    providerId: "openai",
    modelId: "model-1",
    sessionid: "session-1",
    messageId: "message-1",
    agentName: "build",
    projectId: "550e8400-e29b-41d4-a716-446655440000",
    bundleName: "",
    modifiedFileCount: 0,
    totalAdditions: 0,
    totalDeletions: 0,
    operations: { builtinTools: [], mcpTools: [], skillTools: [] },
    toolExecutions: [],
    totalElapsed: 10,
    firstResultElapsed: 5,
  }
}

test("schema upgrades discard old pending events without migration", async () => {
  await using tmp = await tmpdir()
  Global.Path.data = tmp.path
  const file = path.join(tmp.path, "analytics", "analytics.json")
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(
    file,
    JSON.stringify({
      schemaVersion: ANALYTICS_SCHEMA_VERSION - 1,
      pendingEvents: [{ query: "private prompt", answer: "private answer" }],
      lastFlush: 1,
    }),
  )

  const storage = await loadStorage()
  expect(storage.schemaVersion).toBe(ANALYTICS_SCHEMA_VERSION)
  expect(storage.pendingEvents).toEqual([])
})

test("each queued ai_session receives a distinct local uid", async () => {
  await using tmp = await tmpdir()
  Global.Path.data = tmp.path
  const submission = {
    action: ANALYTICS_ACTION.AI_SESSION,
    event: event(),
  } as const

  await enqueuePendingEvent(submission)
  await enqueuePendingEvent(submission)
  const pending = await getPendingEvents()

  expect(pending).toHaveLength(2)
  expect(pending[0]?.uid).not.toBe(pending[1]?.uid)
  expect("uid" in (pending[0]?.event ?? {})).toBe(false)
  expect(pending[0]?.event.sourceVersion).toBe("1.2.3")
  expect("osArch" in (pending[0]?.event ?? {})).toBe(false)
})

test("current-schema queue rejects ai_session details with forbidden fields", async () => {
  await using tmp = await tmpdir()
  Global.Path.data = tmp.path
  const file = path.join(tmp.path, "analytics", "analytics.json")
  await fs.mkdir(path.dirname(file), { recursive: true })
  const invalidEvent = { ...event(), query: "private prompt", projectName: "private-project", isSuccess: true }
  const encrypted = LocalCrypto.encryptForLocalStorage(
    JSON.stringify({
      schemaVersion: ANALYTICS_SCHEMA_VERSION,
      pendingEvents: [
        {
          action: ANALYTICS_ACTION.AI_SESSION,
          event: invalidEvent,
          uid: "uid-1",
          queueId: "queue-1",
          sealed: false,
        },
      ],
      lastFlush: 1,
    }),
  )
  await fs.writeFile(file, JSON.stringify(encrypted))

  expect((await loadStorage()).pendingEvents).toEqual([])
})
