import path from "path"
import { describe, expect, test } from "bun:test"
import { Effect, Layer, Stream } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import {
  Event,
  Installation,
  UpgradeFailedError,
  USER_AGENT,
  getReleaseType,
  type ReleaseType,
  isLocal,
  isPreview,
  userAgent,
} from "../../src/installation"
import { InstallationChannel, InstallationVersion } from "@opencode-ai/core/installation/version"
import { AppProcess } from "@opencode-ai/core/process"
import { testEffect } from "../lib/effect"

const encoder = new TextEncoder()
const sink = { [Symbol.for("effect/Sink/TypeId")]: Symbol.for("effect/Sink/TypeId") } as any

function mockHttpClient(handler: (request: HttpClientRequest.HttpClientRequest) => Response) {
  const client = HttpClient.make((request) => Effect.succeed(HttpClientResponse.fromWeb(request, handler(request))))
  return Layer.succeed(HttpClient.HttpClient, client)
}

function mockSpawner(
  handler: (cmd: string, args: readonly string[]) => string | { code: number; stdout?: string; stderr?: string } = () =>
    "",
) {
  const spawner = ChildProcessSpawner.make((command) => {
    const std = ChildProcess.isStandardCommand(command) ? command : undefined
    const result = handler(std?.command ?? "", std?.args ?? [])
    const output = typeof result === "string" ? { code: 0, stdout: result, stderr: "" } : result
    return Effect.succeed(
      ChildProcessSpawner.makeHandle({
        pid: ChildProcessSpawner.ProcessId(0),
        exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(output.code)),
        isRunning: Effect.succeed(false),
        kill: () => Effect.void,
        stdin: { [Symbol.for("effect/Sink/TypeId")]: Symbol.for("effect/Sink/TypeId") } as any,
        stdout: output.stdout ? Stream.make(encoder.encode(output.stdout)) : Stream.empty,
        stderr: output.stderr ? Stream.make(encoder.encode(output.stderr)) : Stream.empty,
        all: Stream.empty,
        getInputFd: () => sink,
        getOutputFd: () => Stream.empty,
        unref: Effect.succeed(Effect.void),
      }),
    )
  })
  return Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner)
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

function testLayer(
  httpHandler: (request: HttpClientRequest.HttpClientRequest) => Response,
  spawnHandler?: (cmd: string, args: readonly string[]) => string | { code: number; stdout?: string; stderr?: string },
) {
  const appProcess = AppProcess.layer.pipe(Layer.provide(mockSpawner(spawnHandler)))
  return Installation.layer.pipe(Layer.provide(mockHttpClient(httpHandler)), Layer.provide(appProcess))
}

describe("installation", () => {
  describe("getReleaseType", () => {
    test.each([
      ["1.0.0", "2.0.0", "major"],
      ["1.0.0", "1.1.0", "minor"],
      ["1.0.0", "1.0.5", "patch"],
      ["1.0.0", "1.0.0", "patch"],
      ["2.0.0", "1.0.0", "patch"],
      ["1.5.0", "1.3.0", "patch"],
    ])("getReleaseType(%s -> %s) is %s", (current, latest, expected) => {
      expect(getReleaseType(current, latest)).toBe(expected as ReleaseType)
    })
  })

  describe("userAgent", () => {
    test("formats the channel, version and client", () => {
      expect(userAgent()).toBe(`opencode/${InstallationChannel}/${InstallationVersion}/cli`)
      expect(userAgent("tui")).toBe(`opencode/${InstallationChannel}/${InstallationVersion}/tui`)
    })

    test("USER_AGENT is the default (cli) user agent", () => {
      expect(USER_AGENT).toBe(userAgent())
    })
  })

  describe("channel helpers", () => {
    test("isPreview is true unless running on the latest channel", () => {
      expect(isPreview()).toBe(InstallationChannel !== "latest")
    })

    test("isLocal is true only on the local channel", () => {
      expect(isLocal()).toBe(InstallationChannel === "local")
    })
  })

  test("UpgradeFailedError carries stderr and is tagged", () => {
    const err = new UpgradeFailedError({ stderr: "boom" })
    expect(err.stderr).toBe("boom")
    expect(err._tag).toBe("UpgradeFailedError")
  })

  test("Event defines the updated and update-available events", () => {
    expect(Event.Updated.type).toBe("installation.updated")
    expect(Event.UpdateAvailable.type).toBe("installation.update-available")
  })

  describe("Service.latest", () => {
    let latestUrl = ""
    testEffect(
      testLayer((request) => {
        latestUrl = request.url
        return jsonResponse({ version: "1.2.3" })
      }),
    ).effect("reads the latest version from the deveco npm registry", () =>
      Effect.gen(function* () {
        const result = yield* Installation.use.latest("npm")
        expect(result).toBe("1.2.3")
        expect(latestUrl).toContain("@deveco%2fdeveco-code")
        expect(latestUrl).toContain(`/${InstallationChannel}`)
      }),
    )
    let tagsUrl = ""
    testEffect(testLayer((request) => {
      tagsUrl = request.url
      if (request.url.includes("/tags")) {
        return jsonResponse([
          { name: "v0.1.3" },
          { name: "v0.1.2" },
          { name: "v0.1.1" },
          { name: "v0.1.0" },
          { name: "some-non-version-tag" },
        ])
      }
      return jsonResponse({ version: "1.2.3" })
    })).effect("reads the latest version from GitCode tags API for curl installs", () =>
      Effect.gen(function* () {
        const result = yield* Installation.use.latest("curl")
        expect(result).toBe("0.1.3")
        expect(tagsUrl).toContain("gitcode.com/api/v5/repos")
        expect(tagsUrl).toContain("openharmony-sig/deveco-code")
        expect(tagsUrl).toContain("/tags")
      }),
    )

    let irmTagsUrl = ""
    testEffect(testLayer((request) => {
      irmTagsUrl = request.url
      if (request.url.includes("/tags")) {
        return jsonResponse([
          { name: "v0.1.3" },
          { name: "v0.1.2" },
          { name: "v0.1.1" },
          { name: "v0.1.0" },
          { name: "some-non-version-tag" },
        ])
      }
      return jsonResponse({ version: "1.2.3" })
    })).effect("reads the latest version from GitCode tags API for irm installs", () =>
      Effect.gen(function* () {
        const result = yield* Installation.use.latest("irm")
        expect(result).toBe("0.1.3")
        expect(irmTagsUrl).toContain("/tags")
      }),
    )

    testEffect(testLayer(() => jsonResponse([{ name: "release-candidate" }, { name: "nightly" }]))).effect(
      "fails when GitCode has no semver version tags for curl installs",
      () =>
        Effect.gen(function* () {
          const exit = yield* Installation.use.latest("curl").pipe(Effect.exit)
          expect(exit._tag).toBe("Failure")
        }),
    )
  })

  describe("Service.method", () => {
    testEffect(
      testLayer(
        () => jsonResponse({}),
        (cmd) => (cmd === "npm" ? "@deveco/deveco-code" : ""),
      ),
    ).effect("detects npm when the global npm list contains the deveco package", () =>
      Effect.gen(function* () {
        expect(yield* Installation.use.method()).toBe("npm")
      }),
    )

    testEffect(
      testLayer(
        () => jsonResponse({}),
        (cmd) => (cmd === "pnpm" ? "@deveco/deveco-code" : ""),
      ),
    ).effect("detects pnpm when the global pnpm list contains the deveco package", () =>
      Effect.gen(function* () {
        expect(yield* Installation.use.method()).toBe("pnpm")
      }),
    )

    testEffect(
      testLayer(
        () => jsonResponse({}),
        (cmd) => (cmd === "bun" ? "@deveco/deveco-code" : ""),
      ),
    ).effect("detects bun when the global bun list contains the deveco package", () =>
      Effect.gen(function* () {
        expect(yield* Installation.use.method()).toBe("bun")
      }),
    )

    testEffect(testLayer(() => jsonResponse({}), () => "")).effect(
      "does not false-positive curl when execPath is not a .deveco/bin path",
      () =>
        Effect.gen(function* () {
          const method = yield* Installation.use.method()
          expect(method).not.toBe("curl")
        }),
    )

    testEffect(testLayer(() => jsonResponse({}), () => "")).effect(
      "detects curl when execPath contains .deveco/bin",
      () =>
        Effect.gen(function* () {
          const original = process.execPath
          const originalPlatform = process.platform
          try {
            Object.defineProperty(process, "execPath", {
              // Use path.join so the separator matches what path.join(".deveco","bin")
              // produces on the current platform (backslash on win32, forward on POSIX).
              value: path.join("/home/testuser", ".deveco", "bin", "deveco"),
              configurable: true,
            })
            Object.defineProperty(process, "platform", { value: "linux", configurable: true })
            const method = yield* Installation.use.method()
            expect(method).toBe("curl")
          } finally {
            Object.defineProperty(process, "execPath", { value: original, configurable: true })
            Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true })
          }
        }),
    )

    testEffect(testLayer(() => jsonResponse({}), () => "")).effect(
      "detects irm when execPath is a Windows .deveco\\bin path",
      () =>
        Effect.gen(function* () {
          const original = process.execPath
          const originalPlatform = process.platform
          try {
            // Use path.join to build a platform-correct mock path so the
            // separator matches what path.join(".deveco","bin") produces on
            // the current platform (backslash on win32, forward slash on POSIX).
            Object.defineProperty(process, "execPath", {
              value: path.join("C:", "Users", "testuser", ".deveco", "bin", "deveco.exe"),
              configurable: true,
            })
            Object.defineProperty(process, "platform", { value: "win32", configurable: true })
            const method = yield* Installation.use.method()
            expect(method).toBe("irm")
          } finally {
            Object.defineProperty(process, "execPath", { value: original, configurable: true })
            Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true })
          }
        }),
    )

    testEffect(
      testLayer(
        () => jsonResponse({}),
        () => "",
      ),
    ).effect("falls back to unknown when no manager reports the package", () =>
      Effect.gen(function* () {
        expect(yield* Installation.use.method()).toBe("unknown")
      }),
    )
  })

  describe("Service.upgrade", () => {
    const npmCalls: Array<{ cmd: string; args: readonly string[] }> = []
    testEffect(
      testLayer(
        () => jsonResponse({}),
        (cmd, args) => {
          npmCalls.push({ cmd, args })
          return ""
        },
      ),
    ).effect("runs `npm install -g @deveco/deveco-code@<target>` to upgrade", () =>
      Effect.gen(function* () {
        yield* Installation.use.upgrade("npm", "1.2.3")
        expect(
          npmCalls.some(
            (c) => c.cmd === "npm" && c.args.includes("install") && c.args.includes("@deveco/deveco-code@1.2.3"),
          ),
        ).toBe(true)
      }),
    )

    const pnpmCalls: Array<{ cmd: string; args: readonly string[] }> = []
    testEffect(
      testLayer(
        () => jsonResponse({}),
        (cmd, args) => {
          pnpmCalls.push({ cmd, args })
          return ""
        },
      ),
    ).effect("uses the pnpm package manager for the pnpm method", () =>
      Effect.gen(function* () {
        yield* Installation.use.upgrade("pnpm", "1.1.0")
        expect(pnpmCalls).toContainEqual({
          cmd: "pnpm",
          args: ["install", "-g", "@deveco/deveco-code@1.1.0"],
        })
      }),
    )

    const bunCalls: Array<{ cmd: string; args: readonly string[] }> = []
    testEffect(
      testLayer(
        () => jsonResponse({}),
        (cmd, args) => {
          bunCalls.push({ cmd, args })
          return ""
        },
      ),
    ).effect("uses the bun package manager for the bun method", () =>
      Effect.gen(function* () {
        yield* Installation.use.upgrade("bun", "0.9.0")
        expect(bunCalls.some((c) => c.cmd === "bun" && c.args.includes("@deveco/deveco-code@0.9.0"))).toBe(true)
      }),
    )

    testEffect(
      testLayer(
        () => jsonResponse({}),
        (cmd) => (cmd === "npm" ? { code: 1, stderr: "EACCES" } : ""),
      ),
    ).effect("fails with UpgradeFailedError when the installer exits non-zero", () =>
      Effect.gen(function* () {
        const result = yield* Installation.use.upgrade("npm", "1.2.3").pipe(Effect.flip)
        expect(result).toBeInstanceOf(UpgradeFailedError)
        expect(result.stderr).toBe("Upgrade failed for npm (exit code 1).")
        expect(result.stderr).not.toContain("EACCES")
      }),
    )

    testEffect(
      testLayer(
        () => jsonResponse({}),
        () => "",
      ),
    ).effect("fails with UpgradeFailedError for an unknown method", () =>
      Effect.gen(function* () {
        const result = yield* Installation.use.upgrade("unknown", "1.2.3").pipe(Effect.flip)
        expect(result).toBeInstanceOf(UpgradeFailedError)
        expect(result.stderr).toBe("Unknown installation method: unknown")
      }),
    )
  })

  describe("upgrade", () => {
    testEffect(
      testLayer(
        () => jsonResponse({}),
        (cmd) => {
          if (cmd === "npm") return { code: 1, stderr: "token=secret command output" }
          return ""
        },
      ),
    ).effect("returns sanitized typed errors for failed package upgrades", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(Installation.use.upgrade("npm", "9.9.9"))
        expect(error).toBeInstanceOf(Installation.UpgradeFailedError)
        expect(error.stderr).toBe("Upgrade failed for npm (exit code 1).")
        expect(error.message).toBe(error.stderr)
        expect(error.stderr).not.toContain("secret")
        expect(error.stderr).not.toContain("command output")
      }),
    )

    testEffect(
      testLayer(
        () => new Response("install script with token=secret", { status: 200 }),
        (cmd) => {
          if (cmd === "sh" || cmd === "bash") return { code: 1, stderr: "token=secret command output" }
          return ""
        },
      ),
    ).effect("sanitizes typed errors for failed curl upgrades", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(Installation.use.upgrade("curl", "9.9.9"))
        expect(error).toBeInstanceOf(Installation.UpgradeFailedError)
        expect(error.stderr).not.toContain("secret")
        expect(error.stderr).not.toContain("command output")
      }),
    )

    const curlShellCalls: Array<{ cmd: string; args: readonly string[] }> = []
    testEffect(
      testLayer(
        () => new Response("install script", { status: 200 }),
        (cmd, args) => {
          curlShellCalls.push({ cmd, args })
          return ""
        },
      ),
    ).effect("invokes a shell installer for curl upgrades", () =>
      Effect.gen(function* () {
        yield* Installation.use.upgrade("curl", "9.9.9")
        expect(curlShellCalls.some((call) => call.cmd === "sh")).toBe(true)
      }),
    )

    // Windows shell 调用记录(独立作用域,避免与其他测试共享状态)
    const winShellCalls: Array<{ cmd: string; args: readonly string[] }> = []
    testEffect(
      testLayer(
        () => new Response("install.ps1 script content", { status: 200 }),
        (cmd, args) => {
          winShellCalls.push({ cmd, args })
          if (cmd === "pwsh") return "PowerShell 7.4.0"
          if (cmd === "powershell.exe") return "5.1"
          return ""
        },
      ),
    ).effect("uses pwsh for irm upgrades on Windows", () =>
      Effect.gen(function* () {
        // 清空调用记录,避免跨测试污染
        winShellCalls.length = 0

        const originalPlatform = process.platform
        try {
          Object.defineProperty(process, "platform", { value: "win32", configurable: true })
          yield* Installation.use.upgrade("irm", "9.9.9")

          // 断言 pwsh 被实际调用(而非 bash/sh)
          expect(winShellCalls.some((c) => c.cmd === "pwsh")).toBe(true)
          // 定位脚本执行调用(跳过 --version 探测调用),断言参数含 -Command 和 -
          const pwshExecCall = winShellCalls.find(
            (c) => c.cmd === "pwsh" && c.args.includes("-Command"),
          )
          expect(pwshExecCall).toBeDefined()
          expect(pwshExecCall?.args).toContain("-Command")
          expect(pwshExecCall?.args).toContain("-")
          // 断言未调用 bash/sh
          expect(winShellCalls.some((c) => c.cmd === "bash" || c.cmd === "sh")).toBe(false)
        } finally {
          Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true })
        }
      }),
    )

    const irmHttpUrls: string[] = []
    testEffect(
      testLayer(
        (request) => {
          irmHttpUrls.push(request.url)
          return new Response("install.ps1 script content", { status: 200 })
        },
        (cmd, args) => {
          if (cmd === "pwsh" && args.includes("--version")) return "PowerShell 7.4.0"
          return ""
        },
      ),
    ).effect("fetches install.ps1 for irm upgrades", () =>
      Effect.gen(function* () {
        irmHttpUrls.length = 0
        const originalPlatform = process.platform
        try {
          Object.defineProperty(process, "platform", { value: "win32", configurable: true })
          yield* Installation.use.upgrade("irm", "9.9.9")
          expect(irmHttpUrls.some((url) => url.includes("install.ps1"))).toBe(true)
        } finally {
          Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true })
        }
      }),
    )

    const irmFallbackCalls: Array<{ cmd: string; args: readonly string[] }> = []
    testEffect(
      testLayer(
        () => new Response("install.ps1 script content", { status: 200 }),
        (cmd, args) => {
          irmFallbackCalls.push({ cmd, args })
          if (cmd === "pwsh") return ""
          if (cmd === "powershell.exe" && args.some((a) => a.includes("$PSVersionTable"))) return "5.1"
          return ""
        },
      ),
    ).effect("falls back to powershell.exe when pwsh is unavailable", () =>
      Effect.gen(function* () {
        irmFallbackCalls.length = 0
        const originalPlatform = process.platform
        try {
          Object.defineProperty(process, "platform", { value: "win32", configurable: true })
          yield* Installation.use.upgrade("irm", "9.9.9")
          const psExecCall = irmFallbackCalls.find(
            (c) => c.cmd === "powershell.exe" && c.args.includes("-ExecutionPolicy"),
          )
          expect(psExecCall).toBeDefined()
        } finally {
          Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true })
        }
      }),
    )

    testEffect(
      testLayer(
        () => new Response("install.ps1 with token=secret", { status: 200 }),
        (cmd, args) => {
          if (cmd === "pwsh" && args.includes("--version")) return "PowerShell 7.4.0"
          if (cmd === "pwsh" && args.includes("-Command")) return { code: 1, stderr: "token=secret command output" }
          return ""
        },
      ),
    ).effect("sanitizes typed errors for failed irm upgrades", () =>
      Effect.gen(function* () {
        const originalPlatform = process.platform
        try {
          Object.defineProperty(process, "platform", { value: "win32", configurable: true })
          const error = yield* Effect.flip(Installation.use.upgrade("irm", "9.9.9"))
          expect(error).toBeInstanceOf(UpgradeFailedError)
          expect(error.stderr).not.toContain("secret")
          expect(error.stderr).not.toContain("command output")
        } finally {
          Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true })
        }
      }),
    )
  })
})
