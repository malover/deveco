import { expect, mock, test } from "bun:test"
import { TuiUsageTracker, shanghaiDateWindow } from "@/cli/tui/usage-tracker"
import type { TuiUsageRecord } from "@/cli/tui/usage-tracker"

const at = (value: string) => new Date(value).getTime()

test("Shanghai date window ends at the next UTC+8 midnight", () => {
  const window = shanghaiDateWindow(at("2026-07-22T23:59:59.000+08:00"))
  expect(window.statDate).toBe("2026-07-22")
  expect(window.end).toBe(at("2026-07-23T00:00:00.000+08:00"))
})

test("startup is one record and same-day activity does not add another", async () => {
  const record = mock(async (_input: TuiUsageRecord) => true)
  const tracker = new TuiUsageTracker(record)

  await tracker.recordStartup(at("2026-07-22T08:00:00.000+08:00"))
  await tracker.recordActivity(at("2026-07-22T20:00:00.000+08:00"))

  expect(record.mock.calls.map((call) => call[0])).toEqual([{ statDate: "2026-07-22", isStartup: true }])
})

test("startup can be retried after login and agreement become eligible", async () => {
  const record = mock(async (_input: TuiUsageRecord) => record.mock.calls.length > 1)
  const tracker = new TuiUsageTracker(record)
  const timestamp = at("2026-07-22T08:00:00.000+08:00")

  expect(await tracker.recordStartup(timestamp)).toBe(false)
  expect(await tracker.recordStartup(timestamp + 1_000)).toBe(true)
  expect(await tracker.recordStartup(timestamp + 2_000)).toBe(false)

  expect(record.mock.calls.map((call) => call[0])).toEqual([
    { statDate: "2026-07-22", isStartup: true },
    { statDate: "2026-07-22", isStartup: true },
  ])
})

test("first explicit activity after midnight records a non-startup event", async () => {
  const record = mock(async (_input: TuiUsageRecord) => true)
  const tracker = new TuiUsageTracker(record)

  await tracker.recordStartup(at("2026-07-22T23:59:59.000+08:00"))
  await tracker.recordActivity(at("2026-07-23T00:00:01.000+08:00"))
  await tracker.recordActivity(at("2026-07-23T10:00:00.000+08:00"))

  expect(record.mock.calls.map((call) => call[0])).toEqual([
    { statDate: "2026-07-22", isStartup: true },
    { statDate: "2026-07-23", isStartup: false },
  ])
})

test("days with no explicit activity do not produce records", async () => {
  const record = mock(async (_input: TuiUsageRecord) => true)
  const tracker = new TuiUsageTracker(record)

  await tracker.recordStartup(at("2026-07-20T12:00:00.000+08:00"))
  await tracker.recordActivity(at("2026-07-22T09:00:00.000+08:00"))

  expect(record.mock.calls.map((call) => call[0])).toEqual([
    { statDate: "2026-07-20", isStartup: true },
    { statDate: "2026-07-22", isStartup: false },
  ])
})

test("concurrent activity for one date persists only once", async () => {
  let resolve!: (value: boolean) => void
  const record = mock((_input: TuiUsageRecord) => new Promise<boolean>((done) => (resolve = done)))
  const tracker = new TuiUsageTracker(record)
  const timestamp = at("2026-07-22T09:00:00.000+08:00")

  const first = tracker.recordActivity(timestamp)
  const second = tracker.recordActivity(timestamp)
  resolve(true)
  await Promise.all([first, second])

  expect(record).toHaveBeenCalledTimes(1)
})

test("failed persistence is retried after the backoff", async () => {
  const record = mock(async (_input: TuiUsageRecord) => record.mock.calls.length > 1)
  const tracker = new TuiUsageTracker(record, Date.now, 60_000)
  const timestamp = at("2026-07-22T09:00:00.000+08:00")

  await tracker.recordActivity(timestamp)
  await tracker.recordActivity(timestamp + 30_000)
  await tracker.recordActivity(timestamp + 60_000)

  expect(record).toHaveBeenCalledTimes(2)
})
