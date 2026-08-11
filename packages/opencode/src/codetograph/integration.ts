import path from "node:path"
import { Effect } from "effect"
import type { ConfigMCPV1 } from "@opencode-ai/core/v1/config/mcp"
import type { FSUtil } from "@opencode-ai/core/fs-util"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import { CodeToGraphDefaults } from "./defaults"
import { CodeToGraphRuntime } from "./runtime"

export const builtInCodeToGraphMcps = Effect.fn("CodeToGraph.builtInMcps")(function* (fsys: FSUtil.Interface) {
  const directory = yield* CodeToGraphDefaults.ensurePython(InstallationVersion, fsys).pipe(Effect.orDie)
  return {
    "codetograph-ts": {
      type: "local",
      command: CodeToGraphRuntime.serverCommand("typescript"),
      enabled: true,
      timeout: 300_000,
    },
    "codetograph-python": {
      type: "local",
      command: [...CodeToGraphRuntime.serverCommand("python"), ...CodeToGraphRuntime.pythonCommand()],
      environment: { PYTHONPATH: path.join(directory, "src") },
      enabled: false,
      timeout: 300_000,
    },
  } satisfies Record<string, ConfigMCPV1.Info>
})

export * as CodeToGraphIntegration from "./integration"
