import { createEffect, onCleanup, Show } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { RGBA, type ScrollBoxRenderable, TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useI18n } from "../i18n"
import { useBtw } from "../context/btw"
import { useBindings } from "../keymap"
import { useClipboard } from "../context/clipboard"
import { useToast } from "../ui/toast"

const PANEL_MAX_WIDTH = 84
const PANEL_MIN_WIDTH = 48
const ANSWER_AREA_HEIGHT = 6

export function BtwOverlay() {
  const btw = useBtw()
  const { theme } = useTheme()
  const { t } = useI18n()
  const dimensions = useTerminalDimensions()
  const clipboard = useClipboard()
  const toast = useToast()

  let scrollRef: ScrollBoxRenderable | undefined

  const panelWidth = () =>
    Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, dimensions().width - 8))
  const panelMaxHeight = () => Math.max(0, dimensions().height - 4)

  function copyAnswer() {
    const text = btw.state().answer
    if (!text) {
      toast.show({ message: t("btw.copy_empty"), variant: "info" })
      return
    }
    void clipboard.write?.(text).then(
      () => toast.show({ message: t("btw.copy_success"), variant: "success" }),
      () => toast.show({ message: t("btw.copy_failed"), variant: "error" }),
    )
  }

  useBindings(() => ({
    enabled: () => btw.state().open,
    bindings: [
      { key: "escape", cmd: () => btw.close() },
      { key: "space", cmd: () => btw.close() },
      { key: "return", cmd: () => btw.close() },
      { key: "y", cmd: () => copyAnswer() },
    ],
  }))

  // Auto-scroll to the bottom as the answer streams in.
  createEffect(() => {
    btw.state().answer
    queueMicrotask(() => scrollRef?.scrollTo?.(Number.MAX_SAFE_INTEGER))
  })

  onCleanup(() => {
    if (btw.state().open) btw.close()
  })

  const hasError = () => Boolean(btw.state().error)
  const hasAnswer = () => Boolean(btw.state().answer)

  return (
    <box
      position="absolute"
      zIndex={3000}
      left={0}
      top={0}
      width={dimensions().width}
      height={dimensions().height}
      alignItems="center"
      justifyContent="center"
      backgroundColor={RGBA.fromInts(0, 0, 0, 180)}
    >
      <box
        flexDirection="column"
        width={panelWidth()}
        maxHeight={panelMaxHeight()}
        backgroundColor={theme.backgroundPanel}
        border={["top", "right", "bottom", "left"]}
        borderStyle="rounded"
        borderColor={theme.borderSubtle}
        paddingLeft={2}
        paddingRight={2}
      >
        {/* Title row */}
        <box flexDirection="row" alignItems="center" paddingTop={1} paddingBottom={0}>
          <text fg={theme.accent} attributes={TextAttributes.BOLD}>
            ✦ {t("btw.title")}
          </text>
        </box>

        {/* Question row */}
        <box flexDirection="row" paddingTop={1} paddingBottom={1} gap={1}>
          <text fg={theme.accent}>?</text>
          <text fg={theme.text} wrapMode="word" width="100%">
            {btw.state().question}
          </text>
        </box>

        {/* Answer area — fixed height, always renders a scrollbox so the dialog
            height stays stable across loading / streaming / error states.
            Prefix and content live in the same row inside the scrollbox so
            they line up correctly. */}
        <box flexDirection="row" gap={1} height={ANSWER_AREA_HEIGHT}>
          <scrollbox
            ref={(r: ScrollBoxRenderable) => (scrollRef = r)}
            flexGrow={1}
            maxHeight={ANSWER_AREA_HEIGHT}
            scrollbarOptions={{ visible: false }}
          >
            <Show
              when={!hasError()}
              fallback={
                <box flexDirection="row" gap={1} alignItems="center">
                  <text fg={theme.error}>!</text>
                  <text fg={theme.error} wrapMode="word" width="100%">
                    {btw.state().error}
                  </text>
                </box>
              }
            >
              <Show
                when={hasAnswer()}
                fallback={
                  <box flexDirection="row" alignItems="flex-start" height={ANSWER_AREA_HEIGHT}>
                    <text fg={theme.textMuted}>▎  {t("btw.loading_inline")}</text>
                  </box>
                }
              >
                <box flexDirection="row" gap={1} alignItems="center">
                  <text fg={theme.text}>→</text>
                  <text fg={theme.text} wrapMode="word" width="100%">
                    {btw.state().answer}
                  </text>
                </box>
              </Show>
            </Show>
          </scrollbox>
        </box>

        {/* Footer */}
        <box flexDirection="row" justifyContent="flex-end" alignItems="center" paddingTop={1} paddingBottom={1}>
          <text fg={theme.textMuted}>{t("btw.closeHint")}</text>
        </box>
      </box>
    </box>
  )
}
