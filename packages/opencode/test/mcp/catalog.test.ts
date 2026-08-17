import { describe, expect, test } from "bun:test"
import { McpCatalog } from "@/mcp/catalog"
import { homeGraphToolAllowed } from "@/homegraph/tool-surface"

describe("MCP tool names", () => {
  test("does not duplicate an MCP server prefix already present on a tool", () => {
    expect(McpCatalog.toolKey("homegraph", "homegraph_search")).toBe("homegraph_search")
    expect(McpCatalog.toolKey("github", "search")).toBe("github_search")
  })

  test("scopes the HomeGraph surface by agent role", () => {
    expect(homeGraphToolAllowed("goal", "homegraph_callers")).toBe(true)
    expect(homeGraphToolAllowed("goal", "homegraph_spec_match")).toBe(true)
    expect(homeGraphToolAllowed("build", "homegraph_callers")).toBe(false)
    expect(homeGraphToolAllowed("build", "homegraph_node")).toBe(true)
    expect(homeGraphToolAllowed("build", "github_search")).toBe(true)
  })
})
