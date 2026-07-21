import path from "path"
import { Flock } from "@opencode-ai/core/util/flock"
import { Global } from "@opencode-ai/core/global"
import { Filesystem } from "@/util/filesystem"

export const ANALYTICS_ENABLED_KEY = "analytics_enabled"
export const TOOL_IMPROVEMENT_ENABLED_KEY = "deveco_tool_improvement_enabled"
export const TOOL_IMPROVEMENT_HEADER = "X-DevEco-Improvement-Enabled"

export async function readPrivacyBoolean(key: string, fallback: boolean, state = Global.Path.state) {
  const file = path.join(state, "kv.json")
  try {
    const kv = await Flock.withLock(`tui-kv:${file}`, () => Filesystem.readJson<Record<string, unknown>>(file))
    return typeof kv[key] === "boolean" ? kv[key] : fallback
  } catch {
    return fallback
  }
}

export const readAnalyticsEnabled = () => readPrivacyBoolean(ANALYTICS_ENABLED_KEY, true)
export const readToolImprovementEnabled = () => readPrivacyBoolean(TOOL_IMPROVEMENT_ENABLED_KEY, true)
