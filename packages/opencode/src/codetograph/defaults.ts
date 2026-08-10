import fs from "fs/promises"
import path from "path"
import { Effect } from "effect"
import type { FSUtil } from "@opencode-ai/core/fs-util"
import { Global } from "@opencode-ai/core/global"

declare const DEVECO_CODETOGRAPH_MCP: Record<string, string> | undefined

async function loadFromDisk() {
  const root = path.join(import.meta.dirname, "../../resources/mcp/codetograph")
  const result: Record<string, string> = {}

  async function walk(directory: string) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) await walk(full)
      if (entry.isFile()) result[path.relative(root, full).replaceAll("\\", "/")] = await fs.readFile(full, "utf-8")
    }
  }

  await walk(root)
  return result
}

export const ensure = Effect.fn("CodeToGraph.Defaults.ensure")(function* (version: string, fsys: FSUtil.Interface) {
  const directory = path.join(Global.Path.data, "mcp", "codetograph")
  const versionFile = path.join(directory, ".version")
  const current = yield* fsys.readFileString(versionFile).pipe(Effect.catch(() => Effect.succeed("")))

  if (current === version && current !== "local") return directory

  yield* Effect.tryPromise(() => fs.rm(directory, { recursive: true, force: true })).pipe(Effect.orDie)
  const data =
    typeof DEVECO_CODETOGRAPH_MCP !== "undefined" ? DEVECO_CODETOGRAPH_MCP : yield* Effect.promise(loadFromDisk)

  for (const [file, content] of Object.entries(data)) {
    yield* fsys.writeWithDirs(path.join(directory, file), content)
  }
  yield* fsys.writeWithDirs(versionFile, version)
  return directory
})
