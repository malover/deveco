import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { tmpdir } from "../fixture/fixture"
import {
  API_CONFIGS,
  SkillError,
  loadSdkMetadata,
  resolveApiLevel,
  detectApiLevel,
} from "../../resources/skills/deveco-create-project/scripts/detect-sdk"
import type { SdkMetadata } from "../../resources/skills/deveco-create-project/scripts/detect-sdk"

function throws(fn: () => void): SkillError {
  try {
    fn()
    throw new Error("Expected SkillError but no error was thrown")
  } catch (e) {
    if (!(e instanceof SkillError)) throw e
    return e
  }
}

async function throwsAsync(fn: () => Promise<unknown>): Promise<SkillError> {
  try {
    await fn()
    throw new Error("Expected SkillError but no error was thrown")
  } catch (e) {
    if (!(e instanceof SkillError)) throw e
    return e
  }
}

function nodePath(home: string) {
  return process.platform === "win32"
    ? path.join(home, "tools", "node", "node.exe")
    : path.join(home, "tools", "node", "bin", "node")
}

async function scaffoldDevEcoHome(
  base: string,
  pkgData?: object,
) {
  const node = nodePath(base)
  await fs.mkdir(path.dirname(node), { recursive: true })
  await Bun.write(node, "")
  const sdkPkgPath = path.join(base, "sdk", "default", "sdk-pkg.json")
  await fs.mkdir(path.dirname(sdkPkgPath), { recursive: true })
  const pkg = pkgData ?? { data: { apiVersion: 23, platformVersion: "6.1.0" } }
  await Bun.write(sdkPkgPath, JSON.stringify(pkg))
  return base
}

function withEnvVar(
  key: string,
  value: string | undefined,
  fn: () => Promise<void>,
): Promise<void> {
  const saved = process.env[key]
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
  return fn().finally(() => {
    if (saved === undefined) delete process.env[key]
    else process.env[key] = saved
  })
}

function makeMetadata(
  overrides: Partial<SdkMetadata> = {},
): SdkMetadata {
  return {
    devecoHome: "/fake/deveco",
    sdkPkgPath: "/fake/deveco/sdk/default/sdk-pkg.json",
    apiVersion: 23,
    platformVersion: "6.1.0",
    ...overrides,
  }
}

describe("API_CONFIGS", () => {
  test("should contain mappings for API levels 17 through 24", () => {
    const keys = Object.keys(API_CONFIGS).map(Number).sort((a, b) => a - b)
    expect(keys).toEqual([17, 18, 19, 20, 21, 22, 23, 24])
    for (const level of keys) {
      const entry = API_CONFIGS[level]
      expect(entry.sdkVersion).toContain(String(level))
      expect(entry.modelVersion).toBeDefined()
    }
  })
})

describe("SkillError", () => {
  test("should set name to SkillError and message from payload", () => {
    const payload = {
      code: "TEST_CODE",
      message: "test message",
      hint: "test hint",
    }
    const error = new SkillError(payload)
    expect(error.name).toBe("SkillError")
    expect(error.message).toBe("test message")
    expect(error.payload.code).toBe("TEST_CODE")
    expect(error.payload.hint).toBe("test hint")
  })
})

describe("resolveApiLevel", () => {
  test("should use sdk_pkg source when userApiLevel is undefined", () => {
    const metadata = makeMetadata()
    const result = resolveApiLevel(metadata)
    expect(result.source).toBe("sdk_pkg")
    expect(result.apiLevel).toBe(23)
    expect(result.detectedFrom).toBe(metadata.sdkPkgPath)
  })

  test("should use user_input source when userApiLevel is provided", () => {
    const metadata = makeMetadata()
    const result = resolveApiLevel(metadata, 20)
    expect(result.source).toBe("user_input")
    expect(result.apiLevel).toBe(20)
    expect(result.detectedFrom).toBeUndefined()
  })

  test("should return mapped sdkVersion and modelVersion for known API level", () => {
    const metadata = makeMetadata()
    const result = resolveApiLevel(metadata, 17)
    expect(result.sdkVersion).toBe(API_CONFIGS[17].sdkVersion)
    expect(result.modelVersion).toBe(API_CONFIGS[17].modelVersion)
  })

  test("should generate fallback config when apiLevel equals metadata.apiVersion but is not in API_CONFIGS", () => {
    const metadata = makeMetadata({ apiVersion: 25, platformVersion: "6.2.0" })
    const result = resolveApiLevel(metadata)
    expect(result.apiLevel).toBe(25)
    expect(result.sdkVersion).toBe("6.2.0(25)")
    expect(result.modelVersion).toBe("6.2.0")
  })

  test("should throw API_LEVEL_OUT_OF_RANGE when apiLevel is below minimum", () => {
    const metadata = makeMetadata()
    const error = throws(() => resolveApiLevel(metadata, 16))
    expect(error.payload.code).toBe("API_LEVEL_OUT_OF_RANGE")
    expect(error.payload.message).toContain("16")
  })

  test("should throw API_LEVEL_OUT_OF_RANGE when apiLevel exceeds metadata.apiVersion", () => {
    const metadata = makeMetadata({ apiVersion: 23 })
    const error = throws(() => resolveApiLevel(metadata, 24))
    expect(error.payload.code).toBe("API_LEVEL_OUT_OF_RANGE")
    expect(error.payload.message).toContain("24")
  })

  test("should throw API_CONFIG_MISSING when apiLevel is within range but unmapped and not default", () => {
    const metadata = makeMetadata({ apiVersion: 26, platformVersion: "6.2.0" })
    const error = throws(() => resolveApiLevel(metadata, 25))
    expect(error.payload.code).toBe("API_CONFIG_MISSING")
    expect(error.payload.message).toContain("25")
  })

  test("should include devecoHome from metadata in result", () => {
    const metadata = makeMetadata({ devecoHome: "/custom/deveco" })
    const result = resolveApiLevel(metadata)
    expect(result.devecoHome).toBe("/custom/deveco")
  })

  test("should allow userApiLevel equal to minimum supported level", () => {
    const metadata = makeMetadata()
    const result = resolveApiLevel(metadata, 17)
    expect(result.apiLevel).toBe(17)
    expect(result.source).toBe("user_input")
  })
})

describe("loadSdkMetadata", () => {
  test("should throw DEVECO_HOME_MISSING when DEVECO_HOME is not set", async () => {
    await withEnvVar("DEVECO_HOME", undefined, async () => {
      const error = await throwsAsync(() => loadSdkMetadata())
      expect(error.payload.code).toBe("DEVECO_HOME_MISSING")
    })
  })

  test("should throw DEVECO_HOME_MISSING when DEVECO_HOME is empty string", async () => {
    await withEnvVar("DEVECO_HOME", "", async () => {
      const error = await throwsAsync(() => loadSdkMetadata())
      expect(error.payload.code).toBe("DEVECO_HOME_MISSING")
    })
  })

  test("should throw DEVECO_HOME_MISSING when DEVECO_HOME is whitespace-only", async () => {
    await withEnvVar("DEVECO_HOME", "   ", async () => {
      const error = await throwsAsync(() => loadSdkMetadata())
      expect(error.payload.code).toBe("DEVECO_HOME_MISSING")
    })
  })

  test("should throw DEVECO_HOME_INVALID when DEVECO_HOME points to missing directory", async () => {
    await using tmp = await tmpdir()
    const missing = path.join(tmp.path, "missing-dir")
    await withEnvVar("DEVECO_HOME", missing, async () => {
      const error = await throwsAsync(() => loadSdkMetadata())
      expect(error.payload.code).toBe("DEVECO_HOME_INVALID")
      expect(error.payload.message).toContain("missing directory")
    })
  })

  test("should throw DEVECO_HOME_INVALID when built-in Node is missing", async () => {
    await using tmp = await tmpdir()
    const home = path.join(tmp.path, "deveco-no-node")
    await fs.mkdir(home, { recursive: true })
    await withEnvVar("DEVECO_HOME", home, async () => {
      const error = await throwsAsync(() => loadSdkMetadata())
      expect(error.payload.code).toBe("DEVECO_HOME_INVALID")
      expect(error.payload.message).toContain("Node not found")
    })
  })

  test("should throw SDK_PKG_MISSING when sdk-pkg.json does not exist", async () => {
    await using tmp = await tmpdir()
    const home = path.join(tmp.path, "deveco-no-sdkpkg")
    await scaffoldDevEcoHome(home)
    const sdkPkgPath = path.join(home, "sdk", "default", "sdk-pkg.json")
    await fs.unlink(sdkPkgPath)
    await withEnvVar("DEVECO_HOME", home, async () => {
      const error = await throwsAsync(() => loadSdkMetadata())
      expect(error.payload.code).toBe("SDK_PKG_MISSING")
    })
  })

  test("should throw SDK_PKG_INVALID when sdk-pkg.json is not valid JSON", async () => {
    await using tmp = await tmpdir()
    const home = path.join(tmp.path, "deveco-bad-json")
    await scaffoldDevEcoHome(home)
    await Bun.write(path.join(home, "sdk", "default", "sdk-pkg.json"), "not valid json")
    await withEnvVar("DEVECO_HOME", home, async () => {
      const error = await throwsAsync(() => loadSdkMetadata())
      expect(error.payload.code).toBe("SDK_PKG_INVALID")
      expect(error.payload.message).toContain("not valid JSON")
    })
  })

  test("should throw SDK_PKG_INVALID when sdk-pkg.json has missing data section", async () => {
    await using tmp = await tmpdir()
    const home = path.join(tmp.path, "deveco-no-data")
    await scaffoldDevEcoHome(home, { version: "1.0" })
    await withEnvVar("DEVECO_HOME", home, async () => {
      const error = await throwsAsync(() => loadSdkMetadata())
      expect(error.payload.code).toBe("SDK_PKG_INVALID")
      expect(error.payload.message).toContain("data section")
    })
  })

  test("should throw SDK_API_INVALID when apiVersion is a non-integer string", async () => {
    await using tmp = await tmpdir()
    const home = path.join(tmp.path, "deveco-bad-api")
    await scaffoldDevEcoHome(home, {
      data: { apiVersion: "not-a-number", platformVersion: "6.1.0" },
    })
    await withEnvVar("DEVECO_HOME", home, async () => {
      const error = await throwsAsync(() => loadSdkMetadata())
      expect(error.payload.code).toBe("SDK_API_INVALID")
    })
  })

  test("should throw SDK_API_INVALID when apiVersion is below minimum", async () => {
    await using tmp = await tmpdir()
    const home = path.join(tmp.path, "deveco-low-api")
    await scaffoldDevEcoHome(home, {
      data: { apiVersion: 10, platformVersion: "4.0.0" },
    })
    await withEnvVar("DEVECO_HOME", home, async () => {
      const error = await throwsAsync(() => loadSdkMetadata())
      expect(error.payload.code).toBe("SDK_API_INVALID")
    })
  })

  test("should throw SDK_API_INVALID when apiVersion is a float number", async () => {
    await using tmp = await tmpdir()
    const home = path.join(tmp.path, "deveco-float-api")
    await scaffoldDevEcoHome(home, {
      data: { apiVersion: 23.5, platformVersion: "6.1.0" },
    })
    await withEnvVar("DEVECO_HOME", home, async () => {
      const error = await throwsAsync(() => loadSdkMetadata())
      expect(error.payload.code).toBe("SDK_API_INVALID")
    })
  })

  test("should throw SDK_API_INVALID when apiVersion is whitespace-only string", async () => {
    await using tmp = await tmpdir()
    const home = path.join(tmp.path, "deveco-whitespace-api")
    await scaffoldDevEcoHome(home, {
      data: { apiVersion: "   ", platformVersion: "6.1.0" },
    })
    await withEnvVar("DEVECO_HOME", home, async () => {
      const error = await throwsAsync(() => loadSdkMetadata())
      expect(error.payload.code).toBe("SDK_API_INVALID")
    })
  })

  test("should throw SDK_API_INVALID when apiVersion is missing from pkg.data", async () => {
    await using tmp = await tmpdir()
    const home = path.join(tmp.path, "deveco-missing-api-field")
    await scaffoldDevEcoHome(home, {
      data: { platformVersion: "6.1.0" },
    })
    await withEnvVar("DEVECO_HOME", home, async () => {
      const error = await throwsAsync(() => loadSdkMetadata())
      expect(error.payload.code).toBe("SDK_API_INVALID")
    })
  })

  test("should throw SDK_PLATFORM_VERSION_MISSING when platformVersion is empty string", async () => {
    await using tmp = await tmpdir()
    const home = path.join(tmp.path, "deveco-empty-platform")
    await scaffoldDevEcoHome(home, {
      data: { apiVersion: 23, platformVersion: "" },
    })
    await withEnvVar("DEVECO_HOME", home, async () => {
      const error = await throwsAsync(() => loadSdkMetadata())
      expect(error.payload.code).toBe("SDK_PLATFORM_VERSION_MISSING")
    })
  })

  test("should throw SDK_PLATFORM_VERSION_MISSING when platformVersion is null", async () => {
    await using tmp = await tmpdir()
    const home = path.join(tmp.path, "deveco-null-platform")
    await scaffoldDevEcoHome(home, {
      data: { apiVersion: 23, platformVersion: null },
    })
    await withEnvVar("DEVECO_HOME", home, async () => {
      const error = await throwsAsync(() => loadSdkMetadata())
      expect(error.payload.code).toBe("SDK_PLATFORM_VERSION_MISSING")
    })
  })

  test("should throw SDK_PLATFORM_VERSION_MISSING when platformVersion is whitespace-only", async () => {
    await using tmp = await tmpdir()
    const home = path.join(tmp.path, "deveco-whitespace-platform")
    await scaffoldDevEcoHome(home, {
      data: { apiVersion: 23, platformVersion: "   " },
    })
    await withEnvVar("DEVECO_HOME", home, async () => {
      const error = await throwsAsync(() => loadSdkMetadata())
      expect(error.payload.code).toBe("SDK_PLATFORM_VERSION_MISSING")
    })
  })

  test("should return valid SdkMetadata when DEVECO_HOME and sdk-pkg.json are correct", async () => {
    await using tmp = await tmpdir()
    const home = path.join(tmp.path, "deveco-valid")
    await scaffoldDevEcoHome(home)
    await withEnvVar("DEVECO_HOME", home, async () => {
      const metadata = await loadSdkMetadata()
      expect(metadata.devecoHome).toBe(home)
      expect(metadata.apiVersion).toBe(23)
      expect(metadata.platformVersion).toBe("6.1.0")
      expect(metadata.sdkPkgPath).toContain("sdk-pkg.json")
    })
  })

  test("should accept apiVersion as numeric string", async () => {
    await using tmp = await tmpdir()
    const home = path.join(tmp.path, "deveco-string-api")
    await scaffoldDevEcoHome(home, {
      data: { apiVersion: "23", platformVersion: "6.1.0" },
    })
    await withEnvVar("DEVECO_HOME", home, async () => {
      const metadata = await loadSdkMetadata()
      expect(metadata.apiVersion).toBe(23)
    })
  })

  test("should trim whitespace from DEVECO_HOME value", async () => {
    await using tmp = await tmpdir()
    const home = path.join(tmp.path, "deveco-trim")
    await scaffoldDevEcoHome(home)
    await withEnvVar("DEVECO_HOME", `  ${home}  `, async () => {
      const metadata = await loadSdkMetadata()
      expect(metadata.devecoHome).toBe(home)
    })
  })
})

describe("detectApiLevel", () => {
  test("should return resolved API level from valid DevEco home", async () => {
    await using tmp = await tmpdir()
    const home = path.join(tmp.path, "deveco-detect")
    await scaffoldDevEcoHome(home)
    await withEnvVar("DEVECO_HOME", home, async () => {
      const result = await detectApiLevel()
      expect(result.apiLevel).toBe(23)
      expect(result.sdkVersion).toBe(API_CONFIGS[23].sdkVersion)
      expect(result.modelVersion).toBe(API_CONFIGS[23].modelVersion)
      expect(result.source).toBe("sdk_pkg")
      expect(result.devecoHome).toBe(home)
    })
  })
})
