/// <reference path="./audio.d.ts" />
import type {
  TuiAttention,
  TuiAttentionNotifyInput,
  TuiAttentionNotifyResult,
  TuiAttentionNotifySkipReason,
  TuiAttentionWhen,
  TuiKV,
  TuiAttentionSoundName,
} from "@opencode-ai/plugin/tui"
import { AttentionSoundName, type TuiConfig } from "./config"
import { Schema } from "effect"
import stripAnsi from "strip-ansi"
import * as TuiAudio from "./audio"
import { SOUND_CATALOG, DEFAULT_SOUND_IDS, findCatalogEntry } from "./sound-registry"

type FocusState = "unknown" | "focused" | "blurred"

type AttentionRenderer = {
  readonly isDestroyed: boolean
  on(event: "focus" | "blur", listener: () => void): unknown
  off(event: "focus" | "blur", listener: () => void): unknown
}

type TuiAttentionHost = TuiAttention & {
  dispose(): void
}

const KV_SOUND_CUSTOM_PREFIX = "attention_sound_custom_"
const MESSAGE_LIMIT = 240

function defaultSoundPath(name: TuiAttentionSoundName) {
  const id = DEFAULT_SOUND_IDS[name]
  return id ? findCatalogEntry(id)?.path : undefined
}

function skipped(reason: TuiAttentionNotifySkipReason): TuiAttentionNotifyResult {
  return {
    ok: false,
    sound: false,
    skipped: reason,
  }
}

function normalizeText(input: string | undefined, fallback: string, limit: number) {
  const text = stripAnsi(input ?? "")
    .replace(/[ \t]*[\r\n]+[ \t]*/g, " ")
    .replace(/[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
    .trim()
  const normalized = text.length ? text : fallback
  return Array.from(normalized).slice(0, limit).join("")
}

function clampVolume(volume: number) {
  if (!Number.isFinite(volume)) return 0
  return Math.min(1, Math.max(0, volume))
}

function soundVolume(
  input: TuiAttentionNotifyInput,
  config: Pick<TuiConfig.Resolved, "attention">,
  kv?: TuiKV,
) {
  const soundEnabled = kv?.get<boolean>("attention_sound_enabled", config.attention.sound) ?? config.attention.sound
  if (!soundEnabled) return
  if (input.sound === false) return
  const volume = kv?.get<number>("attention_volume", config.attention.volume) ?? config.attention.volume
  if (input.sound === undefined) return clampVolume(volume)
  if (input.sound === true) return clampVolume(volume)
  return clampVolume(input.sound.volume ?? volume)
}

function focusSkip(when: TuiAttentionWhen, focus: FocusState) {
  if (when === "always") return
  if (focus === "unknown") return "focus_unknown"
  if (when === "blurred" && focus === "focused") return "focused"
  if (when === "focused" && focus === "blurred") return "blurred"
}

export function createTuiAttention(input: {
  renderer: AttentionRenderer
  config: Pick<TuiConfig.Resolved, "attention">
  kv?: TuiKV
  audio?: Pick<typeof TuiAudio, "loadSoundFile" | "play">
}): TuiAttentionHost {
  let focus: FocusState = "unknown"
  let disposed = false
  const audio = input.audio ?? TuiAudio

  const onFocus = () => {
    focus = "focused"
  }
  const onBlur = () => {
    focus = "blurred"
  }

  input.renderer.on("focus", onFocus)
  input.renderer.on("blur", onBlur)

  function customSoundPath(name: TuiAttentionSoundName) {
    const customId = input.kv?.get<string | undefined>(`${KV_SOUND_CUSTOM_PREFIX}${name}`, undefined)
    if (!customId) return
    return findCatalogEntry(customId)?.path
  }

  function soundCandidates(name: TuiAttentionSoundName) {
    return [customSoundPath(name), input.config.attention.sounds[name], defaultSoundPath(name)].filter(
      (item, index, list): item is string => typeof item === "string" && list.indexOf(item) === index,
    )
  }

  async function playSound(name: TuiAttentionSoundName, volume: number) {
    try {
      for (const file of soundCandidates(name)) {
        const current = await audio.loadSoundFile(file).catch((error) => {
          console.debug("failed to load attention sound", { file, error })
          return null
        })
        if (disposed) return false
        if (current == null) continue
        if (audio.play(current, { volume }) != null) return true
      }
      return false
    } catch (error) {
      console.debug("failed to play attention sound", { error })
      return false
    }
  }

  function resolvedVolume() {
    return clampVolume(input.kv?.get<number>("attention_volume", input.config.attention.volume) ?? input.config.attention.volume)
  }

  return {
    async notify(request) {
      try {
        const attentionEnabled = input.kv?.get<boolean>("attention_enabled", input.config.attention.enabled) ?? input.config.attention.enabled
        if (!attentionEnabled) return skipped("attention_disabled")
        if (disposed || input.renderer.isDestroyed) return skipped("renderer_destroyed")

        const message = normalizeText(request.message, "", MESSAGE_LIMIT)
        if (!message) return skipped("empty_message")

        const volume = soundVolume(request, input.config, input.kv)
        const requestedSound = typeof request.sound === "object" ? request.sound : undefined
        const soundSkip = volume === undefined ? undefined : focusSkip(requestedSound?.when ?? "always", focus)
        const soundName =
          requestedSound?.name && Schema.is(AttentionSoundName)(requestedSound.name) ? requestedSound.name : "default"
        const sound = volume === undefined || soundSkip ? false : await playSound(soundName, volume)

        if (!sound) {
          if (soundSkip) return skipped(soundSkip)
        }

        return {
          ok: sound,
          sound,
        }
      } catch (error) {
        console.debug("failed to handle attention notification", { error })
        return {
          ok: false,
          sound: false,
        }
      }
    },
    soundboard: {
      available() {
        return SOUND_CATALOG
      },
      async preview(soundId: string) {
        const entry = findCatalogEntry(soundId)
        if (!entry) return false
        const volume = resolvedVolume()
        try {
          const loaded = await audio.loadSoundFile(entry.path).catch(() => null)
          if (loaded == null) return false
          return audio.play(loaded, { volume }) != null
        } catch {
          return false
        }
      },
      getCustomSound(event: TuiAttentionSoundName) {
        return input.kv?.get<string | undefined>(`${KV_SOUND_CUSTOM_PREFIX}${event}`, undefined)
      },
      setCustomSound(event: TuiAttentionSoundName, soundId: string | undefined) {
        if (soundId === undefined) {
          input.kv?.set(`${KV_SOUND_CUSTOM_PREFIX}${event}`, "")
        } else {
          input.kv?.set(`${KV_SOUND_CUSTOM_PREFIX}${event}`, soundId)
        }
      },
    },
    dispose() {
      if (disposed) return
      disposed = true
      input.renderer.off("focus", onFocus)
      input.renderer.off("blur", onBlur)
    },
  }
}
