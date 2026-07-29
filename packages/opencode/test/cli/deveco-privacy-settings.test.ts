import { expect, test } from "bun:test"
import path from "path"
import { mkdtemp, writeFile } from "fs/promises"
import os from "os"
import { Flock } from "@opencode-ai/core/util/flock"
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

test("privacy reads do not wait for the TUI writer lock", async () => {
  const state = await mkdtemp(path.join(os.tmpdir(), "deveco-privacy-"))
  const file = path.join(state, "kv.json")
  await writeFile(file, JSON.stringify({ analytics_enabled: true }))
  await using _ = await Flock.acquire(`tui-kv:${file}`)

  const result = await Promise.race([
    readPrivacyBoolean(ANALYTICS_ENABLED_KEY, false, state),
    Bun.sleep(500).then(() => "timeout" as const),
  ])

  expect(result).toBe(true)
})
