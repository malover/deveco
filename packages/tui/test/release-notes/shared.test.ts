// packages/tui/test/release-notes/shared.test.ts
import { describe, expect, test } from "bun:test"
import {
  adjacentRelease,
  compareTags,
  formatDate,
  normalizeVersion,
  parseSemver,
  type ReleaseMeta,
} from "../../src/release-notes/shared"

// ----------------------------------------------------------------------------
// Pure functions: formatDate / normalizeVersion / compareTags
// (Migrated from old store.test.ts — zero logic changes)
// ----------------------------------------------------------------------------

describe("formatDate", () => {
  test("returns empty string for undefined or empty input", () => {
    expect(formatDate(undefined)).toBe("")
    expect(formatDate("")).toBe("")
  })

  test("returns the input verbatim when it is not a parseable date", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date")
    expect(formatDate("2024-99-99")).toBe("2024-99-99")
  })

  test("formats a UTC timestamp as YYYY-MM-DD using UTC components", () => {
    expect(formatDate("2024-01-15T10:30:00Z")).toBe("2024-01-15")
    expect(formatDate("2024-06-07T23:59:00Z")).toBe("2024-06-07")
  })

  test("does not drift across days when the offset crosses a UTC boundary", () => {
    expect(formatDate("2024-06-07T00:00:00+08:00")).toBe("2024-06-06")
  })
})

describe("normalizeVersion", () => {
  test("returns undefined for empty / whitespace-only input", () => {
    expect(normalizeVersion(undefined)).toBe(undefined)
    expect(normalizeVersion("")).toBe(undefined)
    expect(normalizeVersion("   ")).toBe(undefined)
  })

  test("strips a leading v or V prefix", () => {
    expect(normalizeVersion("v1.2.3")).toBe("1.2.3")
    expect(normalizeVersion("V1.2.3")).toBe("1.2.3")
  })

  test("trims surrounding whitespace before stripping the prefix", () => {
    expect(normalizeVersion("  v1.2.3  ")).toBe("1.2.3")
  })

  test("leaves a tag without a v prefix untouched", () => {
    expect(normalizeVersion("1.2.3")).toBe("1.2.3")
  })
})

describe("parseSemver", () => {
  test("parses a standard X.Y.Z tag", () => {
    const r = parseSemver("1.2.3")
    expect(r).toEqual({ nums: [1, 2, 3, 0], pre: undefined })
  })

  test("accepts a leading v prefix", () => {
    const r = parseSemver("v1.2.3")
    expect(r).toEqual({ nums: [1, 2, 3, 0], pre: undefined })
  })

  test("parses a four-segment tag with the fourth segment in nums[3]", () => {
    const r = parseSemver("1.2.3.4")
    expect(r).toEqual({ nums: [1, 2, 3, 4], pre: undefined })
  })

  test("parses a prerelease suffix after a hyphen", () => {
    const r = parseSemver("1.2.3-rc1")
    expect(r).toEqual({ nums: [1, 2, 3, 0], pre: "rc1" })
  })

  test("parses a dotted prerelease suffix", () => {
    const r = parseSemver("1.2.3-beta.1")
    expect(r).toEqual({ nums: [1, 2, 3, 0], pre: "beta.1" })
  })

  test("parses four segments plus a prerelease suffix", () => {
    const r = parseSemver("1.2.3.4-rc1")
    expect(r).toEqual({ nums: [1, 2, 3, 4], pre: "rc1" })
  })

  test("returns undefined for a two-segment tag", () => {
    expect(parseSemver("1.2")).toBeUndefined()
  })

  test("returns undefined for a non-numeric tag", () => {
    expect(parseSemver("abc")).toBeUndefined()
  })

  test("returns undefined for an empty string", () => {
    expect(parseSemver("")).toBeUndefined()
  })

  test("parses large numeric segments by value", () => {
    const r = parseSemver("10.20.30")
    expect(r).toEqual({ nums: [10, 20, 30, 0], pre: undefined })
  })

  test("parses a tag with v prefix and prerelease", () => {
    const r = parseSemver("v2.0.0-alpha")
    expect(r).toEqual({ nums: [2, 0, 0, 0], pre: "alpha" })
  })
})

describe("compareTags", () => {
  test("orders semver tags in descending order", () => {
    expect(compareTags("1.2.3", "1.2.2")).toBeLessThan(0)
    expect(compareTags("1.2.2", "1.2.3")).toBeGreaterThan(0)
  })

  test("treats tags equal when only a v prefix differs", () => {
    expect(compareTags("v1.2.3", "1.2.3")).toBe(0)
    expect(compareTags("1.2.3", "1.2.3")).toBe(0)
  })

  test("compares numeric segments by value, not lexically", () => {
    expect(compareTags("1.10.0", "1.9.0")).toBeLessThan(0)
  })

  test("uses the fourth segment when present", () => {
    expect(compareTags("1.2.3.4", "1.2.3")).toBeLessThan(0)
    expect(compareTags("1.2.3.4", "1.2.3.5")).toBeGreaterThan(0)
  })

  test("ranks a release above its same-number prerelease", () => {
    expect(compareTags("1.2.3-rc1", "1.2.3")).toBeGreaterThan(0)
    expect(compareTags("1.2.3", "1.2.3-rc1")).toBeLessThan(0)
  })

  test("orders prereleases among themselves by pre-release string descending", () => {
    expect(compareTags("1.2.3-rc1", "1.2.3-rc2")).toBeGreaterThan(0)
    expect(compareTags("1.2.3-rc2", "1.2.3-rc1")).toBeLessThan(0)
  })

  test("orders multi-digit numeric prereleases by value, not lexically", () => {
    expect(compareTags("1.0.0-rc10", "1.0.0-rc2")).toBeLessThan(0)
    expect(compareTags("1.0.0-rc2", "1.0.0-rc10")).toBeGreaterThan(0)
    expect(compareTags("1.0.0-beta10", "1.0.0-beta9")).toBeLessThan(0)
    expect(compareTags("1.0.0-rc.10", "1.0.0-rc.9")).toBeLessThan(0)
  })

  test("ranks any semver above any non-semver", () => {
    expect(compareTags("1.0.0", "abc")).toBe(-1)
    expect(compareTags("abc", "1.0.0")).toBe(1)
  })

  test("falls back to descending string order for two non-semver tags", () => {
    expect(compareTags("abc", "def")).toBeGreaterThan(0)
    expect(compareTags("def", "abc")).toBeLessThan(0)
  })
})

// ----------------------------------------------------------------------------
// Navigation helpers: prevRelease / nextRelease
// These back the p/n keyboard shortcuts in the release notes content dialog.
// Both helpers expect the caller to pass a list already sorted ascending
// (oldest → newest); the content component computes that list once per render
// via createMemo and shares it between prev and next.
// ----------------------------------------------------------------------------

describe("release notes navigation", () => {
  const makeRelease = (tag: string): ReleaseMeta => ({
    tag,
    createdAt: "",
    prerelease: tag.includes("-"),
  })

  // Three-tag fixture in ascending order (oldest → newest) — matches the
  // shape the content dialog passes to adjacentRelease.
  const threeAsc = [makeRelease("v0.1.1"), makeRelease("v0.1.2-rc1"), makeRelease("v0.2.0")]

  test("adjacentRelease with offset -1 walks to the older version, or undefined at the oldest", () => {
    expect(adjacentRelease(threeAsc, "v0.2.0", -1)?.tag).toBe("v0.1.2-rc1")
    expect(adjacentRelease(threeAsc, "v0.1.2-rc1", -1)?.tag).toBe("v0.1.1")
    expect(adjacentRelease(threeAsc, "v0.1.1", -1)).toBeUndefined()
  })

  test("adjacentRelease with offset +1 walks to the newer version, or undefined at the newest", () => {
    expect(adjacentRelease(threeAsc, "v0.1.1", 1)?.tag).toBe("v0.1.2-rc1")
    expect(adjacentRelease(threeAsc, "v0.1.2-rc1", 1)?.tag).toBe("v0.2.0")
    expect(adjacentRelease(threeAsc, "v0.2.0", 1)).toBeUndefined()
  })

  test("adjacentRelease returns undefined for an unknown tag", () => {
    expect(adjacentRelease(threeAsc, "v99.0.0", -1)).toBeUndefined()
    expect(adjacentRelease(threeAsc, "v99.0.0", 1)).toBeUndefined()
  })

  test("single release has no neighbors in either direction", () => {
    const single = [makeRelease("v1.0.0")]
    expect(adjacentRelease(single, "v1.0.0", -1)).toBeUndefined()
    expect(adjacentRelease(single, "v1.0.0", 1)).toBeUndefined()
  })

  test("empty releases array is safe", () => {
    expect(adjacentRelease([], "v1.0.0", -1)).toBeUndefined()
    expect(adjacentRelease([], "v1.0.0", 1)).toBeUndefined()
  })
})

// ----------------------------------------------------------------------------
// bundled.ts: CHANGELOG.md parsing (runtime file read)
// ----------------------------------------------------------------------------

describe("bundled parser", () => {
  // The bundled module now reads CHANGELOG.md from disk asynchronously.
  // The file must exist at CHANGELOG.md (project root) for
  // these tests to run.
  let data: Awaited<ReturnType<typeof import("../../src/release-notes/bundled").loadChangelog>>

  test("module loads without error", async () => {
    const { loadChangelog } = await import("../../src/release-notes/bundled")
    data = await loadChangelog()
    expect(data).not.toBeNull()
    expect(typeof data!.getBody).toBe("function")
  })

  test("returns an array of releases sorted descending", async () => {
    const releases = data!.releases
    expect(Array.isArray(releases)).toBe(true)
    expect(releases.length).toBeGreaterThanOrEqual(1)
    if (releases.length >= 2) {
      for (let i = 0; i < releases.length - 1; i++) {
        expect(compareTags(releases[i].tag, releases[i + 1].tag)).toBeLessThanOrEqual(0)
      }
    }
  })

  test("each release has required fields", async () => {
    const releases = data!.releases
    for (const r of releases) {
      expect(typeof r.tag).toBe("string")
      expect(r.tag.length).toBeGreaterThan(0)
      expect(typeof r.createdAt).toBe("string")
      expect(typeof r.prerelease).toBe("boolean")
    }
  })

  test("getBody returns a string for a known tag", async () => {
    const releases = data!.releases
    if (releases.length > 0) {
      const body = data!.getBody(releases[0].tag)
      expect(typeof body).toBe("string")
      expect(body!.length).toBeGreaterThan(0)
    }
  })

  test("getBody returns null for an unknown tag", async () => {
    expect(data!.getBody("v99.99.99")).toBe(null)
    expect(data!.getBody("nonexistent")).toBe(null)
  })
})
