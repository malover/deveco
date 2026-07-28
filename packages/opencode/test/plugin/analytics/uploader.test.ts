import { expect, mock, test } from "bun:test"
import { resolveAnalyticsAuth, toHuaweiTracePayload } from "@/plugin/analytics/uploader"
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

test("expired access token refreshes through JWT without a stored refresh field", async () => {
  const refreshToken = mock(async () => ({
    accessToken: "new-access",
    refreshToken: "new-refresh",
    isRealName: true,
  }))
  const saved: Array<Record<string, unknown>> = []
  const diagnostics: string[] = []

  const token = await resolveAnalyticsAuth({
    authInfo: { type: "oauth", access: "expired-access", expires: 100 },
    now: 101,
    refreshToken,
    saveAuth: async (_provider, info) => void saved.push(info),
    diagnostic: async (message) => void diagnostics.push(message),
  })

  expect(token).toBe("new-access")
  expect(refreshToken).toHaveBeenCalledTimes(1)
  expect(saved[0]).toMatchObject({
    type: "oauth",
    access: "new-access",
    refresh: "new-refresh",
    isRealName: true,
  })
  expect(diagnostics.join("\n")).not.toContain("expired-access")
  expect(diagnostics.join("\n")).not.toContain("new-access")
})

test("valid access token skips JWT refresh", async () => {
  const refreshToken = mock(async () => null)
  const token = await resolveAnalyticsAuth({
    authInfo: { type: "oauth", access: "current-access", expires: 102 },
    now: 101,
    refreshToken,
    saveAuth: async () => undefined,
    diagnostic: async () => undefined,
  })

  expect(token).toBe("current-access")
  expect(refreshToken).toHaveBeenCalledTimes(0)
})

test("failed JWT refresh returns null without exposing credentials in diagnostics", async () => {
  const diagnostics: string[] = []
  const token = await resolveAnalyticsAuth({
    authInfo: { type: "oauth", access: "private-expired-access", expires: 100 },
    now: 101,
    refreshToken: async () => null,
    saveAuth: async () => undefined,
    diagnostic: async (message) => void diagnostics.push(message),
  })

  expect(token).toBeNull()
  expect(diagnostics.join("\n")).toContain("JWT refresh failed")
  expect(diagnostics.join("\n")).not.toContain("private-expired-access")
})

test("diagnostic failures do not block JWT refresh", async () => {
  const token = await resolveAnalyticsAuth({
    authInfo: { type: "oauth", access: "expired-access", expires: 100 },
    now: 101,
    refreshToken: async () => ({
      accessToken: "new-access",
      refreshToken: "new-refresh",
      isRealName: true,
    }),
    saveAuth: async () => undefined,
    diagnostic: async () => {
      throw new Error("diagnostic unavailable")
    },
  })

  expect(token).toBe("new-access")
})
