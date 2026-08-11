import { Effect } from "effect"
import type { ConfigMCPV1 } from "@opencode-ai/core/v1/config/mcp"
import { CodeToGraphRuntime } from "./runtime"

export const builtInCodeToGraphMcps = Effect.fn("CodeToGraph.builtInMcps")(function* () {
  return {
    codetograph: {
      type: "local",
      command: CodeToGraphRuntime.serverCommand(),
      enabled: true,
      timeout: 300_000,
    },
  } satisfies Record<string, ConfigMCPV1.Info>
})

export * as CodeToGraphIntegration from "./integration"
