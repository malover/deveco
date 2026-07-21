import { createMemo } from "solid-js"
import { DialogSelect } from "@opencode-ai/tui/ui/dialog-select"
import { useDialog } from "@opencode-ai/tui/ui/dialog"
import open from "open"
import { useKV } from "@opencode-ai/tui/context/kv"
import { AGREEMENT_DEFAULTS } from "@/cli/deveco-legal"
import { ANALYTICS_ENABLED_KEY, TOOL_IMPROVEMENT_ENABLED_KEY } from "@/cli/deveco-privacy-settings"

export function DialogPrivacy() {
  const dialog = useDialog()
  const kv = useKV()

  const analyticsEnabled = () => kv.get("analytics_enabled", true)
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
