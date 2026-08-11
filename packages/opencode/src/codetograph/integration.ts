import path from "node:path"
import { Effect } from "effect"
import type { ConfigMCPV1 } from "@opencode-ai/core/v1/config/mcp"
import type { FSUtil } from "@opencode-ai/core/fs-util"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import { CodeToGraphDefaults } from "./defaults"
import { CodeToGraphRuntime } from "./runtime"

export const builtInCodeToGraphMcp = Effect.fn("CodeToGraph.builtInMcp")(function* (fsys: FSUtil.Interface) {
  if (!CodeToGraphRuntime.enabled()) return undefined
  const graph = process.env.DEVECO_CODETOGRAPH_GRAPH?.trim() || path.join("docs", "codetograph.json")
  const diagrams = process.env.DEVECO_CODETOGRAPH_DIAGRAMS?.trim() || path.join("docs", "diagrams")

  if (CodeToGraphRuntime.selected() === "typescript") {
    return {
      type: "local",
      command: CodeToGraphRuntime.selfCommand("mcp"),
      environment: {
        DEVECO_CODETOGRAPH_GRAPH: graph,
        DEVECO_CODETOGRAPH_DIAGRAMS: diagrams,
      },
      enabled: true,
      timeout: 120_000,
    } satisfies ConfigMCPV1.Info
  }

  const python = CodeToGraphRuntime.pythonCommand()
  if (!python) {
    yield* Effect.logWarning("CodeToGraph Python MCP disabled: Python 3 was not found")
    return undefined
  }
  const directory = yield* CodeToGraphDefaults.ensurePython(InstallationVersion, fsys).pipe(Effect.orDie)
  return {
    type: "local",
    command: [...python, "-m", "codetograph_mcp", graph, diagrams],
    environment: { PYTHONPATH: path.join(directory, "src") },
    enabled: true,
    timeout: 120_000,
  } satisfies ConfigMCPV1.Info
})

export * as CodeToGraphIntegration from "./integration"
