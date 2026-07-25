import { DialogSelect } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { useI18n } from "../i18n"
import { useBindings } from "../keymap"
import type { TuiAttention, TuiAttentionSoundName } from "@opencode-ai/plugin/tui"
import { DialogSoundPicker } from "./dialog-sound-picker"
import { findCatalogEntry, DEFAULT_SOUND_IDS } from "../sound-registry"

const SOUND_EVENTS: ReadonlyArray<TuiAttentionSoundName> = [
  "default",
  "question",
  "permission",
  "error",
  "done",
  "subagent_done",
]

export function DialogSoundCustomize(props: {
  soundboard: TuiAttention["soundboard"]
  onBack?: () => void
}) {
  const { t } = useI18n()
  const dialog = useDialog()

  const back = () => {
    if (props.onBack) props.onBack()
    else dialog.clear()
  }

  useBindings(() => ({
    bindings: [{ key: "left", desc: t("dialog.action_back"), group: t("category.dialog"), cmd: back }],
  }))

  const options = SOUND_EVENTS.map((event) => {
    const customId = props.soundboard.getCustomSound(event)
    const soundId = customId ?? DEFAULT_SOUND_IDS[event]
    const entry = soundId ? findCatalogEntry(soundId) : undefined
    const label = entry?.name ?? event
    return {
      title: `${t(`dialog.sound_name_${event}`)}: ${label}`,
      value: event,
    }
  })

  return (
    <DialogSelect
      title={t("dialog.dialog_title_customize_sounds")}
      options={options}
      onSelect={(opt) => {
        dialog.replace(() => (
          <DialogSoundPicker
            soundboard={props.soundboard}
            event={opt.value as TuiAttentionSoundName}
            onBack={() => dialog.replace(() => <DialogSoundCustomize soundboard={props.soundboard} onBack={props.onBack} />)}
          />
        ))
      }}
      footerHints={[{ title: "←", label: t("dialog.action_back"), side: "right" }]}
      skipFilter
    />
  )
}
