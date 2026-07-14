import fs from "fs"
import path from "path"
import { Global } from "@opencode-ai/core/global"
import { InstallationVersion } from "@opencode-ai/core/installation/version"

const flagFile = path.join(Global.Path.log, ".running")

interface FlagContent {
  pid: number
  startTime: string
  version: string
  uploadFailed?: boolean
}

let crashedFlag: FlagContent | undefined

/**
 * Called at startup. Reads the old crash flag (if any), then IMMEDIATELY
 * writes a fresh flag file — synchronously, before any async work — so
 * cleanupOnExit() can always delete it.
 *
 * If a crash is detected, the info is stored for the TUI to consume
 * via consumeCrashInfo() and show the collect dialog.
 */
export async function checkOnStartup(): Promise<void> {
  // 1. Read old flag synchronously (before overwriting)
  try {
    if (fs.existsSync(flagFile)) {
      crashedFlag = JSON.parse(fs.readFileSync(flagFile, "utf-8")) as FlagContent
    }
  } catch {}

  // 2. Write fresh flag IMMEDIATELY (synchronous, before any async work)
  //    Preserve uploadFailed so cleanupOnExit won't delete the flag
  //    if a previous upload failed.
  writeFlag(crashedFlag?.uploadFailed ? { uploadFailed: true } : undefined)
}

/** Consume crash info (if any). Returns undefined after first call. */
export function consumeCrashInfo(): FlagContent | undefined {
  const info = crashedFlag
  crashedFlag = undefined
  return info
}

/** Mark the flag file as upload failed — cleanupOnExit will preserve it. */
export function markUploadFailed(): void {
  try {
    if (fs.existsSync(flagFile)) {
      const flag = JSON.parse(fs.readFileSync(flagFile, "utf-8")) as FlagContent
      flag.uploadFailed = true
      fs.writeFileSync(flagFile, JSON.stringify(flag, null, 2))
    }
  } catch {}
}

/** Clear upload failed status — cleanupOnExit can safely delete the flag. */
export function clearUploadFailed(): void {
  try {
    if (fs.existsSync(flagFile)) {
      const flag = JSON.parse(fs.readFileSync(flagFile, "utf-8")) as FlagContent
      delete flag.uploadFailed
      fs.writeFileSync(flagFile, JSON.stringify(flag, null, 2))
    }
  } catch {}
}

function writeFlag(overrides?: Partial<FlagContent>): void {
  try {
    const flag: FlagContent = {
      pid: process.pid,
      startTime: new Date().toISOString(),
      version: InstallationVersion,
      ...overrides,
    }
    fs.writeFileSync(flagFile, JSON.stringify(flag, null, 2))
  } catch {}
}

/**
 * Called on normal exit. Removes the flag file so the next startup
 * knows the previous run ended cleanly.
 * If the flag file contains uploadFailed=true, keep it so the next
 * startup can show the collect dialog again.
 */
export function cleanupOnExit(): void {
  try {
    if (fs.existsSync(flagFile)) {
      const flag = JSON.parse(fs.readFileSync(flagFile, "utf-8")) as FlagContent
      if (flag.uploadFailed === true) {
        return
      }
    }
    fs.rmSync(flagFile, { force: true })
  } catch {
    try {
      fs.rmSync(flagFile, { force: true })
    } catch {}
  }
}
