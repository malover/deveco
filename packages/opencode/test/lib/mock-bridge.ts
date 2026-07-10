type BridgeEntry =
  | { type: "result"; value: unknown }
  | { type: "error"; error: Error }

export interface ToolCall {
  worktree: string
  toolName: string
  args: Record<string, unknown>
}

export interface MockBridge {
  /** Queue a successful tool response for the next call. */
  next(result: unknown): void
  /** Queue an error for the next call. */
  nextError(error: Error): void
  /** All calls made to callHarmonyNapiTool/callTool. */
  calls: ToolCall[]
  /** All worktree strings passed to ensureInitialized. */
  initCalls: string[]
  /** Reset all state between tests. */
  reset(): void
  /** Configure ensureInitialized behavior. */
  setInitialized(isReady?: boolean, error?: Error): void
  /** Configure resolveUIVerifyParams return value. */
  setUIVerifyParams(params: { baseURL: string | null; apiKey: string | null; modelName: string | null }): void
  /** Configure listTools return value. */
  setListToolsResult(result: unknown): void
  /** Internal: called by mock.module — do not call directly. */
  ensureInitialized_(worktree: string): Promise<void>
  /** Internal: called by mock.module — do not call directly. */
  callTool_(params: { worktree: string; toolName: string; args: Record<string, unknown> }): Promise<unknown>
  /** Internal: called by mock.module — do not call directly. */
  listTools_(worktree: string): Promise<unknown>
  /** Internal: called by mock.module — do not call directly. */
  resolveUIVerifyParams_(_worktree: string): Promise<{ baseURL: string | null; apiKey: string | null; modelName: string | null }>
  /** Internal: called by mock.module — do not call directly. */
  napiBridgeStop_(): Promise<void>
}

type MockState = {
  queue: BridgeEntry[]
  calls: ToolCall[]
  initCalls: string[]
  initError: Error | undefined
  initReady: boolean
  uiVerifyParams: { baseURL: string | null; apiKey: string | null; modelName: string | null }
  listToolsResult: unknown
}

function freshState(): MockState {
  return {
    queue: [], calls: [], initCalls: [], initError: undefined, initReady: true,
    uiVerifyParams: { baseURL: null, apiKey: null, modelName: null },
    listToolsResult: [],
  }
}

function createMockBridge(): MockBridge {
  let state = freshState()
  const bridge: MockBridge = {
    get calls() { return state.calls },
    get initCalls() { return state.initCalls },
    next(result: unknown) { state.queue.push({ type: "result", value: result }) },
    nextError(error: Error) { state.queue.push({ type: "error", error }) },
    reset() { state = freshState() },
    setInitialized(isReady = true, error?: Error) { state.initReady = isReady; state.initError = error },
    setUIVerifyParams(params: { baseURL: string | null; apiKey: string | null; modelName: string | null }) { state.uiVerifyParams = { ...params } },
    setListToolsResult(result: unknown) { state.listToolsResult = result },
    ensureInitialized_(worktree: string) {
      state.initCalls.push(worktree)
      if (state.initError) return Promise.reject(state.initError)
      if (!state.initReady) return Promise.reject(new Error("DevEco Studio not found. Please set DEVECO_HOME to your DevEco installation directory."))
      return Promise.resolve()
    },
    callTool_(params: { worktree: string; toolName: string; args: Record<string, unknown> }) {
      state.calls.push({ ...params })
      const entry = state.queue.shift()
      if (!entry) return Promise.reject(new Error("No mock response queued for callTool — call bridge.next() or bridge.nextError() before the tool invocation"))
      if (entry.type === "error") return Promise.reject(entry.error)
      return Promise.resolve(entry.value)
    },
    listTools_(worktree: string) { state.initCalls.push(worktree); return Promise.resolve(state.listToolsResult) },
    resolveUIVerifyParams_(_worktree: string) { return Promise.resolve({ ...state.uiVerifyParams }) },
    napiBridgeStop_() { return Promise.resolve() },
  }
  return bridge
}

let instance: MockBridge | undefined

/** Returns the singleton mock bridge instance (shared across mock.module calls). */
export function getMockBridge(): MockBridge {
  if (!instance) instance = createMockBridge()
  return instance
}
