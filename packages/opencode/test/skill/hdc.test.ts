import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test"
import * as env from "../../src/tool/lib/env"

let mockFindDevEcoHomeResult: string | undefined = "/fake/deveco"
let mockHdcPathResult: string = "/fake/hdc"
let mockHdcFileExistsResult: boolean = true

const { targetArgs, resolveHdcBinary, resolveHdcOrThrow, runHdc } = await import(
  "../../resources/skills/arkts-runtime-fix/scripts/shared/hdc"
)

function resetMocks() {
  mockFindDevEcoHomeResult = "/fake/deveco"
  mockHdcPathResult = "/fake/hdc"
  mockHdcFileExistsResult = true
}

let envSpyFind: ReturnType<typeof spyOn> | undefined
let envSpyPath: ReturnType<typeof spyOn> | undefined

function setupEnvSpies() {
  envSpyFind = spyOn(env, "findDevEcoHome").mockImplementation(async () => mockFindDevEcoHomeResult)
  envSpyPath = spyOn(env, "hdcPath").mockImplementation((_home: string) => mockHdcPathResult)
}

function teardownEnvSpies() {
  envSpyFind?.mockRestore()
  envSpyPath?.mockRestore()
  envSpyFind = undefined
  envSpyPath = undefined
}

function setupFileSpy() {
  // @ts-expect-error Bun.file mock returns partial BunFile
  return spyOn(Bun, "file").mockImplementation((_path: string | URL) => ({
    exists: () => Promise.resolve(mockHdcFileExistsResult),
  }))
}

describe("targetArgs", () => {
  test("should return ['-t', deviceId] when deviceId is provided", () => {
    expect(targetArgs("device-abc")).toEqual(["-t", "device-abc"])
  })

  test("should return empty array for falsy deviceId values", () => {
    expect(targetArgs(undefined)).toEqual([])
    expect(targetArgs("")).toEqual([])
  })
})

describe("resolveHdcBinary", () => {
  let fileSpy: ReturnType<typeof spyOn>

  beforeEach(() => {
    resetMocks()
    setupEnvSpies()
    fileSpy = setupFileSpy()
  })

  afterEach(() => {
    teardownEnvSpies()
    fileSpy.mockRestore()
  })

  test("should return error when DevEco home is not found", async () => {
    mockFindDevEcoHomeResult = undefined
    const result = await resolveHdcBinary()
    expect(result.error).toContain("DevEco Studio path not found")
    expect(result.hdc).toBe("")
    expect(result.home).toBe("")
  })

  test("should return error when hdc binary does not exist", async () => {
    mockHdcFileExistsResult = false
    const result = await resolveHdcBinary()
    expect(result.error).toContain("hdc not found")
    expect(result.error).toContain(mockHdcPathResult)
    expect(result.hdc).toBe("")
    expect(result.home).toBe(mockFindDevEcoHomeResult!)
  })

  test("should return hdc path and home when hdc binary exists", async () => {
    mockFindDevEcoHomeResult = "/valid/deveco"
    mockHdcPathResult = "/valid/deveco/sdk/default/openharmony/toolchains/hdc"
    const result = await resolveHdcBinary()
    expect(result.hdc).toBe(mockHdcPathResult)
    expect(result.home).toBe(mockFindDevEcoHomeResult)
    expect(result.error).toBe("")
  })
})

describe("resolveHdcOrThrow", () => {
  let fileSpy: ReturnType<typeof spyOn>

  beforeEach(() => {
    resetMocks()
    setupEnvSpies()
    fileSpy = setupFileSpy()
  })

  afterEach(() => {
    teardownEnvSpies()
    fileSpy.mockRestore()
  })

  test("should throw when resolveHdcBinary returns error", async () => {
    mockFindDevEcoHomeResult = undefined
    expect(resolveHdcOrThrow()).rejects.toThrow("DevEco Studio path not found")
  })

  test("should return hdc path when resolved successfully", async () => {
    mockFindDevEcoHomeResult = "/valid/deveco"
    mockHdcPathResult = "/valid/hdc"
    const hdc = await resolveHdcOrThrow()
    expect(hdc).toBe(mockHdcPathResult)
  })
})

describe("runHdc", () => {
  let spawnSpy: ReturnType<typeof spyOn>

  function textToStream(text: string): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder()
    return new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(text))
        controller.close()
      },
    })
  }

  function mockSpawnResult(stdout: string, stderr: string, exitCode: number) {
    return {
      stdout: stdout ? textToStream(stdout) : undefined,
      stderr: stderr ? textToStream(stderr) : undefined,
      exited: Promise.resolve(exitCode),
    }
  }

  beforeEach(() => {
    resetMocks()
    spawnSpy = undefined as never
  })

  afterEach(() => {
    spawnSpy?.mockRestore()
  })

  test("should return stdout, stderr, and exitCode from spawned process", async () => {
    // @ts-expect-error Bun.spawn mock returns partial Subprocess
    spawnSpy = spyOn(Bun, "spawn").mockImplementation(() => mockSpawnResult("device_abc\ndevice_def\n", "", 0))

    const result = await runHdc(["hdc", "list", "targets"])
    expect(result.stdout).toBe("device_abc\ndevice_def\n")
    expect(result.stderr).toBe("")
    expect(result.exitCode).toBe(0)
  })

  test("should return stderr content when process fails", async () => {
    // @ts-expect-error Bun.spawn mock returns partial Subprocess
    spawnSpy = spyOn(Bun, "spawn").mockImplementation(() => mockSpawnResult("", "connection refused", 1))

    const result = await runHdc(["hdc", "shell", "hilog"])
    expect(result.stderr).toBe("connection refused")
    expect(result.exitCode).toBe(1)
  })

  test("should handle process with undefined stdout and stderr", async () => {
    // @ts-expect-error Bun.spawn mock returns partial Subprocess
    spawnSpy = spyOn(Bun, "spawn").mockImplementation(() => mockSpawnResult("", "", 2))

    const result = await runHdc(["hdc", "start"])
    expect(result.stdout).toBe("")
    expect(result.stderr).toBe("")
    expect(result.exitCode).toBe(2)
  })

  test("should spawn process with correct cmd and pipe options", async () => {
    // @ts-expect-error Bun.spawn mock returns partial Subprocess
    spawnSpy = spyOn(Bun, "spawn").mockImplementation(() => mockSpawnResult("ok", "", 0))

    await runHdc(["hdc", "-t", "device123", "shell", "hilog"])
    expect(spawnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        cmd: ["hdc", "-t", "device123", "shell", "hilog"],
        stdout: "pipe",
        stderr: "pipe",
      }),
    )
  })
})
