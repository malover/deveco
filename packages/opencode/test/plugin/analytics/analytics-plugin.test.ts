import { expect, mock, test } from "bun:test"
import { createAnalyticsPlugin } from "@/plugin/analytics/analytics-plugin"
import type { SessionStart } from "@/plugin/analytics/collector"
import { ANALYTICS_ACTION } from "@/plugin/analytics/types"
import type { AiSessionEvent, AnalyticsSubmission } from "@/plugin/analytics/types"

const builtEvent: AiSessionEvent = {
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

function createHarness() {
  let loggedIn = true
  let jwtExpired: boolean | null = false
  let shouldCollect = true
  let diagnosticThrows = false
  let active = false
  const startSession = mock((_input: SessionStart) => {
    active = true
  })
  const buildEvent = mock(async () => builtEvent)
  const upload = mock(async (_submission: AnalyticsSubmission) => true)
  const projectId = mock(async () => "550e8400-e29b-41d4-a716-446655440000")
  const diagnostics: string[] = []
  const plugin = createAnalyticsPlugin({
    collector: {
      init: async () => undefined,
      setLoggedIn: (value) => {
        if (!value) active = false
      },
      shouldCollect: async () => shouldCollect,
      startSession,
      recordResponseDelta: () => undefined,
      recordFileEdit: () => undefined,
      recordFileDiff: () => undefined,
      recordToolExecution: () => undefined,
      getSessionID: () => (active ? "session-1" : null),
      buildEvent,
      clear: () => {
        active = false
      },
    },
    uploader: {
      restorePending: async () => undefined,
      startPeriodicFlush: () => undefined,
      shutdown: async () => undefined,
      upload,
    },
    isLoggedIn: async () => loggedIn,
    isJwtExpired: async () => jwtExpired,
    diagnostic: async (message) => {
      if (diagnosticThrows) throw new Error("diagnostic unavailable")
      diagnostics.push(message)
    },
    projectId,
    version: () => "1.2.3",
  })

  return {
    plugin,
    startSession,
    buildEvent,
    upload,
    projectId,
    diagnostics,
    isActive: () => active,
    setLoggedIn: (value: boolean) => {
      loggedIn = value
    },
    setJwtExpired: (value: boolean | null) => {
      jwtExpired = value
    },
    setDiagnosticThrows: (value: boolean) => {
      diagnosticThrows = value
    },
    setShouldCollect: (value: boolean) => {
      shouldCollect = value
    },
  }
}

async function startSession(harness: ReturnType<typeof createHarness>, providerID: string) {
  const hooks = await harness.plugin({ directory: "/tmp/project" } as never)
  await hooks["chat.message"]!(
    {
      sessionID: "session-1",
      agent: "build",
      model: { providerID, modelID: "model-1" },
    } as never,
    { message: { id: "message-1" }, parts: [] } as never,
  )
  return hooks
}

async function finishSession(hooks: Awaited<ReturnType<ReturnType<typeof createAnalyticsPlugin>>>) {
  await hooks.event!({
    event: { type: "session.idle", properties: { sessionID: "session-1" } } as never,
  })
}

test("starts ai_session for non-Huawei providers without collecting prompt content", async () => {
  const harness = createHarness()
  await startSession(harness, "openai")

  expect(harness.startSession).toHaveBeenCalledTimes(1)
  expect(harness.startSession.mock.calls[0]?.[0]).toEqual({
    sessionID: "session-1",
    messageId: "message-1",
    sourceVersion: "1.2.3",
    providerId: "openai",
    modelId: "model-1",
    agentName: "build",
  })
  expect(JSON.stringify(harness.startSession.mock.calls[0]?.[0])).not.toContain("private prompt")
})

test("starts ai_session for Huawei and API-key style providers alike", async () => {
  const huawei = createHarness()
  await startSession(huawei, "deveco")
  expect(huawei.startSession).toHaveBeenCalledTimes(1)

  const thirdParty = createHarness()
  await startSession(thirdParty, "anthropic")
  expect(thirdParty.startSession).toHaveBeenCalledTimes(1)
})

test("still requires Huawei login", async () => {
  const harness = createHarness()
  harness.setLoggedIn(false)
  await startSession(harness, "openai")
  expect(harness.startSession).toHaveBeenCalledTimes(0)
})

test("only an explicitly expired JWT disables analytics", async () => {
  const validJwt = createHarness()
  validJwt.setJwtExpired(false)
  await startSession(validJwt, "openai")
  expect(validJwt.startSession).toHaveBeenCalledTimes(1)

  const unknownExpiration = createHarness()
  unknownExpiration.setJwtExpired(null)
  await startSession(unknownExpiration, "openai")
  expect(unknownExpiration.startSession).toHaveBeenCalledTimes(1)

  const expiredJwt = createHarness()
  expiredJwt.setJwtExpired(true)
  await startSession(expiredJwt, "openai")
  expect(expiredJwt.startSession).toHaveBeenCalledTimes(0)
})

test("diagnostic failures never block plugin initialization or session hooks", async () => {
  const harness = createHarness()
  harness.setDiagnosticThrows(true)
  await startSession(harness, "openai")

  expect(harness.startSession).toHaveBeenCalledTimes(1)
})

test("analytics disablement clears an active session without uploading", async () => {
  const harness = createHarness()
  const hooks = await startSession(harness, "openai")
  harness.setShouldCollect(false)
  await finishSession(hooks)

  expect(harness.buildEvent).toHaveBeenCalledTimes(0)
  expect(harness.upload).toHaveBeenCalledTimes(0)
  expect(harness.isActive()).toBe(false)
})

test("session idle submits the event with the fixed ai_session action and project id", async () => {
  const harness = createHarness()
  const hooks = await startSession(harness, "openai")
  await finishSession(hooks)

  expect(harness.projectId).toHaveBeenCalledWith("/tmp/project")
  expect(harness.buildEvent).toHaveBeenCalledWith("550e8400-e29b-41d4-a716-446655440000", "/tmp/project")
  expect(harness.upload).toHaveBeenCalledWith({ action: ANALYTICS_ACTION.AI_SESSION, event: builtEvent })
})

test("logout before session idle clears active analytics without finalizing", async () => {
  const harness = createHarness()
  const hooks = await startSession(harness, "openai")
  harness.setLoggedIn(false)
  await finishSession(hooks)

  expect(harness.buildEvent).toHaveBeenCalledTimes(0)
  expect(harness.upload).toHaveBeenCalledTimes(0)
  expect(harness.isActive()).toBe(false)
})
