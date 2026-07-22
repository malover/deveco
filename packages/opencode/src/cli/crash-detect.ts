import fs from 'fs';
import path from 'path';
import { Global } from '@opencode-ai/core/global';
import { InstallationVersion } from '@opencode-ai/core/installation/version';

const RUNNING_PREFIX = '.running-';
const logDir = Global.Path.log;
const kvPath = path.join(Global.Path.state, 'kv.json');
const ownFlagFile = path.join(logDir, `${RUNNING_PREFIX}${process.pid}`);

interface FlagContent {
  pid: number
  startTime: string
  version: string
}

let crashedFlagFiles: string[] = [];

/** Check if a process with the given PID is still alive (cross-platform). */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Scan all .running-* files in the log directory. */
function scanRunningFiles(): string[] {
  try {
    if (!fs.existsSync(logDir)) {
      return [];
    }
    return fs
      .readdirSync(logDir)
      .filter((f) => f.startsWith(RUNNING_PREFIX))
      .map((f) => path.join(logDir, f));
  } catch {
    return [];
  }
}

/** Read crash_upload_enabled from kv.json (default: true). */
function isCrashUploadEnabled(): boolean {
  try {
    if (!fs.existsSync(kvPath)) {
      return true;
    }
    const kv = JSON.parse(fs.readFileSync(kvPath, 'utf-8')) as Record<string, unknown>;
    return kv?.crash_upload_enabled !== false;
  } catch {
    return true;
  }
}

/** Detect crashed flags by scanning .running-* files for dead PIDs. Returns truthy if a crash was found. */
export function detectCrashedFlag(): boolean {
  if (!isCrashUploadEnabled()) {
    return false;
  }

  for (const file of scanRunningFiles()) {
    if (file === ownFlagFile) {
      continue;
    }
    const pid = Number(path.basename(file).substring(RUNNING_PREFIX.length));
    if (!Number.isFinite(pid) || !isProcessAlive(pid)) {
      crashedFlagFiles.push(file);
    }
  }
  return crashedFlagFiles.length > 0;
}

/**
 * Called at startup. Writes own .running-{pid} flag file.
 * Crash detection is deferred to consumeCrashInfo() to avoid timing issues
 * with async operations in the startup middleware.
 */
export async function checkOnStartup(): Promise<void> {
  if (!isCrashUploadEnabled()) {
    return;
  }
  writeFlag();

}

/** Delete all crashed flag files (except own) — called after successful upload. */
export function deleteCrashedFlag(): void {
  for (const file of crashedFlagFiles) {
    if (file === ownFlagFile) {
      continue;
    }
    try {
      fs.rmSync(file, { force: true });
    } catch {}
  }
  crashedFlagFiles = [];
}

function writeFlag(): void {
  try {
    const flag: FlagContent = {
      pid: process.pid,
      startTime: new Date().toISOString(),
      version: InstallationVersion,
    };
    fs.writeFileSync(ownFlagFile, JSON.stringify(flag, null, 2));
  } catch {}
}

/**
 * Called on normal exit. Removes only own .running-{pid} file.
 * Crashed process's flag files are left untouched (they're handled by
 * deleteCrashedFlag after upload, or detected again on next startup).
 */
export function cleanupOnExit(): void {
  try {
    fs.rmSync(ownFlagFile, { force: true });
  } catch {}
}
