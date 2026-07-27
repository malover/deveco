import { createEffect, createMemo, createSignal, For, Show } from "solid-js"
import { type ScrollBoxRenderable, TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useI18n } from "../i18n"
import { useBtw } from "../context/btw"
import { SplitBorder } from "../ui/border"
import { useBindings } from "../keymap"
import { useTerminalDimensions } from "@opentui/solid"
import { countWrappedTerminalLines } from "../util/text-wrap"

const ANSWER_AREA_MAX_HEIGHT = 6
const QUESTION_LIST_MAX_HEIGHT = 3

export function BtwPanel(props: { width?: number } = {}) {
  const btw = useBtw()
  const { theme } = useTheme()
  const { t } = useI18n()
  const dimensions = useTerminalDimensions()

  let scrollRef: ScrollBoxRenderable | undefined
  let questionScrollRef: ScrollBoxRenderable | undefined
  const current = createMemo(() => btw.current())
  const records = createMemo(() => btw.state().records)
  const currentDone = createMemo(() => {
    const record = current()
    return Boolean(record && !record.loading)
  })
  const currentAnswerText = createMemo(() => current()?.answer.trim() ?? "")
  const currentErrorText = createMemo(() => {
    const error = current()?.error
    if (!error) return ""
    const message = error.message.trim()
    if (message) return message
    const provider = error.providerID ?? t("btw.provider_selected")
    switch (error.code) {
      case "auth":
        return t("btw.error_auth", { provider })
      case "quota":
        return t("btw.error_quota", { provider })
      case "rate_limit":
        return t("btw.error_rate_limit", { provider })
      case "model_not_found":
        return t("btw.error_model_not_found")
      case "context_overflow":
        return t("btw.error_context_overflow")
      case "provider":
        return t("btw.error_provider", { provider })
      case "unknown":
        return t("btw.error_unknown")
    }
    return t("btw.error_unknown")
  })
  const currentDisplayText = createMemo(() => currentErrorText() || currentAnswerText())
  const panelWidth = createMemo(() => Math.max(1, props.width ?? dimensions().width))
  const answerTextWidth = createMemo(() => Math.max(1, panelWidth() - 4 - (currentErrorText() ? 2 : 0)))
  const questionListHeight = createMemo(() => Math.max(1, Math.min(records().length, QUESTION_LIST_MAX_HEIGHT)))
  const answerFullHeight = createMemo(() => {
    const record = current()
    if (!record) return 1
    if (record.loading && !record.answer && !record.error) return 1
    const text = currentDisplayText()
    return Math.max(1, countWrappedTerminalLines(text, answerTextWidth()))
  })
  const answerContentHeight = createMemo(() => Math.min(answerFullHeight(), ANSWER_AREA_MAX_HEIGHT))
  const answerMaxScrollTop = createMemo(() => Math.max(0, answerFullHeight() - answerContentHeight()))
  const [answerScrollLine, setAnswerScrollLine] = createSignal(Number.MAX_SAFE_INTEGER)
  const hintItems = createMemo(() => {
    const record = current()
    if (!record) return ["Esc to close"]
    if (record.loading) {
      if (records().length <= 1) return ["Esc to close"]
      return ["←/→ to switch", "x to clear history", "Esc to close"]
    }
    const hints = records().length > 1 ? ["←/→ to switch"] : ["↑/↓ to scroll"]
    if (records().length > 1) hints.push("x to delete")
    if (record.answer && !record.error)
      hints.push(btw.state().copyNoticeID === record.id ? "copied to clipboard" : "c to copy")
    if (record.answer && !record.error) hints.push("f to fork")
    hints.push("Esc to close")
    return hints
  })

  // Auto-scroll to the bottom as the answer streams in.
  createEffect(() => {
    currentDisplayText()
    answerFullHeight()
    if (current()?.loading) setAnswerScrollLine(Number.MAX_SAFE_INTEGER)
    if (current()?.loading || answerScrollLine() === Number.MAX_SAFE_INTEGER) scheduleAnswerScroll()
  })

  createEffect(() => {
    const index = btw.state().index
    const count = records().length
    setAnswerScrollLine(Number.MAX_SAFE_INTEGER)
    scheduleAnswerScroll()
    queueMicrotask(() => scheduleQuestionScroll(index, count))
  })

  function scheduleQuestionScroll(index: number, count: number) {
    scrollQuestionIntoView(index, count)
    setTimeout(() => scrollQuestionIntoView(index, count), 0)
  }

  function scheduleAnswerScroll() {
    scrollAnswerTo(answerScrollLine())
    queueMicrotask(() => scrollAnswerTo(answerScrollLine()))
    setTimeout(() => scrollAnswerTo(answerScrollLine()), 0)
  }

  function scrollAnswerTo(line: number) {
    const scroll = scrollRef
    if (!scroll || scroll.isDestroyed) return
    scroll.scrollTo(line)
  }

  function scrollQuestionIntoView(index: number, count: number) {
    const scroll = questionScrollRef
    if (!scroll || scroll.isDestroyed) return
    if (index === count - 1) {
      scroll.scrollTo(Number.MAX_SAFE_INTEGER)
      return
    }
    if (index < scroll.scrollTop) {
      scroll.scrollTo(index)
      return
    }
    if (index >= scroll.scrollTop + scroll.viewport.height) {
      scroll.scrollTo(index - scroll.viewport.height + 1)
    }
  }

  function scrollAnswer(delta: number) {
    setAnswerScrollLine((line) => {
      const maxScrollTop = answerMaxScrollTop()
      const currentLine = line === Number.MAX_SAFE_INTEGER ? maxScrollTop : line
      const next = currentLine + delta
      if (next >= maxScrollTop) return Number.MAX_SAFE_INTEGER
      return Math.max(0, next)
    })
    scheduleAnswerScroll()
  }

  useBindings(() => ({
    enabled: () => btw.state().open && currentDone(),
    priority: 3,
    bindings: [
      { key: "up", cmd: () => scrollAnswer(-1) },
      { key: "down", cmd: () => scrollAnswer(1) },
    ],
  }))

  const hasError = () => Boolean(currentErrorText())
  const hasAnswer = () => Boolean(currentAnswerText())

  return (
    <box
      flexShrink={0}
      flexDirection="column"
      backgroundColor={theme.backgroundPanel}
      {...SplitBorder}
      border={["left"]}
      borderColor={theme.border}
      paddingLeft={2}
      paddingRight={1}
      paddingTop={1}
      paddingBottom={1}
    >
      <box flexDirection="column" gap={1}>
        <box flexDirection="row" alignItems="center" justifyContent="space-between" gap={1}>
          <text fg={theme.accent} attributes={TextAttributes.BOLD}>
            ✦ {t("btw.title")}
          </text>
          <text fg={theme.textMuted}>
            {btw.state().index + 1}/{records().length}
          </text>
        </box>

        <box height={questionListHeight()}>
          <scrollbox
            ref={(r: ScrollBoxRenderable) => (questionScrollRef = r)}
            height={questionListHeight()}
            maxHeight={questionListHeight()}
            scrollbarOptions={{ visible: false }}
          >
            <For each={records()}>
              {(record, index) => {
                const selected = () => index() === btw.state().index
                return (
                  <box flexDirection="row" gap={1}>
                    <text fg={selected() ? theme.accent : theme.textMuted}>{selected() ? "›" : " "}</text>
                    <text
                      fg={selected() ? theme.text : theme.textMuted}
                      attributes={selected() ? TextAttributes.BOLD : undefined}
                      wrapMode="none"
                      width="100%"
                    >
                      {index() + 1}. {record.question}
                    </text>
                    <Show when={record.loading}>
                      <text fg={theme.textMuted}>…</text>
                    </Show>
                  </box>
                )
              }}
            </For>
          </scrollbox>
        </box>

        <box flexDirection="row" gap={1} height={answerContentHeight()}>
          <scrollbox
            ref={(r: ScrollBoxRenderable) => (scrollRef = r)}
            flexGrow={1}
            height={answerContentHeight()}
            maxHeight={answerContentHeight()}
            scrollbarOptions={{ visible: false }}
            stickyScroll={true}
            stickyStart="bottom"
          >
            <Show
              when={!hasError()}
              fallback={
                <box flexDirection="row" gap={1} alignItems="flex-start" height={answerFullHeight()}>
                  <text fg={theme.error}>!</text>
                  <text fg={theme.error} wrapMode="word" width="100%" height={answerFullHeight()}>
                    {currentErrorText()}
                  </text>
                </box>
              }
            >
              <Show
                when={hasAnswer()}
                fallback={
                  <box flexDirection="row" alignItems="flex-start" height={answerContentHeight()}>
                    <text fg={theme.textMuted}>▎ {t("btw.loading_inline")}</text>
                  </box>
                }
              >
                <box flexDirection="column" alignItems="flex-start" height={answerFullHeight()}>
                  <text fg={theme.text} wrapMode="word" width="100%" height={answerFullHeight()}>
                    {currentAnswerText()}
                  </text>
                </box>
              </Show>
            </Show>
          </scrollbox>
        </box>

        <box flexDirection="row" justifyContent="flex-start" gap={2}>
          <For each={hintItems()}>{(hint) => <text fg={theme.textMuted}>{hint}</text>}</For>
        </box>
      </box>
    </box>
  )
}
