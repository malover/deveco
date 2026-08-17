import path from "node:path"
import fs from "node:fs"
import type { ConfigMCPV1 } from "@opencode-ai/core/v1/config/mcp"

export function isHomeGraphEnabled(): boolean {
  return findHomeGraphExecutable() !== undefined
}

function repositoryRoot(): string {
  return path.resolve(import.meta.dir, "../../../..")
}

export function selectHomeGraphExecutable(candidates: readonly (string | undefined | null)[]) {
  return candidates
    .filter((candidate): candidate is string => Boolean(candidate))
    .find((candidate) => fs.existsSync(candidate))
}

export function findHomeGraphExecutable(): string | undefined {
  const root = repositoryRoot()
  return selectHomeGraphExecutable([
    process.env.DEVECO_HOMEGRAPH_EXECUTABLE,
    ...(process.platform === "win32"
      ? [
          path.join(root, "node_modules", ".bin", "homegraph.exe"),
          path.join(root, "node_modules", ".bin", "homegraph.cmd"),
        ]
      : [path.join(root, "node_modules", ".bin", "homegraph")]),
    Bun.which("homegraph"),
  ])
}

export function resolveHomeGraphExecutable(): string {
  const executable = findHomeGraphExecutable()

  if (!executable) {
    throw new Error(
      "HomeGraph executable not found. Run bun install or set DEVECO_HOMEGRAPH_EXECUTABLE to the HomeGraph CLI.",
    )
  }
  return executable
}

export function builtInHomeGraphMcp(): ConfigMCPV1.Info | undefined {
  if (!isHomeGraphEnabled()) return undefined

  const executable = findHomeGraphExecutable()
  if (!executable) return undefined
  process.env.DEVECO_HOMEGRAPH_EXECUTABLE = executable

  return {
    type: "local",
    command: [process.execPath, path.join(import.meta.dir, "serve.ts")],
    enabled: true,
    timeout: 300_000,
  }
}

export const HOMEGRAPH_INSTRUCTIONS = `
## HomeGraph

DevEco starts the built-in persistent MCP server without creating or refreshing an index. Repository indexing is explicit: \`/init\` owns manual initialization, while the documentation skill invoked by Goal Step 0 owns any indexing required to generate project knowledge. When HomeGraph is connected and indexed, use it before grep/find or broad file reading for code discovery:

- **General coding**: use \`homegraph_explore\` for a targeted path, \`homegraph_node\` for one known symbol/file, and \`homegraph_impact\` before changing shared symbols.
- **Goal documentation**: the Goal agent additionally receives status, files, search, callers, callees, and Commit4Spec tools for project-knowledge generation and targeted follow-up.
- **History**: Commit4Spec provides supporting history only; current graph/source evidence always wins.

HomeGraph stores repository-local data under \`.homegraph/\` and supports ArkTS/HarmonyOS projects.
`.trim()
