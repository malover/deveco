import { createSignal } from "solid-js"
import { DialogSelect } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { useI18n } from "../i18n"
import { useTheme } from "../context/theme"
import { useBindings } from "../keymap"
import type { TuiAttention, TuiAttentionSoundName } from "@opencode-ai/plugin/tui"
import { SOUND_CATEGORIES, DEFAULT_SOUND_IDS, findCatalogEntry } from "../sound-registry"

export function DialogSoundPicker(props: {
  soundboard: TuiAttention["soundboard"]
  event: TuiAttentionSoundName
  onBack?: () => void
}) {
  const { t } = useI18n()
  const dialog = useDialog()
  const { theme } = useTheme()

  const back = () => {
    if (props.onBack) props.onBack()
    else dialog.clear()
  }

  const currentCustom = props.soundboard.getCustomSound(props.event)
  const defaultId = DEFAULT_SOUND_IDS[props.event]
  const defaultEntry = defaultId ? findCatalogEntry(defaultId) : undefined
  const defaultLabel = defaultEntry?.name ?? props.event
  const activeId = currentCustom ?? defaultId
  const catalog = props.soundboard.available()

  const [focusedId, setFocusedId] = createSignal<string | undefined>(defaultId)

  useBindings(() => ({
    bindings: [
      { key: "left", desc: t("dialog.action_back"), group: t("category.dialog"), cmd: back },
      {
        key: "space",
        desc: t("dialog.sound_preview"),
        group: t("category.dialog"),
        cmd: () => {
          const id = focusedId()
          if (id) props.soundboard.preview(id)
        },
      },
    ],
  }))

  const markGutter = () => <text fg={theme.success}>●</text>

  const options = [
    {
      title: `${defaultLabel} (${t("dialog.sound_reset_hint")})`,
      value: "__reset__" as const,
      disabled: currentCustom === undefined,
      gutter: currentCustom === undefined ? markGutter : undefined,
    },
    ...catalog.map((s) => ({
      title: s.name,
      value: s.id,
      category: SOUND_CATEGORIES.find((c) => c.id === s.category)?.name ?? s.category,
      gutter: activeId === s.id ? markGutter : undefined,
    })),
  ]

  return (
    <DialogSelect
      title={`${t(`dialog.sound_name_${props.event}`)} - ${t("dialog.dialog_title_pick_sound")}`}
      options={options}
      onMove={(opt) => setFocusedId(opt.value)}
      onSelect={(opt) => {
        if (opt.value === "__reset__") {
          props.soundboard.setCustomSound(props.event, undefined)
        } else {
          props.soundboard.setCustomSound(props.event, opt.value)
        }
        back()
      }}
      footerHints={[
        { title: "space", label: t("dialog.sound_preview"), side: "left" },
        { title: "enter", label: t("dialog.sound_confirm"), side: "left" },
        { title: "←", label: t("dialog.action_back"), side: "right" },
      ]}
      skipFilter
    />
  )
}
