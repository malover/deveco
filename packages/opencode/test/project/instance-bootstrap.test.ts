import { afterEach, expect } from "bun:test"
import { existsSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Global } from "@opencode-ai/core/global"
import { Effect, Layer } from "effect"
import { InstanceLayer } from "../../src/project/instance-layer"
import { InstanceStore } from "../../src/project/instance-store"
import { disposeAllInstances, tmpdirScoped } from "../fixture/fixture"
import { markPluginDependenciesReady } from "../fixture/plugin"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.mergeAll(InstanceLayer.layer, CrossSpawnSpawner.defaultLayer))
const cliIt = testEffect(CrossSpawnSpawner.defaultLayer)

// InstanceBootstrap must run before any code touches the instance —
// originally tracked by PRs #25389 and #25449, now a permanent
// invariant. The plugin config hook writes a marker file; the test
// bodies deliberately avoid Plugin/config directly. The marker only
// appears if InstanceBootstrap ran at the instance boundary.
//
// The boundaries below are transport-agnostic and stay.

afterEach(async () => {
  await disposeAllInstances()
})

const bootstrapFixture = Effect.gen(function* () {
  const dir = yield* tmpdirScoped({ git: true })
  yield* Effect.promise(() => markPluginDependenciesReady(Global.Path.config))
  const marker = path.join(dir, "config-hook-fired")
  const pluginFile = path.join(dir, "plugin.ts")
  yield* Effect.promise(() =>
    Bun.write(
      pluginFile,
      [
        `const MARKER = ${JSON.stringify(marker)}`,
        "export default async () => ({",
        "  config: async () => {",
        '    await Bun.write(MARKER, "ran")',
        "  },",
        "})",
        "",
      ].join("\n"),
    ),
  )
  yield* Effect.promise(() =>
    Bun.write(
      path.join(dir, "deveco.json"),
      JSON.stringify({
        $schema: "https://opencode.ai/config.json",
        plugin: [pathToFileURL(pluginFile).href],
      }),
    ),
  )
  return { directory: dir, marker }
})

function runCliBootstrap(directory: string, marker: string, mode: "success" | "reject") {
  return Effect.promise(async () => {
    const worker = Bun.spawn(
      [
        process.execPath,
        "run",
        "--conditions=browser",
        path.join(import.meta.dir, "../fixture/instance-bootstrap-worker.ts"),
        directory,
        marker,
        mode,
      ],
      {
        env: process.env,
        stdout: "pipe",
        stderr: "pipe",
      },
    )
    const killTimer = setTimeout(() => worker.kill(), 15_000)
    try {
      const [exitCode, stdout, stderr] = await Promise.all([
        worker.exited,
        new Response(worker.stdout).text(),
        new Response(worker.stderr).text(),
      ])
      if (exitCode !== 0) throw new Error(`CLI bootstrap worker failed: ${stderr || stdout}`)
    } finally {
      clearTimeout(killTimer)
      worker.kill()
    }
  })
}

it.live("InstanceStore.provide runs InstanceBootstrap before effect", () =>
  Effect.gen(function* () {
    const tmp = yield* bootstrapFixture
    const store = yield* InstanceStore.Service

    yield* store.provide({ directory: tmp.directory }, Effect.succeed("ok"))

    expect(existsSync(tmp.marker)).toBe(true)
  }),
)

cliIt.live("CLI bootstrap runs InstanceBootstrap before callback", () =>
  Effect.gen(function* () {
    const tmp = yield* bootstrapFixture

    yield* runCliBootstrap(tmp.directory, tmp.marker, "success")

    expect(existsSync(tmp.marker)).toBe(true)
  }),
)

cliIt.live("CLI bootstrap disposes the instance when the callback rejects", () =>
  Effect.gen(function* () {
    const tmp = yield* bootstrapFixture

    yield* runCliBootstrap(tmp.directory, tmp.marker, "reject")
  }),
)

it.live("InstanceStore.reload runs InstanceBootstrap", () =>
  Effect.gen(function* () {
    const tmp = yield* bootstrapFixture
    const store = yield* InstanceStore.Service

    yield* store.reload({ directory: tmp.directory })

    expect(existsSync(tmp.marker)).toBe(true)
  }),
)
