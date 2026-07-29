import { createMemo } from "solid-js"
import { DialogSelect } from "@opencode-ai/tui/ui/dialog-select"
import { useDialog } from "@opencode-ai/tui/ui/dialog"
import open from "open"
import { useKV } from "@opencode-ai/tui/context/kv"
import { AGREEMENT_DEFAULTS } from "@/cli/deveco-legal"
import { ANALYTICS_ENABLED_KEY, TOOL_IMPROVEMENT_ENABLED_KEY } from "@/cli/deveco-privacy-settings"

export const ANALYTICS_MAGPIE_ENABLED_KEY = "analytics_magpie_enabled"

export function toggleAnalyticsMagpieEnabled(input: {
  current: boolean
  set(enabled: boolean): void
  onChange?: (enabled: boolean) => void | Promise<void>
}): boolean {
  const enabled = !input.current
  input.set(enabled)
  try {
    void Promise.resolve(input.onChange?.(enabled)).catch(() => {})
  } catch {
    // Collection settings remain local-first when the worker is unavailable.
  }
  return enabled
}

export function DialogPrivacy(
  props: { onAnalyticsMagpieEnabledChange?: (enabled: boolean) => void | Promise<void> } = {},
) {
  const dialog = useDialog()
  const kv = useKV()

  const analyticsEnabled = () => kv.get("analytics_enabled", true)
  const analyticsMagpieEnabled = () => kv.get(ANALYTICS_MAGPIE_ENABLED_KEY, true)
  const crashUploadEnabled = () => kv.get("crash_upload_enabled", true)
  const toolImprovementEnabled = () => kv.get(TOOL_IMPROVEMENT_ENABLED_KEY, true)

  const options = createMemo(() => [
    {
      title: "Privacy Policy",
      description: "Open Huawei privacy policy page",
      value: "policy",
      onSelect: () => {
        open(AGREEMENT_DEFAULTS.privacy_url).catch(() => {})
        dialog.clear()
      },
    },
    {
      title: "Terms of Use",
      description: "Open Huawei terms of use page",
      value: "terms",
      onSelect: () => {
        open(AGREEMENT_DEFAULTS.terms_url).catch(() => {})
        dialog.clear()
      },
    },
    {
      title: analyticsEnabled() ? "Disable Analytics" : "Enable Analytics",
      description: analyticsEnabled() ? "Turn off usage data collection" : "Turn on usage data collection",
      value: "toggle-analytics",
      onSelect: () => {
        const current = analyticsEnabled()
        kv.set(ANALYTICS_ENABLED_KEY, !current)
        dialog.clear()
      },
    },
    {
      title: analyticsMagpieEnabled() ? "Disable Collector Magpie" : "Enable Collector Magpie",
      description: analyticsMagpieEnabled()
        ? "Turn off Collector Magpie data collection"
        : "Turn on Collector Magpie data collection",
      value: "toggle-analytics-magpie",
      onSelect: () => {
        toggleAnalyticsMagpieEnabled({
          current: analyticsMagpieEnabled(),
          set: (enabled) => kv.set(ANALYTICS_MAGPIE_ENABLED_KEY, enabled),
          onChange: props.onAnalyticsMagpieEnabledChange,
        })
        dialog.clear()
      },
    },
    {
      title: toolImprovementEnabled() ? "Disable Improvement" : "Enable Improvement",
      description: toolImprovementEnabled()
        ? "Stop sharing prompts and replies"
        : "Share prompts and replies",
      value: "toggle-tool-improvement",
      onSelect: () => {
        const current = toolImprovementEnabled()
        kv.set(TOOL_IMPROVEMENT_ENABLED_KEY, !current)
        dialog.clear()
      },
    },
    {
      title: crashUploadEnabled() ? "Disable Crash Detect" : "Enable Crash Detect",
      description: crashUploadEnabled()
        ? "Turn off automatic log collection"
        : "Turn on automatic log collection",
      value: "toggle-crash-upload",
      onSelect: () => {
        const current = crashUploadEnabled()
        kv.set("crash_upload_enabled", !current)
        dialog.clear()
      },
    },
  ])

  return <DialogSelect title="Privacy" options={options()} />
}
