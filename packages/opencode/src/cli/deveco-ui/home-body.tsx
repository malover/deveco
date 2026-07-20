/**
 * DevEco Home body — owns the entire center slot of the TUI Home page.
 *
 * Encapsulates:
 *  1. Login check (auth.json + OAuth entry)
 *  2. Agreement check (TMS API + KV cache)
 *  3. Onboarding UI (privacy / entry / auth / provider / key)
 *  4. Prompt UI (banner + prompt) once authed + compliant
 *
 * The generic TUI Home route renders this component through
 * `getDevEcoExtensions().homeBody` — when absent, it falls back to the
 * upstream (generic) Home layout.
 */
import {
  createEffect,
  createMemo,
  createSignal,
  Match,
  on,
  onMount,
  Show,
  Switch,
} from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "@opencode-ai/tui/context/theme"
import {
  Banner,
  BANNER_HOME_CONTENT_INSET,
  HOME_BODY_GAP_ROWS,
  HOME_BODY_MAX_ROWS,
  HOME_CONTENT_MAX_WIDTH,
  homeBodySlotRows,
} from "@opencode-ai/tui/component/banner"
import { useKV } from "@opencode-ai/tui/context/kv"
import { useArgs } from "@opencode-ai/tui/context/args"
import { useRouteData } from "@opencode-ai/tui/context/route"
import { usePromptRef } from "@opencode-ai/tui/context/prompt"
import { useLocal } from "@opencode-ai/tui/context/local"
import { Prompt, type PromptRef } from "@opencode-ai/tui/component/prompt"
import { usePluginRuntime } from "@opencode-ai/tui/plugin/runtime"
import { HomeSessionDestinationProvider } from "@opencode-ai/tui/routes/home/session-destination"
import { Toast, useToast } from "@opencode-ai/tui/ui/toast"
import type { SyncObject } from "@opencode-ai/tui/deveco-extensions"
import { agreementService, AgreementStatus } from "@/cli/deveco-agreement"
import { devecoAuth, hasDevecoOAuthEntry, ensureValidToken, loadIsRealNameFromDisk } from "@/plugin/deveco"
import { hasConfiguredDevEcoHome } from "@/tool/lib/env"
import type { AgreementConfig } from "@/cli/deveco-legal"
import { DevEcoOnboarding } from "./onboarding"

declare const DEVECO_SKIP_AGREEMENT: boolean | undefined

// TODO: what is the best way to do this?
let once = false

// Cache the auth check result so /new (or /clear) doesn't re-run it.
// Only populated when the check succeeds (user is authed + compliant).
let authCheckCached = false
let cachedAuthCanEnter = false
let cachedDevecoReady = false
// Cache DEVECO_HOME check — only check on initial startup, skip on /new
let devecoHomeChecked = false

const placeholder = {
  normal: ["Fix a TODO in the codebase", "What is the tech stack of this project?", "Fix broken tests"],
  shell: ["ls -la", "git status", "pwd"],
}

export function DevEcoHomeBody(props: { sync: SyncObject; bodySlotHeight: number }) {
  const sync = props.sync
  const kv = useKV()
  const { theme } = useTheme()
  const dimensions = useTerminalDimensions()
  const toast = useToast()

  const [devecoReady, setDevecoReady] = createSignal<boolean | null>(null)
  const [devecoInitialStep, setDevecoInitialStep] = createSignal<"entry" | "privacy" | "deveco-home">("entry")
  const [devecoSessionExpired, setDevecoSessionExpired] = createSignal(false)
  const [authCanEnter, setAuthCanEnter] = createSignal(false)
  const [authCheckDone, setAuthCheckDone] = createSignal(false)
  let devecoChecked = false
  const [devecoRealName, setDevecoRealName] = createSignal(false)

  const bodySlotHeight = createMemo(() => homeBodySlotRows(dimensions().height))

  /**
   * Finish the auth check: show entry screen (with optional session-expired flag)
   * or the privacy agreement screen.
   */
  const finishCheck = (sessionExpired: boolean, step: "entry" | "privacy" = "entry") => {
    // Don't cache failure states — clear any previous cache
    authCheckCached = false
    if (sessionExpired) setDevecoSessionExpired(true)
    setDevecoInitialStep(step)
    setDevecoReady(false)
    setAuthCheckDone(true)
  }

  const runDevecoCheck = async () => {
    if (devecoChecked) return
    devecoChecked = true

    try {

    if (!hasDevecoOAuthEntry()) {
      return finishCheck(false)
    }

    const session = await devecoAuth.getSession()

    if (!session) {
      return finishCheck(false)
    }

    let accessToken = session.accessToken

    // Ensure token is valid — use cached token if not expired, refresh if needed.
    const validToken = await ensureValidToken()
    if (validToken) {
      accessToken = validToken
    } else if (!accessToken) {
      return finishCheck(await devecoAuth.isJwtExpired() === true)
    } else if (await devecoAuth.isJwtExpired() === true) {
      return finishCheck(true)
    }

    // Check real-name status from disk cache first; only call API if uncertain.
    let isRealName = loadIsRealNameFromDisk()
    if (isRealName !== true) {
      isRealName = await devecoAuth.checkRealName() ?? false
    }
    if (!isRealName) {
      setDevecoRealName(true)
      setDevecoReady(false)
      setAuthCheckDone(true)
      return
    }

    const userId = session.userId || (await devecoAuth.getUserId()) || ""

    // Check if DEVECO_HOME is configured — only on initial startup, skip on /new
    if (!devecoHomeChecked) {
      devecoHomeChecked = true
      if (!(await hasConfiguredDevEcoHome())) {
        setDevecoInitialStep("deveco-home")
        setDevecoReady(false)
        setAuthCheckDone(true)
        return
      }
    }

    if (
      (typeof DEVECO_SKIP_AGREEMENT !== "undefined" && DEVECO_SKIP_AGREEMENT) ||
      process.env.DEVECO_SKIP_AGREEMENT === "1"
    ) {
      authCheckCached = true
      cachedAuthCanEnter = true
      cachedDevecoReady = sync.status === "complete"
      setAuthCanEnter(true)
      setAuthCheckDone(true)
      if (sync.status === "complete") {
        setDevecoReady(true)
      }
      return
    }

    if (!kv.ready) {
      await new Promise<void>((resolve) => {
        const check = () => {
          if (kv.ready) {
            resolve()
            return
          }
          setTimeout(check, 50)
        }
        check()
        setTimeout(() => resolve(), 5000)
      })
    }

    agreementService.configure((sync.data.config as unknown as { agreement?: AgreementConfig }).agreement)
    const checkResult = await agreementService.checkAllAgreements(accessToken, userId, kv)

    if (checkResult.canEnter) {
      authCheckCached = true
      cachedAuthCanEnter = true
      cachedDevecoReady = sync.status === "complete"
      setAuthCanEnter(true)
      setAuthCheckDone(true)
      void agreementService.retryPendingSign(accessToken, userId, kv)
      if (sync.status === "complete") {
        setDevecoReady(true)
      }
    } else if (checkResult.overallStatus === AgreementStatus.SESSION_EXPIRED) {
      finishCheck(true)
    } else {
      if (checkResult.overallStatus === AgreementStatus.NEED_RE_SIGN) {
        toast.show({
          variant: "warning",
          message: "Agreements updated — please review.",
          duration: 6000,
        })
      }
      finishCheck(false, "privacy")
    }

    } catch (err) {
      // Any unhandled error (e.g. logging failure, AppRuntime not ready) must not
      // leave the UI stuck on "Checking login status…".  Fall back to the entry
      // screen so the user can at least re-login or exit.
      console.error("runDevecoCheck failed:", err)
      // Even if an error occurred, check if JWT is expired so we can show the
      // appropriate "session expired" message instead of the generic login prompt.
      finishCheck(await devecoAuth.isJwtExpired() === true)
    }
  }

  onMount(() => {
    if (authCheckCached) {
      setAuthCheckDone(true)
      setAuthCanEnter(cachedAuthCanEnter)
      if (cachedDevecoReady || sync.status === "complete") {
        setDevecoReady(true)
      }
      return
    }
    void runDevecoCheck()
  })

  createEffect(() => {
    if (sync.status === "complete" && authCanEnter()) {
      setDevecoReady(true)
    }
  })

  const mcpError = createMemo(() => {
    return Object.values(sync.data.mcp).some((x) => x.status === "failed")
  })

  const connectedMcpCount = createMemo(() => {
    return Object.values(sync.data.mcp).filter((x) => x.status === "connected").length
  })

  const Hint = (
    <Show when={connectedMcpCount() > 0}>
      <box flexShrink={0} flexDirection="row" gap={1}>
        <text fg={theme.text}>
          <Switch>
            <Match when={mcpError()}>
              <span style={{ fg: theme.error }}>•</span> mcp errors{" "}
              <span style={{ fg: theme.textMuted }}>ctrl+x s</span>
            </Match>
            <Match when={true}>
              <span style={{ fg: theme.success }}>•</span>{" "}
              {connectedMcpCount() === 1 ? "1 mcp server" : `${connectedMcpCount()} mcp servers`}
            </Match>
          </Switch>
        </text>
      </box>
    </Show>
  )

  let prompt: PromptRef | undefined
  const args = useArgs()
  const local = useLocal()
  const route = useRouteData("home")
  const promptRef = usePromptRef()
  const pluginRuntime = usePluginRuntime()

  onMount(() => {
    if (once) return
    if (!prompt) return
    if (route.prompt) {
      prompt.set(route.prompt)
      once = true
    } else if (args.prompt) {
      prompt.set({ input: args.prompt, parts: [] })
      once = true
    }
  })

  createEffect(
    on(
      () => sync.ready && local.model.ready && prompt,
      (ready) => {
        if (!ready) return
        if (!args.prompt) return
        if (!prompt) return
        if (prompt.current?.input !== args.prompt) return
        prompt.submit()
      },
    ),
  )

  return (
    <HomeSessionDestinationProvider>
      <box flexGrow={1} flexDirection="column" minHeight={0}>
        <box
          flexGrow={1}
          minHeight={0}
          flexDirection="column"
          justifyContent="center"
          alignItems="center"
        >
          <box
            flexDirection="column"
            alignItems="center"
            width="100%"
            maxWidth={HOME_CONTENT_MAX_WIDTH}
            flexShrink={0}
            position="relative"
          >
            <box zIndex={0} flexShrink={0} width="100%" alignItems="center">
              <pluginRuntime.Slot name="home_logo" mode="replace">
                <Banner contentInset={BANNER_HOME_CONTENT_INSET} />
              </pluginRuntime.Slot>
            </box>
            <box
              zIndex={1}
              position="relative"
              width="100%"
              height={bodySlotHeight()}
              maxHeight={HOME_BODY_MAX_ROWS}
              flexDirection="column"
              justifyContent={devecoReady() === true ? "center" : "flex-start"}
              alignItems="center"
              paddingTop={HOME_BODY_GAP_ROWS}
              flexShrink={0}
            >
              <Show when={!authCheckDone()}>
                <text fg={theme.textMuted} selectable={false}>
                  Checking login status...
                </text>
              </Show>
              <Show when={authCheckDone() && authCanEnter() && devecoReady() !== true}>
                <box flexDirection="column" alignItems="center">
                  <text fg={theme.textMuted} selectable={false}>
                    Loading project data...
                  </text>
                  <text fg={theme.textMuted} selectable={false}>
                    providers, MCP servers, LSP, sessions...
                  </text>
                </box>
              </Show>
              <Show when={devecoReady()}>
                <box width="100%" flexDirection="column" alignItems="center" flexShrink={0}>
                  <box width="100%" flexShrink={0}>
                    <pluginRuntime.Slot name="home_prompt" mode="replace">
                      <Prompt
                        ref={(r) => {
                          if (r) {
                            prompt = r
                            promptRef.set(r)
                          }
                        }}
                        hint={Hint}
                        placeholders={placeholder}
                        homeBodySlotHeight={bodySlotHeight()}
                      />
                    </pluginRuntime.Slot>
                  </box>
                  <pluginRuntime.Slot name="home_bottom" />
                </box>
              </Show>
              <Show when={devecoReady() === false}>
                <DevEcoOnboarding
                  onComplete={() => setDevecoReady(true)}
                  bodySlotHeight={bodySlotHeight()}
                  initialStep={devecoInitialStep()}
                  sessionExpired={devecoSessionExpired()}
                  initialRealName={devecoRealName()}
                />
              </Show>
            </box>
          </box>
        </box>
        <Toast />
      </box>
      <box width="100%" flexShrink={0}>
        <pluginRuntime.Slot name="home_footer" mode="single_winner" />
      </box>
    </HomeSessionDestinationProvider>
  )
}
