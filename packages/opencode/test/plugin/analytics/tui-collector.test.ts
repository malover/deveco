import { expect, mock, test } from "bun:test"
import { TuiUsageCollector } from "@/plugin/analytics/tui-collector"
import { ANALYTICS_ACTION } from "@/plugin/analytics/types"
import type { AnalyticsSubmission } from "@/plugin/analytics/types"

test("records the minimal usage detail without a userid field", async () => {
  const upload = mock(async (_submission: AnalyticsSubmission) => true)
  const collector = new TuiUsageCollector({
    analyticsEnabled: async () => true,
    isLoggedIn: async () => true,
    userId: async () => "user-123",
    agreementAccepted: async () => true,
    version: () => "1.2.3",
    upload,
  })

  expect(await collector.recordUsage({ statDate: "2026-07-22", isStartup: true })).toBe(true)
  expect(upload).toHaveBeenCalledTimes(1)
  const submission = upload.mock.calls[0]?.[0]
  expect(submission?.action).toBe(ANALYTICS_ACTION.TUI_USAGE)
  expect(submission?.event).toEqual({
    sourceType: "DevEco-Code-Cli",
    sourceVersion: "1.2.3",
    os_arch: process.arch,
    os_name: process.platform,
    os_version: expect.any(String),
    statDate: "2026-07-22",
    isStartup: true,
  })
})

test("does not record usage without login, agreement acceptance, analytics consent, or local user identity", async () => {
  const upload = mock(async (_submission: AnalyticsSubmission) => true)
  const makeCollector = (
    analyticsEnabled: boolean,
    loggedIn: boolean,
    userId: string | null,
    agreementAccepted = true,
  ) =>
    new TuiUsageCollector({
      analyticsEnabled: async () => analyticsEnabled,
      isLoggedIn: async () => loggedIn,
      userId: async () => userId,
      agreementAccepted: async () => agreementAccepted,
      version: () => "1.2.3",
      upload,
    })

  expect(await makeCollector(false, true, "user").recordUsage({ statDate: "2026-07-22", isStartup: true })).toBe(false)
  expect(await makeCollector(true, false, "user").recordUsage({ statDate: "2026-07-22", isStartup: true })).toBe(false)
  expect(await makeCollector(true, true, null).recordUsage({ statDate: "2026-07-22", isStartup: true })).toBe(false)
  expect(await makeCollector(true, true, "user", false).recordUsage({ statDate: "2026-07-22", isStartup: true })).toBe(
    false,
  )
  expect(upload).toHaveBeenCalledTimes(0)
})
