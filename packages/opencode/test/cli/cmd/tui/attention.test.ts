import { describe, expect, test } from "bun:test"
import type { AudioPlayOptions, AudioSound } from "@opentui/core"
import { createTuiAttention } from "@opencode-ai/tui/attention"
import type { TuiConfig } from "@opencode-ai/tui/config"

type FocusEvent = "focus" | "blur"

type AttentionConfig = Pick<TuiConfig.Resolved, "attention">

class FakeRenderer {
  isDestroyed = false
  listeners: Record<FocusEvent, Set<() => void>> = {
    focus: new Set(),
    blur: new Set(),
  }

  on(event: FocusEvent, listener: () => void) {
    this.listeners[event].add(listener)
    return this
  }

  off(event: FocusEvent, listener: () => void) {
    this.listeners[event].delete(listener)
    return this
  }

  emit(event: FocusEvent) {
    for (const listener of this.listeners[event]) listener()
  }

  listenerCount(event: FocusEvent) {
    return this.listeners[event].size
  }
}

class FakeAudioEngine {
  loadResult: AudioSound | null = 1
  playResult: number | null = 1
  loadCalls = 0
  playCalls = 0
  volumes: (number | undefined)[] = []
  loadPaths: string[] = []
  rejectLoad = false
  rejectPaths = new Set<string>()

  async loadSoundFile(path: string) {
    this.loadCalls += 1
    this.loadPaths.push(path)
    if (this.rejectLoad || this.rejectPaths.has(path)) throw new Error("decode failed")
    return this.loadResult
  }

  play(_sound: AudioSound, options?: AudioPlayOptions) {
    this.playCalls += 1
    this.volumes.push(options?.volume)
    return this.playResult
  }
}

function config(attention: Partial<AttentionConfig["attention"]> = {}): AttentionConfig {
  return {
    attention: {
      enabled: true,
      sound: true,
      volume: 0.4,
      sounds: {},
      ...attention,
    },
  }
}

describe("createTuiAttention", () => {
  test("defaults to sound always", async () => {
    const renderer = new FakeRenderer()
    const audio = new FakeAudioEngine()
    const attention = createTuiAttention({ renderer, config: config(), audio })

    expect(await attention.notify({ message: "hello" })).toEqual({
      ok: true,
      sound: true,
    })
    expect(audio.playCalls).toBe(1)
  })

  test("supports blurred-only sound requests", async () => {
    const renderer = new FakeRenderer()
    const audio = new FakeAudioEngine()
    const attention = createTuiAttention({ renderer, config: config(), audio })

    expect(await attention.notify({ message: "unknown", sound: { when: "blurred" } })).toEqual({
      ok: false,
      sound: false,
      skipped: "focus_unknown",
    })
    renderer.emit("focus")
    expect(await attention.notify({ message: "focused", sound: { when: "blurred" } })).toEqual({
      ok: false,
      sound: false,
      skipped: "focused",
    })
    renderer.emit("blur")
    expect(await attention.notify({ message: "blurred", sound: { when: "blurred" } })).toEqual({
      ok: true,
      sound: true,
    })
    expect(audio.playCalls).toBe(1)
  })

  test("skips empty messages and disabled attention", async () => {
    const empty = new FakeRenderer()
    empty.emit("blur")
    const disabled = new FakeRenderer()
    disabled.emit("blur")

    expect(await createTuiAttention({ renderer: empty, config: config() }).notify({ message: " \n " })).toEqual({
      ok: false,
      sound: false,
      skipped: "empty_message",
    })
    expect(
      await createTuiAttention({ renderer: disabled, config: config({ enabled: false }) }).notify({ message: "hello" }),
    ).toEqual({
      ok: false,
      sound: false,
      skipped: "attention_disabled",
    })
  })

  test("respects sound config", async () => {
    const renderer = new FakeRenderer()
    const audio = new FakeAudioEngine()
    const soundDisabled = createTuiAttention({
      renderer,
      config: config({ sound: false }),
      audio,
    })
    renderer.emit("blur")

    expect(await soundDisabled.notify({ message: "hello", sound: true })).toEqual({
      ok: false,
      sound: false,
    })
    expect(audio.loadCalls).toBe(0)
  })

  test("loads audio lazily only for eligible sound requests", async () => {
    const renderer = new FakeRenderer()
    const audio = new FakeAudioEngine()
    const attention = createTuiAttention({ renderer, config: config(), audio })

    await attention.notify({ message: "unknown", sound: { when: "blurred" } })
    expect(audio.loadCalls).toBe(0)

    renderer.emit("blur")
    expect(await attention.notify({ message: "blurred", sound: { volume: 2 } })).toEqual({
      ok: true,
      sound: true,
    })
    expect(audio.loadCalls).toBe(1)
    expect(audio.volumes).toEqual([1])
  })

  test("handles unavailable playback", async () => {
    const renderer = new FakeRenderer()
    const audio = new FakeAudioEngine()
    audio.playResult = null
    const attention = createTuiAttention({ renderer, config: config(), audio })
    renderer.emit("blur")

    expect(await attention.notify({ message: "hello", sound: true })).toEqual({
      ok: false,
      sound: false,
    })
    expect(audio.loadCalls).toBe(1)
    expect(audio.playCalls).toBe(1)
  })

  test("uses config sound overrides and falls back on load failure", async () => {
    const renderer = new FakeRenderer()
    const audio = new FakeAudioEngine()
    audio.rejectLoad = true
    const attention = createTuiAttention({
      renderer,
      config: config({ sounds: { question: "/tmp/bad-question.mp3" } }),
      audio,
    })
    renderer.emit("blur")

    expect(await attention.notify({ message: "question", sound: { name: "question" } })).toEqual({
      ok: false,
      sound: false,
    })
    expect(audio.loadPaths).toContain("/tmp/bad-question.mp3")
  })

  test("does not throw for sound failures", async () => {
    const renderer = new FakeRenderer()
    const audio = new FakeAudioEngine()
    audio.rejectLoad = true
    const attention = createTuiAttention({ renderer, config: config(), audio })
    renderer.emit("blur")

    expect(await attention.notify({ message: "hello", sound: true })).toEqual({
      ok: false,
      sound: false,
    })
  })

  test("disposes renderer listeners", async () => {
    const renderer = new FakeRenderer()
    const audio = new FakeAudioEngine()
    const attention = createTuiAttention({ renderer, config: config(), audio })
    renderer.emit("blur")
    await attention.notify({ message: "hello", sound: true })

    expect(renderer.listenerCount("focus")).toBe(1)
    expect(renderer.listenerCount("blur")).toBe(1)

    attention.dispose()
    renderer.isDestroyed = true

    expect(renderer.listenerCount("focus")).toBe(0)
    expect(renderer.listenerCount("blur")).toBe(0)
    expect(audio.loadCalls).toBe(1)
    expect(await attention.notify({ message: "hello" })).toEqual({
      ok: false,
      sound: false,
      skipped: "renderer_destroyed",
    })
  })
})
