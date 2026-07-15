import { InstallationVersion } from "@opencode-ai/core/installation/version"
import { createMemo, onMount } from "solid-js"
import { useDialog } from "../ui/dialog"
import { DialogSelect } from "../ui/dialog-select"
import { useTheme } from "../context/theme"
import { useI18n } from "../i18n"
import { openReleaseNote } from "../release-notes/navigate"
import type { ReleaseNotesParentProps } from "../release-notes/types"
import { formatDate, normalizeVersion } from "../release-notes/shared"

const currentVersion = normalizeVersion(InstallationVersion)

export function DialogReleaseNoteVersions(props: ReleaseNotesParentProps) {
  const { t } = useI18n()
  const dialog = useDialog()
  const { theme } = useTheme()

  onMount(() => {
    dialog.setSize("medium")
  })

  const view = createMemo(() => {
    if (!props.releases.length)
      return {
        options: [] as Array<{ title: string; description: string; value: string; category: string }>,
        current: undefined as string | undefined,
      }
    const current = props.releases.find((r) => normalizeVersion(r.tag) === currentVersion)?.tag
    const options = props.releases.map((rel) => {
      const isCurrent = rel.tag === current
      return {
        title: isCurrent ? `${rel.tag} (${t("dialog.release_notes_current")})` : rel.tag,
        description: formatDate(rel.createdAt),
        value: rel.tag,
        category: rel.prerelease ? t("dialog.release_notes_prerelease") : "",
      }
    })
    return { options, current }
  })

  return (
    <DialogSelect
      title={props.title ?? t("dialog.title_release_notes")}
      options={view().options}
      current={view().current}
      emptyView={
        <box paddingLeft={4} paddingTop={1}>
          <text fg={theme.textMuted}>{t("dialog.no_release_notes")}</text>
        </box>
      }
      actions={[]}
      onSelect={(option) => {
        const rel = props.releases.find((r) => r.tag === option.value)
        openReleaseNote(dialog, option.value, rel?.createdAt, props)
      }}
    />
  )
}
