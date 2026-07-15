import fs from "fs"
import path from "path"
import { Global } from "@opencode-ai/core/global"
import { InstallationVersion } from "@opencode-ai/core/installation/version"

const logDir = Global.Path.log
const ownFlagFile = path.join(logDir, `.running-${process.pid}`)

interface FlagContent {
  pid: number
  startTime: string
  version: string
}

let crashedFlag: FlagContent | undefined
let crashedFlagFile: string | undefined

/** Check if a process with the given PID is still alive (cross-platform). */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** Scan all .running-* files in the log directory. */
function scanRunningFiles(): string[] {
  try {
    if (!fs.existsSync(logDir)) return []
    return fs
      .readdirSync(logDir)
      .filter((f) => f.startsWith(".running-"))
      .map((f) => path.join(logDir, f))
  } catch {
    return []
  }
}

/**
 * Called at startup. Scans all .running-* files for dead PIDs (crash detection),
 * then writes own .running-{pid} file.
 *
 * If a crash is detected (a .running-* file with a dead PID), the info is stored
 * for the TUI to consume via consumeCrashInfo() and show the collect dialog.
 */
export async function checkOnStartup(): Promise<void> {
  // 1. Scan all .running-* files for dead PIDs
  for (const file of scanRunningFiles()) {
    try {
      const flag = JSON.parse(fs.readFileSync(file, "utf-8")) as FlagContent
      if (!isProcessAlive(flag.pid)) {
        crashedFlag = flag
        crashedFlagFile = file
        break // handle one crash at a time
      }
    } catch {}
  }

  // 2. Write own flag file IMMEDIATELY (synchronous, before any async work)
  writeFlag()
}

/** Consume crash info (if any). Returns undefined after first call. */
export function consumeCrashInfo(): FlagContent | undefined {
  const info = crashedFlag
  crashedFlag = undefined
  return info
}

/** Delete the crashed process's flag file — called after successful upload. */
export function deleteCrashedFlag(): void {
  if (crashedFlagFile) {
    try {
      fs.rmSync(crashedFlagFile, { force: true })
    } catch {}
    crashedFlagFile = undefined
  }
}

function writeFlag(): void {
  try {
    const flag: FlagContent = {
      pid: process.pid,
      startTime: new Date().toISOString(),
      version: InstallationVersion,
    }
    fs.writeFileSync(ownFlagFile, JSON.stringify(flag, null, 2))
  } catch {}
}

/**
 * Called on normal exit. Removes only own .running-{pid} file.
 * Crashed process's flag files are left untouched (they're handled by
 * deleteCrashedFlag after upload, or detected again on next startup).
 */
export function cleanupOnExit(): void {
  try {
    fs.rmSync(ownFlagFile, { force: true })
  } catch {}
}
