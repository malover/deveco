import path from "node:path"
import fs from "node:fs"
import type { ConfigMCPV1 } from "@opencode-ai/core/v1/config/mcp"

/**
 * Temporary A/B-test switch.
 *
 * Enabled by default so a normal DevEco start includes CodeGraph.
 *
 * Disable with:
 *   $env:DEVECO_CODEGRAPH_ENABLED = "0"
 */
export function isCodeGraphEnabled(): boolean {
  return process.env.DEVECO_CODEGRAPH_ENABLED !== "0"
}

/**
 * Repository root when running DevEco from source:
 *
 * packages/opencode/src/codegraph
 *   -> src
 *   -> opencode
 *   -> packages
 *   -> repository root
 */
function repositoryRoot(): string {
  return path.resolve(import.meta.dir, "../../../..")
}

/**
 * Resolve the CodeGraph executable installed by Bun.
 *
 * This is intentionally development-oriented. Production packaging will
 * later resolve a vendored CodeGraph runtime instead.
 */
export function resolveCodeGraphExecutable(): string {
  const root = repositoryRoot()

  const candidates =
    process.platform === "win32"
      ? [
          path.join(root, "node_modules", ".bin", "codegraph.exe"),
          path.join(root, "node_modules", ".bin", "codegraph.cmd"),
        ]
      : [path.join(root, "node_modules", ".bin", "codegraph")]

  const executable = candidates.find((candidate) => fs.existsSync(candidate))

  if (!executable) {
    throw new Error(
      `CodeGraph executable not found. Checked:\n${candidates.map((candidate) => `- ${candidate}`).join("\n")}`,
    )
  }

  return executable
}

/**
 * Built-in MCP definition used for every repository opened through DevEco.
 */
export function builtInCodeGraphMcp(): ConfigMCPV1.Info | undefined {
  if (!isCodeGraphEnabled()) return undefined

  const executable = resolveCodeGraphExecutable()

  // Expose the exact executable to DevEco child shells/subagents. Project SPEC
  // generation uses this to bootstrap/sync the opened repository's CodeGraph
  // index without relying on a global `codegraph` installation or bunx.
  process.env.DEVECO_CODEGRAPH_EXECUTABLE = executable

  // A .cmd shim must be launched through cmd.exe on Windows.
  if (process.platform === "win32" && executable.endsWith(".cmd")) {
    return {
      type: "local",
      command: ["cmd.exe", "/d", "/s", "/c", executable, "serve", "--mcp"],
      enabled: true,
      timeout: 120_000,
    }
  }

  return {
    type: "local",
    command: [executable, "serve", "--mcp"],
    enabled: true,
    timeout: 120_000,
  }
}

/**
 * This is the short instruction block shipped by CodeGraph's own installer.
 *
 * It is intentionally not a long custom playbook. CodeGraph's source says
 * the main MCP server provides the detailed instructions, while this small
 * block exists for agent/subagent discoverability.
 */
export const CODEGRAPH_INSTRUCTIONS = `
## CodeGraph

When a repository has a \`.codegraph/\` directory, reach for CodeGraph BEFORE grep/find or broad file reading when you need to understand or locate code:

- **MCP tool** (when available): \`codegraph_explore\` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell**: DevEco exposes the bundled executable through \`DEVECO_CODEGRAPH_EXECUTABLE\`. Project SPEC generation may use it to initialize/index/sync the current workspace before graph exploration.

For ordinary ad-hoc exploration, if there is no \`.codegraph/\` directory, do not create one unless the active workflow explicitly requires graph bootstrap. Project SPEC Step 0 explicitly requires that bootstrap when CodeGraph is available.
`.trim()
