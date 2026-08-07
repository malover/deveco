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
 *
 * The MCP transport starts in the opened project directory. We route startup
 * through serve.ts so a missing .codegraph index is initialized before the
 * MCP server accepts graph queries. This makes CodeGraph zero-setup for the
 * Project SPEC workflow instead of relying on an LLM shell instruction.
 */
export function builtInCodeGraphMcp(): ConfigMCPV1.Info | undefined {
  if (!isCodeGraphEnabled()) return undefined

  const executable = resolveCodeGraphExecutable()
  const wrapper = path.join(import.meta.dir, "serve.ts")

  // Expose the exact executable to child processes/subagents for diagnostics
  // and explicit sync/rebuild operations in Project SPEC generation.
  process.env.DEVECO_CODEGRAPH_EXECUTABLE = executable

  return {
    type: "local",
    command: [process.execPath, wrapper],
    enabled: true,
    timeout: 300_000,
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

DevEco bootstraps a missing CodeGraph index before starting the built-in MCP server. When CodeGraph is connected, reach for it BEFORE grep/find or broad file reading when you need to understand or locate code:

- **MCP tool** (when available): \`codegraph_explore\` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell**: DevEco exposes the bundled executable through \`DEVECO_CODEGRAPH_EXECUTABLE\`. Project SPEC generation may use it for explicit status/sync/rebuild operations.

A missing \`.codegraph/\` directory should normally be temporary: the built-in MCP bootstrap creates and indexes it before the server connects. If CodeGraph is shown as connected but the directory is still absent, treat that as a bootstrap failure rather than silently falling back.
`.trim()
