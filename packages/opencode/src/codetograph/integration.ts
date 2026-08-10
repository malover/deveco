import path from "path"
import { Effect } from "effect"
import type { ConfigMCPV1 } from "@opencode-ai/core/v1/config/mcp"
import type { FSUtil } from "@opencode-ai/core/fs-util"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import { ensure } from "./defaults"

export function isCodeToGraphEnabled() {
  return process.env.DEVECO_CODETOGRAPH_ENABLED !== "0"
}

export function findPythonCommand() {
  const configured = process.env.DEVECO_CODETOGRAPH_PYTHON?.trim()
  if (configured) return [configured]

  const python3 = Bun.which("python3")
  if (python3) return [python3]

  const python = Bun.which("python")
  if (python) return [python]

  const launcher = process.platform === "win32" ? Bun.which("py") : undefined
  if (launcher) return [launcher, "-3"]
}

export const builtInCodeToGraphMcp = Effect.fn("CodeToGraph.builtInMcp")(function* (fsys: FSUtil.Interface) {
  if (!isCodeToGraphEnabled()) return undefined

  const python = findPythonCommand()
  if (!python) {
    yield* Effect.logWarning("CodeToGraph MCP disabled: Python 3 was not found")
    return undefined
  }

  const directory = yield* ensure(InstallationVersion, fsys).pipe(Effect.orDie)
  const graph = process.env.DEVECO_CODETOGRAPH_GRAPH?.trim() || path.join("docs", "codetograph.json")
  const diagrams = process.env.DEVECO_CODETOGRAPH_DIAGRAMS?.trim() || path.join("docs", "diagrams")

  return {
    type: "local",
    command: [...python, "-m", "codetograph_mcp", graph, diagrams],
    environment: {
      PYTHONPATH: path.join(directory, "src"),
    },
    enabled: true,
    timeout: 120_000,
  } satisfies ConfigMCPV1.Info
})
