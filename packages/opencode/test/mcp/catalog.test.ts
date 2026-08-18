import { describe, expect, test } from "bun:test"
import { McpCatalog } from "@/mcp/catalog"
import { homeGraphToolAllowed } from "@/homegraph/tool-surface"

describe("MCP tool names", () => {
  test("does not duplicate an MCP server prefix already present on a tool", () => {
    expect(McpCatalog.toolKey("homegraph", "homegraph_search")).toBe("homegraph_search")
    expect(McpCatalog.toolKey("github", "search")).toBe("github_search")
  })

  test("exposes the complete HomeGraph surface to every agent", () => {
    for (const agent of ["goal", "build", "plan"]) {
      expect(homeGraphToolAllowed(agent, "homegraph_status")).toBe(true)
      expect(homeGraphToolAllowed(agent, "homegraph_files")).toBe(true)
      expect(homeGraphToolAllowed(agent, "homegraph_search")).toBe(true)
      expect(homeGraphToolAllowed(agent, "homegraph_callers")).toBe(true)
      expect(homeGraphToolAllowed(agent, "homegraph_callees")).toBe(true)
      expect(homeGraphToolAllowed(agent, "homegraph_spec_match")).toBe(true)
      expect(homeGraphToolAllowed(agent, "homegraph_impact")).toBe(true)
    }
    expect(homeGraphToolAllowed("build", "homegraph_unknown")).toBe(false)
    expect(homeGraphToolAllowed("build", "github_search")).toBe(true)
  })
})
