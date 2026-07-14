import { rmSync } from "node:fs"

type RemoveDirectory = typeof rmSync
type Report = (message: string) => void
const RETRYABLE_CODES = new Set(["EBUSY", "EMFILE", "ENFILE", "ENOTEMPTY", "EPERM"])

export function cleanupTestRoot(
  dir: string,
  remove: RemoveDirectory = rmSync,
  report: Report = (message) => process.stderr.write(message),
) {
  Bun.gc(true)
  try {
    remove(dir, { recursive: true, force: true, maxRetries: 30, retryDelay: 100 })
  } catch (error) {
    const code = errorCode(error)
    if (!code || !RETRYABLE_CODES.has(code)) throw error
    const message = error instanceof Error ? error.message : String(error)
    report(`[opencode-test] failed to remove ${dir} after retries (${code}): ${message}\n`)
  }
}

function errorCode(error: unknown) {
  if (!(error instanceof Error) || !("code" in error)) return undefined
  return typeof error.code === "string" ? error.code : undefined
}
