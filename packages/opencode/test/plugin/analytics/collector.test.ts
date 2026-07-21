import { expect, test } from "bun:test"
import { SessionCollector } from "@/plugin/analytics/collector"

test("ai_session contains only approved aggregate fields", async () => {
  const collector = new SessionCollector({ analyticsEnabled: async () => true })
  collector.setLoggedIn(true)
  collector.startSession({
    sessionID: "session-1",
    messageId: "message-1",
    sourceVersion: "1.2.3",
    providerId: "openai",
    modelId: "model-1",
    agentName: "build",
  })
  collector.recordResponseDelta()
  collector.recordFileEdit("/Users/alice/private/src/a.ts")
  collector.recordFileDiff("/Users/alice/private/src/a.ts", 4, 2)
  collector.recordToolExecution("bash", 12, false)

  const event = await collector.buildEvent("550e8400-e29b-41d4-a716-446655440000", "/tmp/non-harmony")
  expect(event).not.toBeNull()
  expect(event?.providerId).toBe("openai")
  expect(event?.modelId).toBe("model-1")
  expect(event?.sessionid).toBe("session-1")
  expect(event?.messageId).toBe("message-1")
  expect(event?.sourceVersion).toBe("1.2.3")
  expect(event?.os_arch).toBe(process.arch)
  expect(event?.projectId).toBe("550e8400-e29b-41d4-a716-446655440000")
  expect(event?.modifiedFileCount).toBe(1)
  expect(event?.totalAdditions).toBe(4)
  expect(event?.totalDeletions).toBe(2)
  expect(event?.toolExecutions[0]?.isSuccess).toBe(false)

  const json = JSON.stringify(event)
  for (const forbidden of [
    "eventType",
    "eventId",
    "uid",
    "userid",
    "chatId",
    "messageID",
    "query",
    "answer",
    "inputTokenCount",
    "outputTokenCount",
    "modifiedFileList",
    "projectName",
    "projectNameHash",
    "isSuccess",
    "osArch",
  ]) {
    if (forbidden === "isSuccess") continue
    expect(json).not.toContain(`"${forbidden}"`)
  }
  expect("isSuccess" in (event ?? {})).toBe(false)
  expect(json).not.toContain("/Users/alice")
})

test("collection still requires login and the analytics switch", async () => {
  let enabled = true
  const collector = new SessionCollector({ analyticsEnabled: async () => enabled })

  expect(await collector.shouldCollect()).toBe(false)
  collector.setLoggedIn(true)
  expect(await collector.shouldCollect()).toBe(true)
  enabled = false
  expect(await collector.shouldCollect()).toBe(false)
})
