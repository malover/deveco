import { afterEach, describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Global } from "@opencode-ai/core/global"
import {
  buildEnv,
  clearSavedDevEcoHome,
  findDevEcoHome,
  findDevEcoHomes,
  hasConfiguredDevEcoHome,
  hdcPath,
  hvigorPath,
  isDevEcoHome,
  loadSavedDevEcoHome,
  MIN_DEVECO_STUDIO_VERSION,
  nodePath,
  resolveDevEcoHome,
  saveDevEcoHome,
  sdkPath,
} from "../../../src/tool/lib/env"
import { tmpdir } from "../../fixture/fixture"

async function scaffoldDevEcoHome(base: string, version = "6.1.0") {
  const node = nodePath(base)
  await fs.mkdir(path.dirname(node), { recursive: true })
  await Bun.write(node, "")
  const product =
    process.platform === "darwin"
      ? path.join(base, "Resources", "product-info.json")
      : path.join(base, "product-info.json")
  await fs.mkdir(path.dirname(product), { recursive: true })
  await Bun.write(product, JSON.stringify({ version }))
  return base
}

function withDevecoHome(value: string | undefined, run: () => Promise<void>) {
  const previous = process.env.DEVECO_HOME
  if (value === undefined) delete process.env.DEVECO_HOME
  else process.env.DEVECO_HOME = value
  return run().finally(() => {
    if (previous === undefined) delete process.env.DEVECO_HOME
    else process.env.DEVECO_HOME = previous
  })
}

describe("DEVECO_HOME recognition", () => {
  let previousState = Global.Path.state

  async function useStateDir(tmpPath: string) {
    previousState = Global.Path.state
    Global.Path.state = path.join(tmpPath, "state")
    await fs.mkdir(Global.Path.state, { recursive: true })
  }

  afterEach(async () => {
    Global.Path.state = previousState
    await withDevecoHome(undefined, async () => {
      await clearSavedDevEcoHome()
    })
  })

  describe("resolveDevEcoHome()", () => {
    test("returns undefined for empty or whitespace-only path", async () => {
      expect(await resolveDevEcoHome("")).toBeUndefined()
      expect(await resolveDevEcoHome("   ")).toBeUndefined()
    })

    test("returns undefined when directory does not exist", async () => {
      await using tmp = await tmpdir()
      const missing = path.join(tmp.path, "missing-deveco")
      expect(await resolveDevEcoHome(missing)).toBeUndefined()
    })

    test("returns undefined when node binary is missing", async () => {
      await using tmp = await tmpdir()
      const home = path.join(tmp.path, "deveco-no-node")
      await fs.mkdir(home, { recursive: true })
      const product =
        process.platform === "darwin"
          ? path.join(home, "Resources", "product-info.json")
          : path.join(home, "product-info.json")
      await fs.mkdir(path.dirname(product), { recursive: true })
      await Bun.write(product, JSON.stringify({ version: "6.1.0" }))
      expect(await resolveDevEcoHome(home)).toBeUndefined()
    })

    test("returns undefined when product-info.json is missing", async () => {
      await using tmp = await tmpdir()
      const home = path.join(tmp.path, "deveco-no-product")
      await fs.mkdir(path.dirname(nodePath(home)), { recursive: true })
      await Bun.write(nodePath(home), "")
      expect(await resolveDevEcoHome(home)).toBeUndefined()
    })

    test(`returns undefined when version is below ${MIN_DEVECO_STUDIO_VERSION}`, async () => {
      await using tmp = await tmpdir()
      const home = path.join(tmp.path, "deveco-old")
      await scaffoldDevEcoHome(home, "5.1.0")
      expect(await resolveDevEcoHome(home)).toBeUndefined()
    })

    test("accepts minimum supported version", async () => {
      await using tmp = await tmpdir()
      const home = path.join(tmp.path, "deveco-min")
      await scaffoldDevEcoHome(home, MIN_DEVECO_STUDIO_VERSION)
      expect(await resolveDevEcoHome(home)).toBe(home)
    })

    test("resolves trimmed path with surrounding whitespace", async () => {
      await using tmp = await tmpdir()
      const home = path.join(tmp.path, "deveco-trim")
      await scaffoldDevEcoHome(home)
      expect(await resolveDevEcoHome(`  ${home}  `)).toBe(home)
    })

    test("resolves macOS .app bundle via Contents subdirectory", async () => {
      if (process.platform !== "darwin") return
      await using tmp = await tmpdir()
      const bundle = path.join(tmp.path, "DevEco-Studio.app")
      const contents = path.join(bundle, "Contents")
      await scaffoldDevEcoHome(contents)
      expect(await resolveDevEcoHome(bundle)).toBe(contents)
    })
  })

  describe("isDevEcoHome()", () => {
    test("returns true for a valid installation", async () => {
      await using tmp = await tmpdir()
      const home = path.join(tmp.path, "deveco-valid")
      await scaffoldDevEcoHome(home)
      expect(await isDevEcoHome(home)).toBe(true)
    })

    test("returns false for an invalid path", async () => {
      await using tmp = await tmpdir()
      expect(await isDevEcoHome(path.join(tmp.path, "not-deveco"))).toBe(false)
    })
  })

  describe("findDevEcoHome()", () => {
    test("prefers DEVECO_HOME when it points to a valid installation", async () => {
      await using tmp = await tmpdir()
      const envHome = path.join(tmp.path, "from-env")
      const savedHome = path.join(tmp.path, "from-saved")
      await scaffoldDevEcoHome(envHome)
      await scaffoldDevEcoHome(savedHome)

      await useStateDir(tmp.path)
      await saveDevEcoHome(savedHome)

      await withDevecoHome(envHome, async () => {
        expect(await findDevEcoHome()).toBe(envHome)
      })
    })

    test("falls back to saved path when DEVECO_HOME is unset", async () => {
      await using tmp = await tmpdir()
      const savedHome = path.join(tmp.path, "saved-only")
      await scaffoldDevEcoHome(savedHome)

      await useStateDir(tmp.path)
      await saveDevEcoHome(savedHome)

      await withDevecoHome(undefined, async () => {
        expect(await findDevEcoHome()).toBe(savedHome)
      })
    })

    test("falls back to saved path when DEVECO_HOME is whitespace-only", async () => {
      await using tmp = await tmpdir()
      const savedHome = path.join(tmp.path, "saved-whitespace")
      await scaffoldDevEcoHome(savedHome)

      await useStateDir(tmp.path)
      await saveDevEcoHome(savedHome)

      await withDevecoHome("   ", async () => {
        expect(await findDevEcoHome()).toBe(savedHome)
      })
    })

    test("falls back to saved path when DEVECO_HOME is invalid", async () => {
      await using tmp = await tmpdir()
      const savedHome = path.join(tmp.path, "saved-fallback")
      await scaffoldDevEcoHome(savedHome)

      await useStateDir(tmp.path)
      await saveDevEcoHome(savedHome)

      await withDevecoHome(path.join(tmp.path, "invalid-deveco"), async () => {
        expect(await findDevEcoHome()).toBe(savedHome)
      })
    })

    test("returns undefined when DEVECO_HOME, saved path, and defaults are all unavailable", async () => {
      await using tmp = await tmpdir()
      await useStateDir(tmp.path)

      await withDevecoHome(path.join(tmp.path, "missing"), async () => {
        expect(await findDevEcoHome()).toBeUndefined()
      })
    })
  })

  describe("saveDevEcoHome() / loadSavedDevEcoHome()", () => {
    test("persists and reloads a validated home path", async () => {
      await using tmp = await tmpdir()
      const home = path.join(tmp.path, "persisted")
      await scaffoldDevEcoHome(home)

      await useStateDir(tmp.path)

      expect(await saveDevEcoHome(home)).toBe(home)
      expect(await loadSavedDevEcoHome()).toBe(home)
    })

    test("rejects and does not persist an invalid home path", async () => {
      await using tmp = await tmpdir()
      await useStateDir(tmp.path)

      expect(await saveDevEcoHome(path.join(tmp.path, "invalid"))).toBeUndefined()
      expect(await loadSavedDevEcoHome()).toBeUndefined()
    })

    test("clears stale saved path when installation is no longer valid", async () => {
      await using tmp = await tmpdir()
      const home = path.join(tmp.path, "stale")
      await scaffoldDevEcoHome(home)

      await useStateDir(tmp.path)
      await saveDevEcoHome(home)
      await fs.rm(nodePath(home))

      expect(await loadSavedDevEcoHome()).toBeUndefined()
      expect(await loadSavedDevEcoHome()).toBeUndefined()
    })
  })

  describe("buildEnv()", () => {
    test("injects DEVECO_HOME and DEVECO_SDK_HOME into the returned environment", async () => {
      await using tmp = await tmpdir()
      const home = path.join(tmp.path, "deveco-env")
      const sdk = path.join(home, "sdk")
      await scaffoldDevEcoHome(home)

      const env = buildEnv(home, sdk)
      expect(env.DEVECO_HOME).toBe(home)
      expect(env.DEVECO_SDK_HOME).toBe(sdk)
      expect(env.PATH).toContain(path.join(home, "tools", "hvigor", "bin"))
    })

    test("win32 includes SystemRoot, ComSpec, and Path keys", async () => {
      if (process.platform !== "win32") return
      await using tmp = await tmpdir()
      const home = path.join(tmp.path, "deveco-env-win32")
      const sdk = path.join(home, "sdk")
      const env = buildEnv(home, sdk)
      expect(env).toHaveProperty("SystemRoot")
      expect(env).toHaveProperty("SYSTEMROOT")
      expect(env).toHaveProperty("ComSpec")
      expect(env).toHaveProperty("COMSPEC")
      expect(env).toHaveProperty("Path")
      expect(env.Path).toBe(env.PATH)
    })

    test("non-win32 excludes Windows-specific keys", async () => {
      if (process.platform === "win32") return
      await using tmp = await tmpdir()
      const home = path.join(tmp.path, "deveco-env-unix")
      const sdk = path.join(home, "sdk")
      const env = buildEnv(home, sdk)
      expect(env).not.toHaveProperty("SystemRoot")
      expect(env).not.toHaveProperty("ComSpec")
      expect(env).not.toHaveProperty("Path")
    })

    test("win32 uses semicolon separator in PATH", async () => {
      if (process.platform !== "win32") return
      await using tmp = await tmpdir()
      const home = path.join(tmp.path, "deveco-env-sep")
      const sdk = path.join(home, "sdk")
      const env = buildEnv(home, sdk)
      expect(env.PATH).toContain(";")
    })

    test("non-win32 uses colon separator in PATH", async () => {
      if (process.platform === "win32") return
      await using tmp = await tmpdir()
      const home = path.join(tmp.path, "deveco-env-sep")
      const sdk = path.join(home, "sdk")
      const env = buildEnv(home, sdk)
      expect(env.PATH).toContain(":")
      expect(env.PATH).not.toContain(";")
    })
  })

  describe("findDevEcoHomes()", () => {
    test("returns empty array when no default paths exist", async () => {
      const result = await findDevEcoHomes()
      expect(Array.isArray(result)).toBe(true)
    })

    test("deduplicates identical resolved paths", async () => {
      await using tmp = await tmpdir()
      const home = path.join(tmp.path, "dedup")
      await scaffoldDevEcoHome(home)
      const result = await findDevEcoHomes()
      const seen = new Set(result)
      expect(seen.size).toBe(result.length)
    })
  })

  describe("clearSavedDevEcoHome()", () => {
    test("does not throw when file does not exist", async () => {
      await using tmp = await tmpdir()
      const stateDir = path.join(tmp.path, "state")
      await fs.mkdir(stateDir, { recursive: true })
      const previous = Global.Path.state
      try {
        Global.Path.state = stateDir
        await expect(clearSavedDevEcoHome()).resolves.toBeUndefined()
      } finally {
        Global.Path.state = previous
      }
    })

    test("removes file when it exists", async () => {
      await using tmp = await tmpdir()
      const stateDir = path.join(tmp.path, "state")
      await fs.mkdir(stateDir, { recursive: true })
      const previous = Global.Path.state
      try {
        Global.Path.state = stateDir
        const file = path.join(stateDir, "deveco-home.json")
        await fs.writeFile(file, JSON.stringify({ deveco_home: "/fake" }), "utf8")
        await clearSavedDevEcoHome()
        expect(await Bun.file(file).exists()).toBe(false)
      } finally {
        Global.Path.state = previous
      }
    })
  })

  describe("hasConfiguredDevEcoHome()", () => {
    test("returns true when DEVECO_HOME env var is set", async () => {
      await using tmp = await tmpdir()
      await useStateDir(tmp.path)
      await withDevecoHome("/some/path", async () => {
        expect(await hasConfiguredDevEcoHome()).toBe(true)
      })
    })

    test("returns true when saved home is valid", async () => {
      await using tmp = await tmpdir()
      const home = path.join(tmp.path, "has-configured")
      await scaffoldDevEcoHome(home)
      await useStateDir(tmp.path)
      await saveDevEcoHome(home)
      await withDevecoHome(undefined, async () => {
        expect(await hasConfiguredDevEcoHome()).toBe(true)
      })
    })

    test("returns false when neither env nor saved path is valid", async () => {
      await using tmp = await tmpdir()
      await useStateDir(tmp.path)
      await withDevecoHome(undefined, async () => {
        expect(await hasConfiguredDevEcoHome()).toBe(false)
      })
    })
  })

  describe("MIN_DEVECO_STUDIO_VERSION", () => {
    test("is exactly 6.0.0", () => {
      expect(MIN_DEVECO_STUDIO_VERSION).toBe("6.0.0")
    })
  })

  describe("path helpers", () => {
    test("nodePath() uses platform-specific node location", async () => {
      await using tmp = await tmpdir()
      const home = path.join(tmp.path, "paths")
      const expected =
        process.platform === "win32"
          ? path.join(home, "tools", "node", "node.exe")
          : path.join(home, "tools", "node", "bin", "node")
      expect(nodePath(home)).toBe(expected)
    })

    test("hvigorPath(), sdkPath(), and hdcPath() resolve under the home directory", async () => {
      await using tmp = await tmpdir()
      const home = path.join(tmp.path, "tool-paths")
      expect(hvigorPath(home)).toBe(path.join(home, "tools", "hvigor", "bin", "hvigorw.js"))
      expect(sdkPath(home)).toBe(path.join(home, "sdk"))
      const hdc = process.platform === "win32" ? "hdc.exe" : "hdc"
      expect(hdcPath(home)).toBe(path.join(home, "sdk", "default", "openharmony", "toolchains", hdc))
    })
  })
})
