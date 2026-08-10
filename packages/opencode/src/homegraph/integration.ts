import path from "node:path"
import fs from "node:fs"
import type { ConfigMCPV1 } from "@opencode-ai/core/v1/config/mcp"

export function isHomeGraphEnabled(): boolean {
  return process.env.DEVECO_HOMEGRAPH_ENABLED !== "0"
}

function repositoryRoot(): string {
  return path.resolve(import.meta.dir, "../../../..")
}

export function resolveHomeGraphExecutable(): string {
  const root = repositoryRoot()
  const candidates = [
    process.env.DEVECO_HOMEGRAPH_EXECUTABLE,
    ...(process.platform === "win32"
      ? [
          path.join(root, "node_modules", ".bin", "homegraph.exe"),
          path.join(root, "node_modules", ".bin", "homegraph.cmd"),
        ]
      : [path.join(root, "node_modules", ".bin", "homegraph")]),
    Bun.which("homegraph"),
  ].filter((candidate): candidate is string => Boolean(candidate))
  const executable = candidates.find((candidate) => fs.existsSync(candidate))

  if (!executable) {
    throw new Error(
      `HomeGraph executable not found. Set DEVECO_HOMEGRAPH_EXECUTABLE or install the homegraph CLI. Checked:\n${candidates.map((candidate) => `- ${candidate}`).join("\n")}`,
    )
  }
  return executable
}

export function builtInHomeGraphMcp(): ConfigMCPV1.Info | undefined {
  if (!isHomeGraphEnabled()) return undefined

  const executable = resolveHomeGraphExecutable()
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

DevEco bootstraps a missing HomeGraph index before starting the built-in MCP server. When HomeGraph is connected, use it before grep/find or broad file reading for code discovery:

- **MCP tool**: \`homegraph_explore\` returns relevant symbols, current source, call paths, and impact evidence. Use \`homegraph_node\` for a named symbol or file and \`homegraph_impact\` before risky changes.
- **Shell**: DevEco exposes the bundled executable through \`DEVECO_HOMEGRAPH_EXECUTABLE\` for explicit status, sync, rebuild, and Project SPEC collection.

HomeGraph stores repository-local data under \`.homegraph/\` and supports ArkTS/HarmonyOS projects.
`.trim()
