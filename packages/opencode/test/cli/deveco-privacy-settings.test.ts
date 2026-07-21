import { expect, test } from "bun:test"
import path from "path"
import { mkdtemp, writeFile } from "fs/promises"
import os from "os"
import { ANALYTICS_ENABLED_KEY, TOOL_IMPROVEMENT_ENABLED_KEY, readPrivacyBoolean } from "@/cli/deveco-privacy-settings"

test("privacy settings use independent defaults", async () => {
  const state = await mkdtemp(path.join(os.tmpdir(), "deveco-privacy-"))
  expect(await readPrivacyBoolean(ANALYTICS_ENABLED_KEY, true, state)).toBe(true)
  expect(await readPrivacyBoolean(TOOL_IMPROVEMENT_ENABLED_KEY, true, state)).toBe(true)
})

test("an explicit false value is preserved", async () => {
  const state = await mkdtemp(path.join(os.tmpdir(), "deveco-privacy-"))
  await writeFile(
    path.join(state, "kv.json"),
    JSON.stringify({
      analytics_enabled: true,
      deveco_tool_improvement_enabled: false,
    }),
  )
  expect(await readPrivacyBoolean(TOOL_IMPROVEMENT_ENABLED_KEY, true, state)).toBe(false)
})
