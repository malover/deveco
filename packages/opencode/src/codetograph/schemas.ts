import { z } from "zod"

export const inputs = {
  search_nodes: z.object({
    query: z.string().describe("Search term (label, entity ID, or file path substring)"),
    limit: z.number().int().default(20).describe("Maximum results to return"),
  }),
  resolve: z.object({
    label: z.string().describe("Human-readable label to resolve (e.g., 'Toast.showToast', 'build', 'Logger')"),
  }),
  get_node: z.object({
    node_id: z.string().describe("Full entity ID from the graph (e.g., 'component_gridbuilder_build')"),
  }),
  get_neighbors: z.object({
    node_id: z.string().describe("Entity ID"),
    relation: z
      .string()
      .default("")
      .describe(
        "Filter by relation type (calls, contains, inherits, imports, exports, implements). Leave empty for all.",
      ),
    confidence: z
      .string()
      .default("")
      .describe("Filter by confidence level (EXTRACTED, INFERRED, AMBIGUOUS, EXTERNAL). Leave empty for all."),
  }),
  expand: z.object({
    node_id: z.string().describe("Seed entity ID to expand from"),
    hops: z.number().int().default(2).describe("Number of BFS hops to expand"),
    relation: z.string().default("").describe("Filter by relation type (e.g., 'calls'). Leave empty for all."),
    max_nodes: z.number().int().default(50).describe("Maximum nodes to include in the subgraph"),
  }),
  trace_calls: z.object({
    node_id: z.string().describe("Entry point entity ID"),
    max_depth: z.number().int().default(3).describe("Maximum call depth to follow"),
    max_steps: z.number().int().default(40).describe("Maximum steps in the trace"),
  }),
  reverse_trace_calls: z.object({
    node_id: z.string().describe("Entity ID to find callers for"),
    max_depth: z.number().int().default(3).describe("Maximum caller depth to follow"),
    max_steps: z.number().int().default(40).describe("Maximum steps in the trace"),
  }),
  find_path: z.object({
    from_id: z.string().describe("Source entity ID"),
    to_id: z.string().describe("Target entity ID"),
    max_hops: z.number().int().default(6).describe("Maximum path length"),
  }),
  graph_stats: z.object({}),
  god_nodes: z.object({
    top_n: z.number().int().default(10).describe("Number of top nodes to return"),
    exclude_external: z.boolean().default(true).describe("Exclude @external and @config virtual nodes"),
  }),
  get_diagram_path: z.object({ entity_id: z.string().describe("Entity ID to look up in the diagrams index") }),
  export_html: z.object({
    output_path: z.string().describe("Absolute path for the output HTML file (e.g., /tmp/graph.html)"),
    node_limit: z.number().int().default(5000).describe("Maximum nodes before auto-aggregating to module-level view"),
  }),
  query_graph: z.object({
    question: z
      .string()
      .describe(
        "Natural language question about the codebase (e.g., 'show me how Logger.error works', 'calls from build to render', 'imports of @ohos.router')",
      ),
    mode: z
      .string()
      .default("bfs")
      .describe("Traversal mode: 'bfs' for broad context, 'dfs' for deep dependency chain tracing"),
    depth: z.number().int().default(3).describe("Number of hops to traverse from each seed"),
    max_nodes: z.number().int().default(50).describe("Maximum nodes to include in the result subgraph"),
    context_filter: z
      .string()
      .default("")
      .describe(
        "Explicit edge relation filter (calls, imports, inherits, contains, implements, exports, references). Leave empty for auto-inference.",
      ),
  }),
}

export type ToolName = keyof typeof inputs

export * as CodeToGraphSchemas from "./schemas"
