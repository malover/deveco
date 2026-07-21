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

  const analyticsEnabled = () => kv.get(ANALYTICS_ENABLED_KEY, true)
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
      title: toolImprovementEnabled() ? "Disable Tool Improvement" : "Enable Tool Improvement",
      description: toolImprovementEnabled()
        ? "Turn off tool improvement data collection"
        : "Turn on tool improvement data collection",
      value: "toggle-tool-improvement",
      onSelect: () => {
        const current = toolImprovementEnabled()
        kv.set(TOOL_IMPROVEMENT_ENABLED_KEY, !current)
        dialog.clear()
      },
    },
  ])

  return <DialogSelect title="Privacy" options={options()} />
}
