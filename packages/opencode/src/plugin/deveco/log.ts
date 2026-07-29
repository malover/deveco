import { Effect, Layer, Logger, ManagedRuntime, References } from "effect"
import { NodeFileSystem } from "@effect/platform-node"
import { Logging } from "@opencode-ai/core/observability/logging"

let _rt: ManagedRuntime.ManagedRuntime<never, never> | undefined

function getLogRuntime() {
  if (!_rt) {
    const layer = Logger.layer(Logging.loggers(), { mergeWithExisting: false }).pipe(
      Layer.provide(NodeFileSystem.layer),
      Layer.orDie,
      Layer.merge(Layer.succeed(References.MinimumLogLevel, Logging.minimumLogLevel())),
    )
    _rt = ManagedRuntime.make(layer)
  }
  return _rt
}

export function logInfo(msg: string, extra?: Record<string, unknown>) {
  try {
    let eff = Effect.logInfo(msg)
    if (extra) eff = Effect.annotateLogs(eff, extra)
    getLogRuntime().runFork(eff)
  } catch {}
}

export function logWarn(msg: string, extra?: Record<string, unknown>) {
  try {
    let eff = Effect.logWarning(msg)
    if (extra) eff = Effect.annotateLogs(eff, extra)
    getLogRuntime().runFork(eff)
  } catch {}
}

export function logError(msg: string, extra?: Record<string, unknown>) {
  try {
    let eff = Effect.logError(msg)
    if (extra) eff = Effect.annotateLogs(eff, extra)
    getLogRuntime().runFork(eff)
  } catch {}
}
