import path from "node:path"
import stripAnsi from "strip-ansi"
import { cliEntry, opencodeRoot } from "./env"

export type LongRunningProcess = ReturnType<typeof spawnCliProcess>

export type ProcessReaders = ReturnType<typeof startProcessReaders>

export function spawnCliProcess(args: string[], opts: { cwd: string; env: Record<string, string | undefined> }) {
  return Bun.spawn(
    [
      process.execPath,
      "run",
      "--preload",
      path.join(opencodeRoot, "node_modules", "@opentui", "solid", "scripts", "preload.ts"),
      "--conditions=browser",
      cliEntry,
      ...args,
    ],
    { cwd: opts.cwd, env: opts.env, stdin: "ignore", stdout: "pipe", stderr: "pipe" },
  )
}

export function startProcessReaders(proc: LongRunningProcess) {
  const stdout = readStream(proc.stdout as ReadableStream<Uint8Array>)
  const stderr = readStream(proc.stderr as ReadableStream<Uint8Array>)
  return {
    stdout: stdout.output,
    stderr: stderr.output,
    done: Promise.all([stdout.done, stderr.done]),
  }
}

function readStream(stream: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder()
  let output = ""
  const reader = stream.getReader()
  const done = (async () => {
    while (true) {
      const item = await reader.read()
      if (item.done) break
      output += decoder.decode(item.value, { stream: true })
    }
    output += decoder.decode()
  })()
  return { output: () => output, done }
}

export async function waitForOutputPattern(
  proc: LongRunningProcess,
  getStdout: () => string,
  pattern: RegExp,
  timeoutMs: number,
  getStderr?: () => string,
): Promise<RegExpMatchArray> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const clean = stripAnsi(getStdout())
    const match = clean.match(pattern)
    if (match) return match
    if (proc.exitCode !== null) {
      throw new Error(`Process exited before pattern matched (code ${proc.exitCode})${processOutput(clean, getStderr)}`)
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`Pattern not found within ${timeoutMs}ms${processOutput(stripAnsi(getStdout()), getStderr)}`)
}

function processOutput(stdout: string, getStderr?: () => string) {
  return `\nstdout: ${stdout}\nstderr: ${stripAnsi(getStderr?.() ?? "")}`
}

export async function stopLongRunningProcess(proc: LongRunningProcess | undefined) {
  if (!proc || proc.exitCode !== null) return proc?.exitCode ?? null
  proc.kill()
  const exitCode = await waitForProcessExit(proc, 5000)
  if (exitCode !== undefined) return exitCode
  proc.kill(9)
  const forcedExitCode = await waitForProcessExit(proc, 5000)
  if (forcedExitCode !== undefined) return forcedExitCode
  throw new Error("Process did not exit after forced termination")
}

export async function waitForProcessExit(proc: LongRunningProcess, timeoutMs: number) {
  if (proc.exitCode !== null) return proc.exitCode
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      proc.exited,
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function waitForReadersDone(done: Promise<unknown>, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      done,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Process output streams did not close")), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
