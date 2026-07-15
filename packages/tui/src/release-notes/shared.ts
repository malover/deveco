export interface ReleaseMeta {
  tag: string
  createdAt: string
  prerelease: boolean
}

export function formatDate(iso?: string): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
}

export function normalizeVersion(value: string | undefined): string | undefined {
  const text = value?.trim()
  if (!text) return undefined
  return text.startsWith("v") || text.startsWith("V") ? text.slice(1) : text
}

interface Semver {
  nums: [number, number, number, number]
  pre: string | undefined
}

/**
 * Parse a semver-like tag into numeric segments and an optional prerelease
 * suffix. Requires exactly three numeric segments (X.Y.Z) with an optional
 * fourth build segment. Returns `undefined` for tags that do not match.
 */
export function parseSemver(tag: string): Semver | undefined {
  const m = tag.match(/^v?(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?(?:-(.+))?$/)
  if (!m) return undefined
  return {
    nums: [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10), m[4] ? parseInt(m[4], 10) : 0],
    pre: m[5],
  }
}

/** Comparator: negative when `a` is newer (descending). Falls back to localeCompare for non-semver tags. */
export function compareTags(a: string, b: string): number {
  const pa = parseSemver(a)
  const pb = parseSemver(b)
  if (pa && pb) {
    for (let i = 0; i < 4; i++) {
      if (pa.nums[i] !== pb.nums[i]) return pb.nums[i] - pa.nums[i]
    }
    if (pa.pre === undefined && pb.pre === undefined) return 0
    if (pa.pre === undefined) return -1
    if (pb.pre === undefined) return 1
    return pb.pre.localeCompare(pa.pre, undefined, { numeric: true })
  }
  if (pa) return -1
  if (pb) return 1
  return b.localeCompare(a, undefined, { numeric: true })
}

/** Walk to the adjacent version (-1 = older, +1 = newer) in an ascending-sorted list. */
export function adjacentRelease(
  sortedAsc: ReleaseMeta[],
  tag: string,
  offset: -1 | 1,
): ReleaseMeta | undefined {
  const idx = sortedAsc.findIndex((r) => r.tag === tag)
  if (idx < 0) return undefined
  const target = idx + offset
  if (target < 0 || target >= sortedAsc.length) return undefined
  return sortedAsc[target]
}
