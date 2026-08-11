import fs from "node:fs/promises"
import path from "node:path"
import { Effect } from "effect"
import type { FSUtil } from "@opencode-ai/core/fs-util"
import { Global } from "@opencode-ai/core/global"

declare const DEVECO_CODETOGRAPH_PYTHON: Record<string, string> | undefined

async function loadFromDisk() {
  const root = path.join(import.meta.dirname, "../../resources/mcp/codetograph")
  const result: Record<string, string> = {}
  const walk = async (directory: string) => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) await walk(full)
      if (entry.isFile()) result[path.relative(root, full).replaceAll("\\", "/")] = await fs.readFile(full, "utf8")
    }
  }
  await walk(root)
  return result
}

export const ensurePython = Effect.fn("CodeToGraph.Defaults.ensurePython")(function* (
  version: string,
  fsys: FSUtil.Interface,
) {
  const directory = path.join(Global.Path.data, "mcp", "codetograph-python")
  const versionFile = path.join(directory, ".version")
  const current = yield* fsys.readFileString(versionFile).pipe(Effect.catch(() => Effect.succeed("")))
  if (current === version && current !== "local") return directory

  yield* Effect.tryPromise(() => fs.rm(directory, { recursive: true, force: true })).pipe(Effect.orDie)
  const files =
    typeof DEVECO_CODETOGRAPH_PYTHON !== "undefined" ? DEVECO_CODETOGRAPH_PYTHON : yield* Effect.promise(loadFromDisk)
  for (const [file, content] of Object.entries(files)) {
    yield* fsys.writeWithDirs(path.join(directory, file), content)
  }
  yield* fsys.writeWithDirs(versionFile, version)
  return directory
})

export * as CodeToGraphDefaults from "./defaults"
