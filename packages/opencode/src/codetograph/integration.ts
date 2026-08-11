import path from "node:path"
import { Effect } from "effect"
import type { ConfigMCPV1 } from "@opencode-ai/core/v1/config/mcp"

export function isCodeToGraphEnabled() {
  return process.env.DEVECO_CODETOGRAPH_ENABLED !== "0"
}

export function command() {
  const development = path.basename(process.execPath).toLowerCase().startsWith("bun")
  return [process.execPath, ...(development && process.argv[1] ? [process.argv[1]] : [])]
}

export function builtInCodeToGraphMcp() {
  if (!isCodeToGraphEnabled()) return Effect.succeed(undefined)
  return Effect.succeed({
    type: "local",
    command: command(),
    environment: {
      DEVECO_CODETOGRAPH_MCP_MODE: "1",
      DEVECO_CODETOGRAPH_GRAPH: process.env.DEVECO_CODETOGRAPH_GRAPH?.trim() || path.join("docs", "codetograph.json"),
      DEVECO_CODETOGRAPH_DIAGRAMS: process.env.DEVECO_CODETOGRAPH_DIAGRAMS?.trim() || path.join("docs", "diagrams"),
    },
    enabled: true,
    timeout: 120_000,
  } satisfies ConfigMCPV1.Info)
}
