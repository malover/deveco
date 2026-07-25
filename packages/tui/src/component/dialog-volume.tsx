import { DialogSelect } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { useI18n } from "../i18n"
import { useKV } from "../context/kv"
import { useTuiConfig } from "../config"
import { useBindings } from "../keymap"

const VOLUME_STEPS = Array.from({ length: 10 }, (_, i) => (i + 1) / 10)

export function DialogVolumeSelect(props: { onBack?: () => void }) {
  const { t } = useI18n()
  const dialog = useDialog()
  const kv = useKV()
  const config = useTuiConfig()

  const back = () => {
    if (props.onBack) props.onBack()
    else dialog.clear()
  }

  useBindings(() => ({
    bindings: [{ key: "left", desc: t("dialog.action_back"), group: t("category.dialog"), cmd: back }],
  }))

  const current = kv.get("attention_volume", config.attention.volume)

  const options = VOLUME_STEPS.map((step) => ({
    title: `${Math.round(step * 100)}%`,
    value: step,
  }))

  return (
    <DialogSelect
      title={t("dialog.dialog_title_volume")}
      options={options}
      current={current}
      onSelect={(opt) => {
        kv.set("attention_volume", opt.value)
        back()
      }}
      footerHints={[{ title: "←", label: t("dialog.action_back"), side: "right" }]}
      skipFilter
    />
  )
}
