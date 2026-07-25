import { DialogSelect } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { useI18n } from "../i18n"
import { useKV } from "../context/kv"
import { useTuiConfig } from "../config"
import type { TuiAttention } from "@opencode-ai/plugin/tui"
import { DialogVolumeSelect } from "./dialog-volume"
import { DialogSoundCustomize } from "./dialog-sound-customize"

export function DialogSoundSettings(props: {
  soundboard: TuiAttention["soundboard"]
}) {
  const { t } = useI18n()
  const dialog = useDialog()
  const kv = useKV()
  const config = useTuiConfig()

  const soundEnabled = kv.get("attention_sound_enabled", config.attention.sound)
  const attentionEnabled = kv.get("attention_enabled", config.attention.enabled)
  const backToSelf = () => dialog.replace(() => <DialogSoundSettings soundboard={props.soundboard} />)

  const options = [
    {
      title: attentionEnabled
        ? t("command.disable_attention_all")
        : t("command.enable_attention_all"),
      value: "toggle_attention" as const,
    },
    {
      title: t("command.set_notification_volume"),
      value: "volume" as const,
    },
    {
      title: t("command.customize_sounds"),
      value: "customize" as const,
    },
  ]

  return (
    <DialogSelect
      title={t("dialog.dialog_title_sound_settings")}
      options={options}
      onSelect={(opt) => {
        if (opt.value === "toggle_attention") {
          kv.set("attention_enabled", !attentionEnabled)
          backToSelf()
          return
        }
        if (opt.value === "volume") {
          dialog.replace(() => <DialogVolumeSelect onBack={backToSelf} />)
          return
        }
        if (opt.value === "customize") {
          dialog.replace(() => <DialogSoundCustomize soundboard={props.soundboard} onBack={backToSelf} />)
        }
      }}
      skipFilter
    />
  )
}
