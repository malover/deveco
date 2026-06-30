import {
  batch,
  createContext,
  createSignal,
  onCleanup,
  Show,
  useContext,
  type Accessor,
  type JSX,
  type ParentComponent,
} from "solid-js"
import { createStore } from "solid-js/store"
import { BtwOverlay } from "../component/btw-overlay"
import { useEvent } from "./event"
import { useSDK } from "./sdk"

export type BtwState = {
  open: boolean
  loading: boolean
  question: string
  answer: string
  error: string | undefined
}

const initial: BtwState = {
  open: false,
  loading: false,
  question: "",
  answer: "",
  error: undefined,
}

export type BtwOpenInput = {
  sessionID: string
  question: string
  model?: string
}

export interface BtwContextValue {
  state: Accessor<BtwState>
  open: (input: BtwOpenInput) => void
  close: () => void
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

  const [state, setState] = createStore<BtwState>({ ...initial })

  // Per-open lifecycle handles (re-set on each open, cleared on close).
  let ctrl: AbortController | undefined
  let stopEvent: (() => void) | undefined
  let activeAsideID: string | undefined
  let openCloseLock = false

  function close() {
    if (openCloseLock) return
    openCloseLock = true
    try {
      ctrl?.abort()
      ctrl = undefined
      stopEvent?.()
      stopEvent = undefined
      activeAsideID = undefined
      setState({ ...initial })
    } finally {
      openCloseLock = false
    }
  }

  function open(input: BtwOpenInput) {
    // Single-instance: if a previous aside is open, replace it.
    if (state.open) close()

    const asideID = `btw_${crypto.randomUUID().replaceAll("-", "")}`
    activeAsideID = asideID

    batch(() => {
      setState({
        open: true,
        loading: true,
        question: input.question,
        answer: "",
        error: undefined,
      })
    })

    // Subscribe to events filtered by asideID; the SDK already routes
    // session-related events through useEvent().subscribe.
    stopEvent = event.subscribe((evt) => {
      if (!activeAsideID || evt.type !== "btw.start" && evt.type !== "btw.delta"
        && evt.type !== "btw.complete" && evt.type !== "btw.error") {
        return
      }
      if (evt.properties.asideID !== activeAsideID) return

      switch (evt.type) {
        case "btw.start":
          // No-op; presence confirms the server started streaming.
          break
        case "btw.delta":
          setState("answer", (prev) => prev + evt.properties.text)
          break
        case "btw.complete":
          setState("loading", false)
          break
        case "btw.error":
          setState({ loading: false, error: evt.properties.message })
          break
      }
    })

    const controller = new AbortController()
    ctrl = controller

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
        // Server already published an error event for streaming failures; the
        // initial POST error path is the only thing left to surface here.
        if (result.error && state.open) {
          setState({
            loading: false,
            error: typeof result.error === "string" ? result.error : "request failed",
          })
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        if (!state.open) return
        setState({
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        })
      })
  }

  onCleanup(close)

  const value: BtwContextValue = {
    state: () => state,
    open,
    close,
  }

  return (
    <BtwContext.Provider value={value}>
      {props.children}
      <Show when={state.open}>
        <BtwOverlay />
      </Show>
    </BtwContext.Provider>
  )
}

// Marker re-export so App layout can read the provider's child overlay slot
// without pulling in the overlay directly. Kept for tree-shaking.
export type _BTWOverlaySlot = () => JSX.Element
