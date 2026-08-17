const GENERAL_TOOLS = new Set(["homegraph_explore", "homegraph_node", "homegraph_impact"])
const GOAL_DOCUMENTATION_TOOLS = new Set([
  "homegraph_status",
  "homegraph_files",
  "homegraph_search",
  "homegraph_node",
  "homegraph_callers",
  "homegraph_callees",
  "homegraph_explore",
  "homegraph_impact",
  "homegraph_spec_find",
  "homegraph_spec_trace",
  "homegraph_spec_match",
])

export function homeGraphToolAllowed(agent: string, tool: string) {
  if (!tool.startsWith("homegraph_")) return true
  if (agent === "goal") return GOAL_DOCUMENTATION_TOOLS.has(tool)
  return GENERAL_TOOLS.has(tool)
}
