import { describe, expect, test } from "bun:test"
import {
  extractJscrashFaultlogNames,
  parseFaultlogEntry,
  faultlogMatchesBundle,
  filterFaultlogsByBundle,
  sortFaultlogsByRecency,
  selectWithinMaxAge,
} from "../resources/skills/arkts-runtime-fix/scripts/shared/jscrash-faultlogger.mjs"

describe("jscrash-faultlogger extractJscrashFaultlogNames", () => {
  test("extracts jscrash log names from text", () => {
    const text = `
jscrash-com.example.app-1704067200.log
jscrash-com.example.other-1704070800.log
`
    const names = extractJscrashFaultlogNames(text)
    expect(names).toContain("jscrash-com.example.app-1704067200.log")
    expect(names).toContain("jscrash-com.example.other-1704070800.log")
  })

  test("returns empty array when no jscrash logs found", () => {
    const text = "No crash logs here"
    const names = extractJscrashFaultlogNames(text)
    expect(names).toEqual([])
  })

  test("deduplicates extracted names", () => {
    const text = `
jscrash-com.example.app-1704067200.log
jscrash-com.example.app-1704067200.log
jscrash-com.example.app-1704067200.log
`
    const names = extractJscrashFaultlogNames(text)
    expect(names.length).toBe(1)
  })

  test("handles mixed content", () => {
    const text = `
Some log output
jscrash-com.example.app-1704067200.log
More log output
jscrash-com.example.other-1704070800.log
End of logs
`
    const names = extractJscrashFaultlogNames(text)
    expect(names.length).toBe(2)
  })
})

describe("jscrash-faultlogger parseFaultlogEntry", () => {
  test("parses entry with 10-digit timestamp (seconds)", () => {
    const entry = parseFaultlogEntry("jscrash-com.example.app-1704067200.log")
    expect(entry.name).toBe("jscrash-com.example.app-1704067200.log")
    expect(entry.timestampMs).toBe(1704067200000)
  })

  test("parses entry with 13-digit timestamp (milliseconds)", () => {
    const entry = parseFaultlogEntry("jscrash-com.example.app-1704067200000.log")
    expect(entry.name).toBe("jscrash-com.example.app-1704067200000.log")
    expect(entry.timestampMs).toBe(1704067200000)
  })

  test("returns null timestamp for malformed name", () => {
    const entry = parseFaultlogEntry("invalid-name.log")
    expect(entry.name).toBe("invalid-name.log")
    expect(entry.timestampMs).toBeNull()
  })

  test("handles bundle name with UID suffix", () => {
    const entry = parseFaultlogEntry("jscrash-com.example.app-12345-1704067200.log")
    expect(entry.timestampMs).toBe(1704067200000)
  })
})

describe("jscrash-faultlogger faultlogMatchesBundle", () => {
  test("matches when bundle name is in filename", () => {
    const matches = faultlogMatchesBundle("jscrash-com.example.app-1704067200.log", "com.example.app")
    expect(matches).toBe(true)
  })

  test("does not match when bundle name differs", () => {
    const matches = faultlogMatchesBundle("jscrash-com.example.app-1704067200.log", "com.example.other")
    expect(matches).toBe(false)
  })

  test("matches all when bundle name is empty", () => {
    const matches = faultlogMatchesBundle("jscrash-com.example.app-1704067200.log", "")
    expect(matches).toBe(true)
  })

  test("matches all when bundle name is whitespace", () => {
    const matches = faultlogMatchesBundle("jscrash-com.example.app-1704067200.log", "   ")
    expect(matches).toBe(true)
  })

  test("case-insensitive matching", () => {
    const matches = faultlogMatchesBundle("jscrash-com.example.app-1704067200.log", "COM.EXAMPLE.APP")
    expect(matches).toBe(true)
  })
})

describe("jscrash-faultlogger filterFaultlogsByBundle", () => {
  test("filters logs by bundle name", () => {
    const names = [
      "jscrash-com.example.app-1704067200.log",
      "jscrash-com.example.other-1704070800.log",
      "jscrash-com.example.app-1704074400.log",
    ]
    const filtered = filterFaultlogsByBundle(names, "com.example.app")
    expect(filtered.length).toBe(2)
    expect(filtered.every((n: string) => n.includes("com.example.app"))).toBe(true)
  })

  test("returns all logs when bundle name is empty", () => {
    const names = [
      "jscrash-com.example.app-1704067200.log",
      "jscrash-com.example.other-1704070800.log",
    ]
    const filtered = filterFaultlogsByBundle(names, "")
    expect(filtered).toEqual(names)
  })

  test("returns all logs when no matches found", () => {
    const names = [
      "jscrash-com.example.app-1704067200.log",
      "jscrash-com.example.other-1704070800.log",
    ]
    const filtered = filterFaultlogsByBundle(names, "com.example.nonexistent")
    expect(filtered).toEqual(names)
  })
})

describe("jscrash-faultlogger sortFaultlogsByRecency", () => {
  test("sorts by timestamp descending (newest first)", () => {
    const names = [
      "jscrash-com.example.app-1704067200.log",
      "jscrash-com.example.app-1704074400.log",
      "jscrash-com.example.app-1704070800.log",
    ]
    const sorted = sortFaultlogsByRecency(names)
    expect(sorted[0]).toBe("jscrash-com.example.app-1704074400.log")
    expect(sorted[1]).toBe("jscrash-com.example.app-1704070800.log")
    expect(sorted[2]).toBe("jscrash-com.example.app-1704067200.log")
  })

  test("places entries with timestamps before entries without", () => {
    const names = [
      "invalid-name.log",
      "jscrash-com.example.app-1704067200.log",
    ]
    const sorted = sortFaultlogsByRecency(names)
    expect(sorted[0]).toBe("jscrash-com.example.app-1704067200.log")
    expect(sorted[1]).toBe("invalid-name.log")
  })

  test("sorts by name when timestamps are equal or missing", () => {
    const names = [
      "jscrash-b-1704067200.log",
      "jscrash-a-1704067200.log",
    ]
    const sorted = sortFaultlogsByRecency(names)
    expect(sorted[0]).toBe("jscrash-b-1704067200.log")
    expect(sorted[1]).toBe("jscrash-a-1704067200.log")
  })
})

describe("jscrash-faultlogger selectWithinMaxAge", () => {
  test("filters logs within time window", () => {
    const now = 1704080000000
    const names = [
      "jscrash-com.example.app-1704079000.log",
      "jscrash-com.example.app-1704077000.log",
      "jscrash-com.example.app-1704060000.log",
    ]
    const filtered = selectWithinMaxAge(names, 60, now)
    expect(filtered.length).toBe(2)
  })

  test("returns all logs when maxAgeMinutes is 0", () => {
    const names = ["jscrash-com.example.app-1704067200.log"]
    const filtered = selectWithinMaxAge(names, 0, Date.now())
    expect(filtered).toEqual(names)
  })

  test("returns all logs when maxAgeMinutes is negative", () => {
    const names = ["jscrash-com.example.app-1704067200.log"]
    const filtered = selectWithinMaxAge(names, -10, Date.now())
    expect(filtered).toEqual(names)
  })

  test("returns all logs when maxAgeMinutes is not finite", () => {
    const names = ["jscrash-com.example.app-1704067200.log"]
    const filtered = selectWithinMaxAge(names, NaN, Date.now())
    expect(filtered).toEqual(names)
  })

  test("includes entries without timestamps", () => {
    const now = 1704080000000
    const names = [
      "invalid-name.log",
      "jscrash-com.example.app-1704079000.log",
    ]
    const filtered = selectWithinMaxAge(names, 60, now)
    expect(filtered).toContain("invalid-name.log")
  })

  test("returns all logs when no entries match time window", () => {
    const now = 1704080000000
    const names = [
      "jscrash-com.example.app-1704060000.log",
    ]
    const filtered = selectWithinMaxAge(names, 1, now)
    expect(filtered).toEqual(names)
  })
})
