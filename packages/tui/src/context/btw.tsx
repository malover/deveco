import {
  batch,
  createContext,
  onCleanup,
  useContext,
  type Accessor,
  type ParentComponent,
} from "solid-js"
import { createStore } from "solid-js/store"
import { useEvent } from "./event"
import { useSDK } from "./sdk"
import { useBindings } from "../keymap"
import { useClipboard } from "./clipboard"
import { useToast } from "../ui/toast"
import { useI18n } from "../i18n"
import { useRoute } from "./route"

export type BtwRecord = {
  id: string
  asideID: string
  sessionID: string
  question: string
  answer: string
  loading: boolean
  error: string | undefined
}

export type BtwState = {
  open: boolean
  records: BtwRecord[]
  index: number
  copyNoticeID: string | undefined
}

const initial: BtwState = {
  open: false,
  records: [],
  index: 0,
  copyNoticeID: undefined,
}

export type BtwOpenInput = {
  sessionID: string
  question: string
  model?: string
}

export interface BtwContextValue {
  state: Accessor<BtwState>
  current: Accessor<BtwRecord | undefined>
  open: (input: BtwOpenInput) => void
  close: () => void
  next: () => void
  previous: () => void
  deleteCurrent: () => void
  forkCurrent: () => void
  copyCurrent: () => void
}

const BtwContext = createContext<BtwContextValue>()

export function useBtw(): BtwContextValue {
  const ctx = useContext(BtwContext)
  if (!ctx) throw new Error("useBtw must be used within a BtwProvider")
  return ctx
}

export const BtwProvider: ParentComponent = (props) => {
  const sdk = useSDK()
  const event = useEvent()
  const clipboard = useClipboard()
  const toast = useToast()
  const { t } = useI18n()
  const route = useRoute()

  const [state, setState] = createStore<BtwState>({ ...initial })

  const controllers = new Map<string, AbortController>()
  const canceledAsideIDs = new Set<string>()
  let copyNoticeTimer: ReturnType<typeof setTimeout> | undefined
  let openCloseLock = false

  const current = () => state.records[state.index]

  function updateRecord(asideID: string, patch: (record: BtwRecord) => Partial<BtwRecord>) {
    if (canceledAsideIDs.has(asideID)) return
    const index = state.records.findIndex((record) => record.asideID === asideID)
    if (index === -1) return
    setState("records", index, (record) => ({ ...record, ...patch(record) }))
  }

  function abortRecord(asideID: string) {
    canceledAsideIDs.add(asideID)
    controllers.get(asideID)?.abort()
    controllers.delete(asideID)
  }

  function close() {
    if (openCloseLock) return
    openCloseLock = true
    try {
      for (const record of state.records) {
        if (record.loading) canceledAsideIDs.add(record.asideID)
      }
      for (const controller of controllers.values()) controller.abort()
      controllers.clear()
      setState("open", false)
      setState("records", (records) => records.map((record) => ({ ...record, loading: false })))
      setState("copyNoticeID", undefined)
    } finally {
      openCloseLock = false
    }
  }

  function open(input: BtwOpenInput) {
    const asideID = `btw_${crypto.randomUUID().replaceAll("-", "")}`
    const nextIndex = state.records.length

    batch(() => {
      setState("records", (records) => [
        ...records,
        {
          id: asideID,
          asideID,
          sessionID: input.sessionID,
          question: input.question,
          answer: "",
          loading: true,
          error: undefined,
        },
      ])
      setState("open", true)
      setState("index", nextIndex)
    })

    const controller = new AbortController()
    controllers.set(asideID, controller)

    void sdk.client.session
      .btw(
        {
          sessionID: input.sessionID,
          asideID,
          text: input.question,
          model: input.model,
        },
        { signal: controller.signal, throwOnError: false },
      )
      .then((result: { data?: unknown; error?: unknown }) => {
        if (controller.signal.aborted) return
        controllers.delete(asideID)
        if (result.error) {
          updateRecord(asideID, () => ({
            loading: false,
            error: typeof result.error === "string" ? result.error : "request failed",
          }))
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        controllers.delete(asideID)
        updateRecord(asideID, () => ({
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        }))
      })
  }

  const stopEvent = event.subscribe((evt) => {
    if (
      evt.type !== "btw.start" &&
      evt.type !== "btw.delta" &&
      evt.type !== "btw.complete" &&
      evt.type !== "btw.error"
    ) {
      return
    }

    const asideID = evt.properties.asideID
    switch (evt.type) {
      case "btw.start":
        break
      case "btw.delta":
        updateRecord(asideID, (record) => ({ answer: record.answer + evt.properties.text }))
        break
      case "btw.complete":
        controllers.delete(asideID)
        updateRecord(asideID, () => ({ loading: false }))
        break
      case "btw.error":
        controllers.delete(asideID)
        updateRecord(asideID, () => ({ loading: false, error: evt.properties.message }))
        break
    }
  })

  function next() {
    if (state.records.length <= 1) return
    setState("index", (state.index + 1) % state.records.length)
  }

  function previous() {
    if (state.records.length <= 1) return
    setState("index", (state.index - 1 + state.records.length) % state.records.length)
  }

  function deleteCurrent() {
    const record = current()
    if (!record) return

    if (record.loading && state.records.length > 1) {
      for (const item of state.records) {
        if (item.id === record.id) continue
        abortRecord(item.asideID)
      }
      batch(() => {
        setState("records", [{ ...record }])
        setState("index", 0)
      })
      return
    }

    abortRecord(record.asideID)
    const nextRecords = state.records.filter((item) => item.id !== record.id)
    batch(() => {
      setState("records", nextRecords)
      setState("index", Math.max(0, Math.min(state.index, nextRecords.length - 1)))
      if (nextRecords.length === 0) setState("open", false)
    })
  }

  function forkCurrent() {
    const record = current()
    if (!record) return
    if (record.loading) return
    const answer = record.answer || record.error || ""
    if (!answer) return
    void sdk.client.session
      .fork({
        sessionID: record.sessionID,
        btw: {
          question: record.question,
          answer,
        },
      })
      .then((forked) => {
        if (forked.error || !forked.data) {
          toast.show({ message: t("toast.session_fork_failed"), variant: "error" })
          return
        }
        route.navigate({
          type: "session",
          sessionID: forked.data.id,
        })
        close()
      })
      .catch(() => toast.show({ message: t("toast.session_fork_failed"), variant: "error" }))
  }

  onCleanup(() => {
    stopEvent()
    if (copyNoticeTimer) clearTimeout(copyNoticeTimer)
    for (const controller of controllers.values()) controller.abort()
    controllers.clear()
  })

  const value: BtwContextValue = {
    state: () => state,
    current,
    open,
    close,
    next,
    previous,
    deleteCurrent,
    forkCurrent,
    copyCurrent,
  }

  function copyCurrent() {
    if (current()?.loading) return
    const record = current()
    const text = record?.answer
    if (!text) {
      toast.show({ message: t("btw.copy_empty"), variant: "info" })
      return
    }
    void clipboard.write?.(text).then(
      () => {
        if (!record) return
        if (copyNoticeTimer) clearTimeout(copyNoticeTimer)
        setState("copyNoticeID", record.id)
        copyNoticeTimer = setTimeout(() => {
          setState("copyNoticeID", undefined)
          copyNoticeTimer = undefined
        }, 1200)
      },
      () => toast.show({ message: t("btw.copy_failed"), variant: "error" }),
    )
  }

  useBindings(() => ({
    enabled: () => state.open,
    priority: 2,
    bindings: [
      { key: "escape", cmd: () => close() },
      { key: "left", cmd: () => previous() },
      { key: "right", cmd: () => next() },
      { key: "c", cmd: () => copyCurrent() },
      { key: "x", cmd: () => deleteCurrent() },
      { key: "f", cmd: () => forkCurrent() },
    ],
  }))

  return (
    <BtwContext.Provider value={value}>
      {props.children}
    </BtwContext.Provider>
  )
}
