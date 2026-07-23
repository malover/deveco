import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import path from "node:path"

let fsStatBehavior: (filePath: string) => Promise<{ isDirectory: () => boolean }>
let fsAccessBehavior: (filePath: string) => Promise<void>

interface MockStream {
  setEncoding: () => void
  on: (event: string, handler: (data: string) => void) => void
}

interface MockProcess {
  stdout: MockStream
  stderr: MockStream
  on: (event: string, handler: (arg: Error | number | null) => void) => void
}

let spawnBehavior: () => MockProcess

function fsStatMock(filePath: string) {
  return fsStatBehavior(filePath)
}

function fsAccessMock(filePath: string) {
  return fsAccessBehavior(filePath)
}

function spawnMock() {
  return spawnBehavior()
}

const fsMockObj = { stat: fsStatMock, access: fsAccessMock }
void mock.module("node:fs/promises", () => ({ ...fsMockObj, default: fsMockObj }))
void mock.module("node:child_process", () => ({ spawn: spawnMock }))

interface HdcModule {
  targetArgs: (deviceId?: string) => string[]
  resolveHdcBinary: () => Promise<{ hdc: string; home: string; error: string }>
  resolveHdcOrThrow: () => Promise<string>
  runHdc: (cmd: string[]) => Promise<{ stdout: string; stderr: string; exitCode: number }>
}

const { targetArgs, resolveHdcBinary, resolveHdcOrThrow, runHdc } = (await import(
  "../../resources/skills/arkts-runtime-fix/scripts/shared/hdc.mjs"
)) as HdcModule

const HOME = "C:\\TestDevEco"
const HDC_BIN = path.join(
  HOME,
  "sdk",
  "default",
  "openharmony",
  "toolchains",
  process.platform === "win32" ? "hdc.exe" : "hdc",
)

let savedDevEcoHome: string | undefined

beforeEach(() => {
  savedDevEcoHome = process.env.DEVECO_HOME
  process.env.DEVECO_HOME = HOME
  fsStatBehavior = () => Promise.resolve({ isDirectory: () => true })
  fsAccessBehavior = () => Promise.resolve()
  spawnBehavior = () => createMockProcess({ exitCode: 0 })
})

afterEach(() => {
  if (savedDevEcoHome !== undefined) process.env.DEVECO_HOME = savedDevEcoHome
  else delete process.env.DEVECO_HOME
  fsStatBehavior = () => Promise.resolve({ isDirectory: () => true })
  fsAccessBehavior = () => Promise.resolve()
  spawnBehavior = () => createMockProcess({ exitCode: 0 })
})

function createMockProcess(options: {
  stdoutData?: string
  stderrData?: string
  exitCode?: number | null
  spawnError?: Error
}): MockProcess {
  const stdoutListeners: Record<string, Array<(data: string) => void>> = {}
  const stderrListeners: Record<string, Array<(data: string) => void>> = {}
  const procListeners: Record<string, Array<(arg: Error | number | null) => void>> = {}

  const proc: MockProcess = {
    stdout: {
      setEncoding: () => {},
      on: (event, handler) => {
        (stdoutListeners[event] ??= []).push(handler)
      },
    },
    stderr: {
      setEncoding: () => {},
      on: (event, handler) => {
        (stderrListeners[event] ??= []).push(handler)
      },
    },
    on: (event, handler) => {
      (procListeners[event] ??= []).push(handler)
    },
  }

  queueMicrotask(() => {
    if (options.spawnError) {
      procListeners.error?.forEach((h) => h(options.spawnError!))
      return
    }
    if (options.stdoutData) stdoutListeners.data?.forEach((h) => h(options.stdoutData!))
    if (options.stderrData) stderrListeners.data?.forEach((h) => h(options.stderrData!))
    procListeners.close?.forEach((h) => h(options.exitCode ?? null))
  })

  return proc
}

describe("targetArgs", () => {
  test("should return ['-t', deviceId] when deviceId is provided", () => {
    expect(targetArgs("device-abc")).toEqual(["-t", "device-abc"])
  })

  test("should return empty array when deviceId is undefined or empty string", () => {
    expect(targetArgs(undefined)).toEqual([])
    expect(targetArgs("")).toEqual([])
  })
})

describe("resolveHdcBinary", () => {
  test("should return error message when DEVECO_HOME is unset", async () => {
    delete process.env.DEVECO_HOME
    const result = await resolveHdcBinary()
    expect(result).toEqual({
      hdc: "",
      home: "",
      error: "DevEco Studio path not found. Set DEVECO_HOME and retry.",
    })
  })

  test("should return error with hdc path when hdc binary does not exist", async () => {
    fsAccessBehavior = (filePath) => {
      if (filePath === HDC_BIN) return Promise.reject(new Error("ENOENT"))
      return Promise.resolve()
    }
    const result = await resolveHdcBinary()
    expect(result.error).toBe(`hdc not found: ${HDC_BIN}`)
    expect(result.hdc).toBe("")
    expect(result.home).toBe(HOME)
  })

  test("should return resolved hdc path and home when both are found", async () => {
    const result = await resolveHdcBinary()
    expect(result).toEqual({ hdc: HDC_BIN, home: HOME, error: "" })
  })
})

describe("resolveHdcOrThrow", () => {
  test("should throw error when hdc resolution fails", async () => {
    delete process.env.DEVECO_HOME
    expect(resolveHdcOrThrow()).rejects.toThrow("DevEco Studio path not found")
  })

  test("should return hdc path when resolved successfully", async () => {
    const hdc = await resolveHdcOrThrow()
    expect(hdc).toBe(HDC_BIN)
  })
})

describe("runHdc", () => {
  test("should return stdout and exitCode when process completes successfully", async () => {
    spawnBehavior = () => createMockProcess({ stdoutData: "device_abc\ndevice_def\n", exitCode: 0 })
    const result = await runHdc(["hdc", "list", "targets"])
    expect(result).toEqual({ stdout: "device_abc\ndevice_def\n", stderr: "", exitCode: 0 })
  })

  test("should return stderr and non-zero exitCode when process fails", async () => {
    spawnBehavior = () => createMockProcess({ stderrData: "connection refused", exitCode: 1 })
    const result = await runHdc(["hdc", "shell", "hilog"])
    expect(result).toEqual({ stdout: "", stderr: "connection refused", exitCode: 1 })
  })

  test("should default exitCode to 1 when close event receives null code", async () => {
    spawnBehavior = () => createMockProcess({ exitCode: null })
    const result = await runHdc(["hdc", "start"])
    expect(result.exitCode).toBe(1)
  })

  test("should return error message as stderr when spawn fails", async () => {
    spawnBehavior = () => createMockProcess({ spawnError: new Error("spawn hdc ENOENT") })
    const result = await runHdc(["hdc", "version"])
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toBe("spawn hdc ENOENT")
  })
})
