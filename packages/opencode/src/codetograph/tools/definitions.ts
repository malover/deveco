import { z } from "zod"
import { CodeToGraphSchemas } from "../schemas"

const descriptions: Record<CodeToGraphSchemas.ToolName, string> = {
  search_nodes:
    "Find entities by label, ID, or source file pattern (case-insensitive substring). Returns matching node IDs with their labels, types, and files.",
  resolve:
    "Fuzzy-resolve a human-readable label (e.g., 'Logger.error', 'checkWebLoaded', 'MainPage') to the best matching node ID. Returns the best match with score and all candidates sorted by relevance. Use this before get_node, get_neighbors, trace_calls, etc. when you don't know the exact entity ID.",
  get_node:
    "Get full details for a single entity by its ID. Returns label, type, source file, location, and all attributes.",
  get_neighbors:
    "Get all direct relationships (incoming and outgoing) for an entity. Optionally filter by relation type (calls, contains, inherits, imports, exports, implements) and confidence level (EXTRACTED, INFERRED, AMBIGUOUS, EXTERNAL).",
  expand:
    "BFS subgraph expansion from a seed node. Returns all nodes and edges reachable within N hops in both directions. The most common navigation pattern: 'show me everything around this function/class'. Supports relation filtering and node limit to control output size.",
  trace_calls:
    "Trace the call sequence starting from an entry point entity. Returns structured call steps with caller/callee info, context tags (self, if, loop, switch, try, catch), line locations, and a Mermaid sequence diagram string.",
  reverse_trace_calls:
    "Trace incoming callers: 'who calls this function?'. Follows reverse call edges to discover all upstream callers up to max_depth. Returns structured caller/callee info with context tags and locations.",
  find_path:
    "Find the shortest dependency path (bidirectional, any relation type) between two entities. Traverses both forward and reverse edges to find paths through shared dependencies. Returns all intermediate hops with relation types, confidence levels, and direction (forward/reverse).",
  graph_stats:
    "Get overall graph statistics: total entities, total links, confidence breakdown (EXTRACTED/INFERRED/AMBIGUOUS/EXTERNAL), relation type distribution, and file count.",
  god_nodes:
    "Get the most-connected entities (architectural hotspots) ranked by total degree. By default excludes @external virtual nodes to show real project code. Set exclude_external=false to include them.",
  get_diagram_path:
    "Resolve an entity ID to its Mermaid sequence diagram file path. Requires diagrams to have been generated with mermaid_seq.py first (creates INDEX.json). Returns the absolute path to the .mmd file and whether it exists.",
  export_html:
    "Generate an interactive vis-network HTML visualization of the entire code graph. Colors nodes by entity type, sizes by degree, includes search sidebar and click-to-inspect panel. Returns the path to the generated HTML file. Use this to produce a shareable visualization.",
  query_graph:
    "NLP query for exploring the code graph using natural language. Uses IDF-weighted seed selection + BFS/DFS traversal with heuristic context filters. Ask questions like 'how does Logger connect to database?', 'calls from MainPage to network layer', 'imports related to AbilityKit'. Returns matching seeds with scores and the traversed subgraph.",
}

export const all = Object.entries(CodeToGraphSchemas.inputs).map(([name, schema]) => ({
  name: name as CodeToGraphSchemas.ToolName,
  description: descriptions[name as CodeToGraphSchemas.ToolName],
  inputSchema: inputSchema(schema),
}))

function inputSchema(schema: z.ZodType) {
  const result = z.toJSONSchema(schema)
  delete result.$schema
  delete result.additionalProperties
  const properties = result.properties ?? {}
  Object.values(properties).forEach((property) => {
    if (!property || typeof property !== "object") return
    delete property.minimum
    delete property.maximum
  })
  result.required = result.required?.filter((name) => {
    const property = properties[name]
    return !property || typeof property !== "object" || !("default" in property)
  })
  if (!result.required?.length) delete result.required
  return result as { type: "object"; properties?: Record<string, unknown>; required?: string[] }
}

export * as CodeToGraphToolDefinitions from "./definitions"
