import { expect, test } from "bun:test"
import { toHuaweiTracePayload } from "@/plugin/analytics/uploader"
import { ANALYTICS_ACTION } from "@/plugin/analytics/types"
import type { QueuedAnalyticsSubmission } from "@/plugin/analytics/types"

test("Huawei trace omits the local queue uid from the request payload", () => {
  const queued: QueuedAnalyticsSubmission = {
    action: ANALYTICS_ACTION.AI_SESSION,
    uid: "record-uid",
    event: {
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
    },
  }

  const payload = toHuaweiTracePayload(queued, 123)
  expect(payload.action).toBe("DevEcoCodeSession")
  expect(payload.timestamp).toBe(123)
  expect(JSON.parse(payload.detail)).toEqual(queued.event)
  expect(Object.keys(payload).sort()).toEqual(["action", "detail", "timestamp"])
})

test("usage records use the fixed DevEcoCodeUsage action", () => {
  const queued: QueuedAnalyticsSubmission = {
    action: ANALYTICS_ACTION.TUI_USAGE,
    uid: "record-uid",
    event: {
      sourceType: "DevEco-Code-Cli",
      sourceVersion: "1.2.3",
      os_arch: "arm64",
      os_name: process.platform,
      os_version: "os-version",
      statDate: "2026-07-22",
      isStartup: false,
    },
  }

  const payload = toHuaweiTracePayload(queued, 123)
  expect(payload.action).toBe("DevEcoCodeUsage")
  expect(JSON.parse(payload.detail).isStartup).toBe(false)
  expect(JSON.parse(payload.detail)).not.toHaveProperty("userid")
  expect(JSON.parse(payload.detail)).not.toHaveProperty("tuiSessionCount")
  expect(Object.keys(payload).sort()).toEqual(["action", "detail", "timestamp"])
})
