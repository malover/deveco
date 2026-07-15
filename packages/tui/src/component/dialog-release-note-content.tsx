import { TextAttributes } from "@opentui/core"
import { ScrollBoxRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { Show, createEffect, createMemo, onMount } from "solid-js"
import { useDialog } from "../ui/dialog"
import { useTheme } from "../context/theme"
import { useI18n } from "../i18n"
import { useBindings } from "../keymap"
import { DialogReleaseNoteVersions } from "./dialog-release-note-versions"
import { adjacentRelease, normalizeVersion, type ReleaseMeta } from "../release-notes/shared"
import { openReleaseNote } from "../release-notes/navigate"
import type { ReleaseNotesParentProps } from "../release-notes/types"

export function DialogReleaseNoteContent(props: {
  tag: string
  date?: string
  body: string | null
  parentProps: ReleaseNotesParentProps
}) {
  const { t } = useI18n()
  const dialog = useDialog()
  const { theme, syntax } = useTheme()
  const dimensions = useTerminalDimensions()

  const maxDialogHeight = () => Math.max(20, Math.floor((3 * dimensions().height) / 4) - 6)

  const neighbors = createMemo(() => {
    const asc = [...props.parentProps.releases].reverse()
    return {
      prev: adjacentRelease(asc, props.tag, -1),
      next: adjacentRelease(asc, props.tag, 1),
    }
  })

  const jump = (target: ReleaseMeta | undefined) => {
    if (target) openReleaseNote(dialog, target.tag, target.createdAt, props.parentProps)
  }

  onMount(() => {
    dialog.setSize("xlarge")
  })

  let scrollRef: ScrollBoxRenderable | undefined
  createEffect(() => {
    const body = props.body
    if (body) {
      queueMicrotask(() => {
        if (scrollRef && !scrollRef.isDestroyed) scrollRef.scrollTo(0)
      })
    }
  })

  const back = () => {
    dialog.replace(() => <DialogReleaseNoteVersions {...props.parentProps} />)
  }

  useBindings(() => {
    const bindings: Array<{ key: string; desc: string; group: string; cmd: () => void; disabled?: boolean }> = [
      { key: "left", desc: t("dialog.action_back"), group: t("category.dialog"), cmd: back },
    ]
    const { prev, next } = neighbors()
    if (prev) {
      bindings.push({ key: "p", desc: t("dialog.release_notes_prev"), group: t("category.dialog"), cmd: () => jump(prev) })
    }
    if (next) {
      bindings.push({ key: "n", desc: t("dialog.release_notes_next"), group: t("category.dialog"), cmd: () => jump(next) })
    }
    return { bindings }
  })

  return (
    <box
      gap={1}
      paddingTop={1}
      paddingBottom={1}
      flexGrow={1}
      maxHeight={maxDialogHeight()}
      backgroundColor={theme.backgroundPanel}
    >
      <box paddingLeft={3} paddingRight={3} flexShrink={0}>
        <box flexDirection="row" justifyContent="space-between">
          <text fg={theme.text} attributes={TextAttributes.BOLD}>
            {props.parentProps.title ?? t("dialog.title_release_notes")} —{" "}
            <span style={{ fg: theme.textMuted }}>{normalizeVersion(props.tag) ?? props.tag}</span>
            <Show when={props.date}>
              <span style={{ fg: theme.textMuted }}>  ·  {props.date}</span>
            </Show>
          </text>
          <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
            {t("dialog.esc")}
          </text>
        </box>
      </box>

      <box flexGrow={1} flexShrink={1}>
        <Show
          when={props.body}
          fallback={
            <box paddingLeft={3} paddingTop={1} flexDirection="column" gap={1}>
              <text fg={theme.textMuted}>○</text>
              <text fg={theme.textMuted}>{t("dialog.no_release_notes")}</text>
            </box>
          }
        >
          <scrollbox
            ref={(r: ScrollBoxRenderable) => (scrollRef = r)}
            flexGrow={1}
            minHeight={0}
            paddingLeft={1}
            paddingRight={1}
            scrollbarOptions={{ visible: false }}
          >
            <box paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1} backgroundColor={theme.backgroundPanel}>
              <markdown
                content={props.body!}
                syntaxStyle={syntax()}
                tableOptions={{ style: "grid" }}
                fg={theme.markdownText}
                bg={theme.backgroundPanel}
              />
            </box>
          </scrollbox>
        </Show>
      </box>

      <box flexShrink={0} paddingLeft={3} paddingRight={3} flexDirection="row" gap={3}>
        <KeyChip key="←" label={t("dialog.action_back")} />
        <Show when={neighbors().prev}>
          <KeyChip key="p" label={t("dialog.release_notes_prev")} />
        </Show>
        <Show when={neighbors().next}>
          <KeyChip key="n" label={t("dialog.release_notes_next")} />
        </Show>
      </box>
    </box>
  )
}

function KeyChip(props: { key: string; label: string }) {
  const { theme } = useTheme()
  return (
    <box flexDirection="row" gap={1}>
      <text fg={theme.text} attributes={TextAttributes.BOLD}>
        {props.key}
      </text>
      <text fg={theme.textMuted}>{props.label}</text>
    </box>
  )
}

