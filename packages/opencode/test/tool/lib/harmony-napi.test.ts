import { describe, expect, test, beforeAll } from "bun:test"

// Load the real harmony_napi module dynamically. This avoids being affected
// by mock.module calls from other test files (emulator-tools-execute.test.ts)
// that replace the entire harmony_napi module with a bridge-based mock.
const { resolveUIVerifyParams, napiBridgeStop } = await import("../../../src/tool/lib/harmony_napi")

// Unique worktrees prevent module-level state cross-contamination
let wtCounter = 0
function uniqueWt() {
  return `/tmp/harmony-napi-test-wt-${Date.now()}-${wtCounter++}`
}

describe("resolveUIVerifyParams – 3-tier fallback logic", () => {
  beforeAll(() => {
    // Clear all relevant env vars
    delete process.env.UI_VERIFY_BASE_URL
    delete process.env.UI_VERIFY_API_KEY
    delete process.env.UI_VERIFY_MODEL_NAME
  })

  describe("tier 2: environment variables", () => {
    test("returns null fields when no env vars set", async () => {
      const wt = uniqueWt()
      const r = await resolveUIVerifyParams(wt)
      expect(r).toEqual({ baseURL: null, apiKey: null, modelName: null })
    })

    test("returns env values when all three env vars set", async () => {
      const wt = uniqueWt()
      process.env.UI_VERIFY_BASE_URL = "https://env.test/v1"
      process.env.UI_VERIFY_API_KEY = "env-key-abc"
      process.env.UI_VERIFY_MODEL_NAME = "env-model-xyz"
      try {
        const r = await resolveUIVerifyParams(wt)
        expect(r).toEqual({
          baseURL: "https://env.test/v1",
          apiKey: "env-key-abc",
          modelName: "env-model-xyz",
        })
      } finally {
        delete process.env.UI_VERIFY_BASE_URL
        delete process.env.UI_VERIFY_API_KEY
        delete process.env.UI_VERIFY_MODEL_NAME
      }
    })

    test.each([
      ["only base URL", { UI_VERIFY_BASE_URL: "https://only-base.com" }],
      ["only api key", { UI_VERIFY_API_KEY: "only-key" }],
      ["only model name", { UI_VERIFY_MODEL_NAME: "only-model" }],
      ["two of three env vars", { UI_VERIFY_BASE_URL: "https://two.com", UI_VERIFY_API_KEY: "two-key" }],
    ])("returns null fields when %s", async (_name, envVars) => {
      const wt = uniqueWt()
      for (const [k, v] of Object.entries(envVars)) {
        process.env[k] = v
      }
      try {
        const r = await resolveUIVerifyParams(wt)
        expect(r).toEqual({ baseURL: null, apiKey: null, modelName: null })
      } finally {
        Object.keys(envVars).forEach((k) => delete process.env[k])
      }
    })
  })
})

describe("napiBridgeStop – error handling", () => {
  test("does not throw and resolves to undefined", async () => {
    // napiBridgeStop wraps bridge.stop() in try/catch – should always resolve
    const result = await napiBridgeStop()
    expect(result).toBeUndefined()
  })
})
