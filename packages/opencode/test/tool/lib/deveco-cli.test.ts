import { afterEach, describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Global } from "@opencode-ai/core/global"
import {
  __resetDevecoCliShellEnvCache,
  __setTestDevecoCliEntry,
  buildDevecoCliBuildArgs,
  buildDevecoCliLogArgs,
  buildDevecoCliRunArgs,
  buildDevecoCliStartAppCommands,
  buildDevecoCliShellEnv,
  devecoCliListContainsTarget,
  ensureDevecoCliShim,
  isolatedShellPath,
  resolveBundledDevecoCliEntry,
  runBundledDevecoCli,
} from "../../../src/tool/lib/deveco-cli"
import { tmpdir } from "../../fixture/fixture"

const originalBin = Global.Path.bin
const originalPath = process.env.PATH

afterEach(async () => {
  Global.Path.bin = originalBin
  if (originalPath === undefined) delete process.env.PATH
  else process.env.PATH = originalPath
  __setTestDevecoCliEntry(undefined)
  __resetDevecoCliShellEnvCache()
})

describe("deveco-cli runtime", () => {
  test("resolveBundledDevecoCliEntry() uses test entry override", async () => {
    await using tmp = await tmpdir()
    const cli = path.join(tmp.path, "dist", "cli.js")
    await fs.mkdir(path.dirname(cli), { recursive: true })
    await Bun.write(cli, "console.log('ok')\n")

    __setTestDevecoCliEntry(cli)
    expect(resolveBundledDevecoCliEntry()).toBe(path.resolve(cli))
  })

  test("ensureDevecoCliShim() writes shim and buildDevecoCliShellEnv() prepends PATH", async () => {
    await using tmp = await tmpdir()
    const binDir = path.join(tmp.path, "bin")
    const cli = path.join(tmp.path, "dist", "cli.js")
    await fs.mkdir(path.dirname(cli), { recursive: true })
    await Bun.write(cli, "console.log('1.2.3')\n")

    Global.Path.bin = binDir
    __setTestDevecoCliEntry(cli)
    process.env.PATH = "/usr/bin"

    const shimDir = await ensureDevecoCliShim(binDir)
    expect(shimDir).toBe(binDir)

    const marker = await fs.readFile(path.join(binDir, ".deveco-cli-path"), "utf8")
    expect(marker.trim()).toBe(path.resolve(cli))

    if (process.platform === "win32") {
      expect(await Bun.file(path.join(binDir, "devecocli.cmd")).exists()).toBe(true)
    } else {
      expect(await Bun.file(path.join(binDir, "devecocli")).exists()).toBe(true)
    }

    __resetDevecoCliShellEnvCache()
    const env = await buildDevecoCliShellEnv()
    expect(env?.PATH.startsWith(`${binDir}${process.platform === "win32" ? ";" : ":"}`)).toBe(true)
    expect(env?.PATH).toContain("/usr/bin")
  })

  test("buildDevecoCliBuildArgs() maps skill-aligned build options", () => {
    expect(buildDevecoCliBuildArgs({})).toEqual(["build"])
    expect(buildDevecoCliBuildArgs({ clean: true })).toEqual(["build", "clean"])
    expect(buildDevecoCliBuildArgs({ modules: ["entry", "library@phone"] })).toEqual([
      "build",
      "--modules",
      "entry",
      "library@phone",
    ])
    expect(buildDevecoCliBuildArgs({ product: "oversea", build_mode: "release" })).toEqual([
      "build",
      "--product",
      "oversea",
      "--build-mode",
      "release",
    ])
  })

  test("buildDevecoCliRunArgs() maps start_app options and always skips build", () => {
    expect(buildDevecoCliRunArgs({ device: " 127.0.0.1:5555 " })).toEqual([
      "run",
      "--skip-build",
      "--device",
      "127.0.0.1:5555",
    ])
    expect(
      buildDevecoCliRunArgs({
        device: "Phone",
        module: "entry",
        target: "default",
        ability: "EntryAbility",
      }),
    ).toEqual([
      "run",
      "--skip-build",
      "--device",
      "Phone",
      "--module",
      "entry@default",
      "--ability",
      "EntryAbility",
    ])
    expect(buildDevecoCliRunArgs({ device: "Phone", target: "tablet" })).toContain("entry@tablet")
  })

  test("buildDevecoCliStartAppCommands() prepares device discovery", () => {
    expect(buildDevecoCliStartAppCommands({})).toEqual([
      ["device", "list"],
      ["emulator", "list"],
    ])
    expect(buildDevecoCliStartAppCommands({ hvd: "   " })).toEqual([
      ["device", "list"],
      ["emulator", "list"],
    ])
    expect(buildDevecoCliStartAppCommands({ hvd: "Phone", module: "entry" })).toEqual([["device", "list"]])
  })

  test("devecoCliListContainsTarget() detects device and emulator names", () => {
    const output = ["Name                Status", "HarmonyOS Phone     stopped", "127.0.0.1:5555      running"].join("\n")
    expect(devecoCliListContainsTarget(output, "HarmonyOS Phone")).toBe(true)
    expect(devecoCliListContainsTarget(output, "127.0.0.1:5555")).toBe(true)
    expect(devecoCliListContainsTarget(output, "Missing Phone")).toBe(false)
    expect(devecoCliListContainsTarget(output, "   ")).toBe(false)
  })

  test("buildDevecoCliLogArgs() maps hdc_log collection options", () => {
    expect(buildDevecoCliLogArgs({})).toEqual(["log"])
    expect(
      buildDevecoCliLogArgs({
        device: " 127.0.0.1:5555 ",
        keyword: " [DEBUG] ",
        tail: 2000,
      }),
    ).toEqual([
      "log",
      "--device",
      "127.0.0.1:5555",
      "--keyword",
      "[DEBUG]",
      "--tail",
      "2000",
    ])
  })

  test("runBundledDevecoCli() invokes bundled shim instead of global devecocli", async () => {
    await using tmp = await tmpdir()
    const binDir = path.join(tmp.path, "bin")
    const cli = path.join(tmp.path, "dist", "cli.js")
    await fs.mkdir(path.dirname(cli), { recursive: true })
    await Bun.write(
      cli,
      `const args = process.argv.slice(2).join(" ")
console.log("bundled:" + args)
`,
    )

    Global.Path.bin = binDir
    __setTestDevecoCliEntry(cli)
    __resetDevecoCliShellEnvCache()

    const result = await runBundledDevecoCli(["build", "--product", "default"], tmp.path)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("bundled:build --product default")
  })

  test("runBundledDevecoCli() propagates non-zero exit code through shim", async () => {
    await using tmp = await tmpdir()
    const binDir = path.join(tmp.path, "bin")
    const cli = path.join(tmp.path, "dist", "cli.js")
    await fs.mkdir(path.dirname(cli), { recursive: true })
    await Bun.write(
      cli,
      `console.error("build failed")
process.exit(1)
`,
    )

    Global.Path.bin = binDir
    __setTestDevecoCliEntry(cli)
    __resetDevecoCliShellEnvCache()

    const result = await runBundledDevecoCli(["build"], tmp.path)
    expect(result.exitCode).toBe(1)
    expect(result.stderr.trim()).toBe("build failed")
  })

  test("isolatedShellPath() shadows global devecocli without removing its Node directory", async () => {
    await using tmp = await tmpdir()
    const shimDir = path.join(tmp.path, "shim")
    const globalDir = path.join(tmp.path, "global")
    await fs.mkdir(shimDir, { recursive: true })
    await fs.mkdir(globalDir, { recursive: true })
    await Bun.write(path.join(shimDir, process.platform === "win32" ? "devecocli.cmd" : "devecocli"), "")
    await Bun.write(path.join(globalDir, process.platform === "win32" ? "devecocli.cmd" : "devecocli"), "")
    await Bun.write(path.join(globalDir, process.platform === "win32" ? "node.exe" : "node"), "")

    const sep = process.platform === "win32" ? ";" : ":"
    const other = path.join(tmp.path, "other")
    const isolated = isolatedShellPath(`${globalDir}${sep}${other}`, shimDir)

    expect(isolated.startsWith(`${shimDir}${sep}`)).toBe(true)
    expect(isolated).toContain(other)
    expect(isolated).toContain(globalDir)
  })
})
