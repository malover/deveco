import { describe, expect, test } from "bun:test"
import {
  API_CONFIGS,
  SkillError,
  resolveApiLevel,
} from "../resources/skills/deveco-create-project/scripts/detect-sdk.mjs"

describe("detect-sdk API_CONFIGS", () => {
  test("contains API level 17 mapping", () => {
    expect(API_CONFIGS[17]).toEqual({
      sdkVersion: "5.0.5(17)",
      modelVersion: "5.0.5",
    })
  })

  test("contains API level 20 mapping", () => {
    expect(API_CONFIGS[20]).toEqual({
      sdkVersion: "6.0.0(20)",
      modelVersion: "6.0.0",
    })
  })

  test("contains API level 24 mapping", () => {
    expect(API_CONFIGS[24]).toEqual({
      sdkVersion: "6.1.1(24)",
      modelVersion: "6.1.1",
    })
  })

  test("has 8 API level mappings", () => {
    expect(Object.keys(API_CONFIGS).length).toBe(8)
  })

  test("all API levels are between 17 and 24", () => {
    for (const level of Object.keys(API_CONFIGS)) {
      const num = Number(level)
      expect(num).toBeGreaterThanOrEqual(17)
      expect(num).toBeLessThanOrEqual(24)
    }
  })
})

describe("detect-sdk SkillError", () => {
  test("creates error with payload", () => {
    const error = new SkillError({
      code: "TEST_ERROR",
      message: "test message",
      hint: "test hint",
    })
    expect(error.name).toBe("SkillError")
    expect(error.message).toBe("test message")
    expect(error.payload.code).toBe("TEST_ERROR")
    expect(error.payload.hint).toBe("test hint")
  })

  test("creates error with details", () => {
    const error = new SkillError({
      code: "TEST_ERROR",
      message: "test message",
      hint: "test hint",
      details: { key: "value" },
    })
    expect(error.payload.details).toEqual({ key: "value" })
  })

  test("is instance of Error", () => {
    const error = new SkillError({
      code: "TEST_ERROR",
      message: "test message",
      hint: "test hint",
    })
    expect(error instanceof Error).toBe(true)
  })
})

describe("detect-sdk resolveApiLevel", () => {
  const baseMetadata = {
    devecoHome: "/opt/deveco",
    sdkPkgPath: "/opt/deveco/sdk/default/sdk-pkg.json",
    apiVersion: 22,
    platformVersion: "6.0.2",
  }

  test("uses SDK default when no user input", () => {
    const result = resolveApiLevel(baseMetadata)
    expect(result.apiLevel).toBe(22)
    expect(result.source).toBe("sdk_pkg")
    expect(result.sdkVersion).toBe("6.0.2(22)")
    expect(result.modelVersion).toBe("6.0.2")
    expect(result.detectedFrom).toBe(baseMetadata.sdkPkgPath)
  })

  test("uses user input when provided", () => {
    const result = resolveApiLevel(baseMetadata, 20)
    expect(result.apiLevel).toBe(20)
    expect(result.source).toBe("user_input")
    expect(result.sdkVersion).toBe("6.0.0(20)")
    expect(result.modelVersion).toBe("6.0.0")
    expect(result.detectedFrom).toBeUndefined()
  })

  test("throws when API level below minimum", () => {
    expect(() => resolveApiLevel(baseMetadata, 16)).toThrow(
      expect.objectContaining({
        payload: expect.objectContaining({ code: "API_LEVEL_OUT_OF_RANGE" }),
      })
    )
  })

  test("throws when API level above SDK default", () => {
    expect(() => resolveApiLevel(baseMetadata, 25)).toThrow(
      expect.objectContaining({
        payload: expect.objectContaining({ code: "API_LEVEL_OUT_OF_RANGE" }),
      })
    )
  })

  test("generates dynamic config when API level matches SDK default but not in API_CONFIGS", () => {
    const metadata = { ...baseMetadata, apiVersion: 25, platformVersion: "7.0.0" }
    const result = resolveApiLevel(metadata, 25)
    expect(result.apiLevel).toBe(25)
    expect(result.sdkVersion).toBe("7.0.0(25)")
    expect(result.modelVersion).toBe("7.0.0")
  })

  test("resolves API level 17 correctly", () => {
    const result = resolveApiLevel(baseMetadata, 17)
    expect(result.apiLevel).toBe(17)
    expect(result.sdkVersion).toBe("5.0.5(17)")
    expect(result.modelVersion).toBe("5.0.5")
  })

  test("resolves API level 24 with higher SDK", () => {
    const metadata = { ...baseMetadata, apiVersion: 24, platformVersion: "6.1.1" }
    const result = resolveApiLevel(metadata, 24)
    expect(result.apiLevel).toBe(24)
    expect(result.sdkVersion).toBe("6.1.1(24)")
    expect(result.modelVersion).toBe("6.1.1")
  })

  test("includes devecoHome in result", () => {
    const result = resolveApiLevel(baseMetadata)
    expect(result.devecoHome).toBe("/opt/deveco")
  })
})
