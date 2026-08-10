"""codetograph-mcp: MCP server for codetograph knowledge graphs.

Usage:
    codetograph-mcp <path/to/codetograph.json> [<path/to/diagrams-dir>]
    python -m codetograph_mcp <path/to/codetograph.json> [<path/to/diagrams-dir>]

MCP tools:
    search_nodes      – find entities by name/file pattern
    resolve           – fuzzy-resolve a human-readable label to a node ID
    get_node          – get full details of a single entity
    get_neighbors     – direct incoming/outgoing relationships (with relation + confidence filters)
    expand            – BFS subgraph expansion from a seed node
    trace_calls       – follow the call chain from an entry point (returns Mermaid diagram)
    reverse_trace_calls – trace incoming callers (who calls this function?)
    find_path         – shortest dependency path between two entities (bidirectional)
    graph_stats       – node/link/confidence statistics
    god_nodes         – most-connected architectural hotspots (optional exclude_external)
    get_diagram_path  – resolve entity ID to .mmd diagram file path
    export_html       – generate an interactive vis-network HTML visualization
    query_graph       – NLP query using IDF-weighted seed selection + BFS/DFS traversal
"""

import json
import sys

from codetograph_mcp.server import CodeGraph


def serve(graph_path: str, diagrams_dir: str = ""):
    from mcp.server import Server
    from mcp.server.stdio import stdio_server
    from mcp import types

    graph = CodeGraph(graph_path, diagrams_dir)
    server = Server("codetograph")

    @server.list_tools()
    async def list_tools() -> list[types.Tool]:
        return [
            types.Tool(
                name="search_nodes",
                description="Find entities by label, ID, or source file pattern (case-insensitive substring). Returns matching node IDs with their labels, types, and files.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Search term (label, entity ID, or file path substring)"},
                        "limit": {"type": "integer", "default": 20, "description": "Maximum results to return"},
                    },
                    "required": ["query"],
                },
            ),
            types.Tool(
                name="resolve",
                description="Fuzzy-resolve a human-readable label (e.g., 'Logger.error', 'checkWebLoaded', 'MainPage') to the best matching node ID. Returns the best match with score and all candidates sorted by relevance. Use this before get_node, get_neighbors, trace_calls, etc. when you don't know the exact entity ID.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "label": {"type": "string", "description": "Human-readable label to resolve (e.g., 'Toast.showToast', 'build', 'Logger')"},
                    },
                    "required": ["label"],
                },
            ),
            types.Tool(
                name="get_node",
                description="Get full details for a single entity by its ID. Returns label, type, source file, location, and all attributes.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "node_id": {"type": "string", "description": "Full entity ID from the graph (e.g., 'component_gridbuilder_build')"},
                    },
                    "required": ["node_id"],
                },
            ),
            types.Tool(
                name="get_neighbors",
                description="Get all direct relationships (incoming and outgoing) for an entity. Optionally filter by relation type (calls, contains, inherits, imports, exports, implements) and confidence level (EXTRACTED, INFERRED, AMBIGUOUS, EXTERNAL).",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "node_id": {"type": "string", "description": "Entity ID"},
                        "relation": {"type": "string", "default": "", "description": "Filter by relation type (calls, contains, inherits, imports, exports, implements). Leave empty for all."},
                        "confidence": {"type": "string", "default": "", "description": "Filter by confidence level (EXTRACTED, INFERRED, AMBIGUOUS, EXTERNAL). Leave empty for all."},
                    },
                    "required": ["node_id"],
                },
            ),
            types.Tool(
                name="expand",
                description="BFS subgraph expansion from a seed node. Returns all nodes and edges reachable within N hops in both directions. The most common navigation pattern: 'show me everything around this function/class'. Supports relation filtering and node limit to control output size.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "node_id": {"type": "string", "description": "Seed entity ID to expand from"},
                        "hops": {"type": "integer", "default": 2, "description": "Number of BFS hops to expand"},
                        "relation": {"type": "string", "default": "", "description": "Filter by relation type (e.g., 'calls'). Leave empty for all."},
                        "max_nodes": {"type": "integer", "default": 50, "description": "Maximum nodes to include in the subgraph"},
                    },
                    "required": ["node_id"],
                },
            ),
            types.Tool(
                name="trace_calls",
                description="Trace the call sequence starting from an entry point entity. Returns structured call steps with caller/callee info, context tags (self, if, loop, switch, try, catch), line locations, and a Mermaid sequence diagram string.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "node_id": {"type": "string", "description": "Entry point entity ID"},
                        "max_depth": {"type": "integer", "default": 3, "description": "Maximum call depth to follow"},
                        "max_steps": {"type": "integer", "default": 40, "description": "Maximum steps in the trace"},
                    },
                    "required": ["node_id"],
                },
            ),
            types.Tool(
                name="reverse_trace_calls",
                description="Trace incoming callers: 'who calls this function?'. Follows reverse call edges to discover all upstream callers up to max_depth. Returns structured caller/callee info with context tags and locations.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "node_id": {"type": "string", "description": "Entity ID to find callers for"},
                        "max_depth": {"type": "integer", "default": 3, "description": "Maximum caller depth to follow"},
                        "max_steps": {"type": "integer", "default": 40, "description": "Maximum steps in the trace"},
                    },
                    "required": ["node_id"],
                },
            ),
            types.Tool(
                name="find_path",
                description="Find the shortest dependency path (bidirectional, any relation type) between two entities. Traverses both forward and reverse edges to find paths through shared dependencies. Returns all intermediate hops with relation types, confidence levels, and direction (forward/reverse).",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "from_id": {"type": "string", "description": "Source entity ID"},
                        "to_id": {"type": "string", "description": "Target entity ID"},
                        "max_hops": {"type": "integer", "default": 6, "description": "Maximum path length"},
                    },
                    "required": ["from_id", "to_id"],
                },
            ),
            types.Tool(
                name="graph_stats",
                description="Get overall graph statistics: total entities, total links, confidence breakdown (EXTRACTED/INFERRED/AMBIGUOUS/EXTERNAL), relation type distribution, and file count.",
                inputSchema={
                    "type": "object",
                    "properties": {},
                },
            ),
            types.Tool(
                name="god_nodes",
                description="Get the most-connected entities (architectural hotspots) ranked by total degree. By default excludes @external virtual nodes to show real project code. Set exclude_external=false to include them.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "top_n": {"type": "integer", "default": 10, "description": "Number of top nodes to return"},
                        "exclude_external": {"type": "boolean", "default": True, "description": "Exclude @external and @config virtual nodes"},
                    },
                },
            ),
            types.Tool(
                name="get_diagram_path",
                description="Resolve an entity ID to its Mermaid sequence diagram file path. Requires diagrams to have been generated with mermaid_seq.py first (creates INDEX.json). Returns the absolute path to the .mmd file and whether it exists.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "entity_id": {"type": "string", "description": "Entity ID to look up in the diagrams index"},
                    },
                    "required": ["entity_id"],
                },
            ),
            types.Tool(
                name="export_html",
                description="Generate an interactive vis-network HTML visualization of the entire code graph. Colors nodes by entity type, sizes by degree, includes search sidebar and click-to-inspect panel. Returns the path to the generated HTML file. Use this to produce a shareable visualization.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "output_path": {"type": "string", "description": "Absolute path for the output HTML file (e.g., /tmp/graph.html)"},
                        "node_limit": {"type": "integer", "default": 5000, "description": "Maximum nodes before auto-aggregating to module-level view"},
                    },
                    "required": ["output_path"],
                },
            ),
            types.Tool(
                name="query_graph",
                description="NLP query for exploring the code graph using natural language. Uses IDF-weighted seed selection + BFS/DFS traversal with heuristic context filters. Ask questions like 'how does Logger connect to database?', 'calls from MainPage to network layer', 'imports related to AbilityKit'. Returns matching seeds with scores and the traversed subgraph.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "question": {"type": "string", "description": "Natural language question about the codebase (e.g., 'show me how Logger.error works', 'calls from build to render', 'imports of @ohos.router')"},
                        "mode": {"type": "string", "default": "bfs", "description": "Traversal mode: 'bfs' for broad context, 'dfs' for deep dependency chain tracing"},
                        "depth": {"type": "integer", "default": 3, "description": "Number of hops to traverse from each seed"},
                        "max_nodes": {"type": "integer", "default": 50, "description": "Maximum nodes to include in the result subgraph"},
                        "context_filter": {"type": "string", "default": "", "description": "Explicit edge relation filter (calls, imports, inherits, contains, implements, exports, references). Leave empty for auto-inference."},
                    },
                    "required": ["question"],
                },
            ),
        ]

    @server.call_tool()
    async def call_tool(name: str, arguments: dict) -> list[types.TextContent]:
        graph._maybe_reload()

        if not graph.available:
            return [types.TextContent(type="text", text=json.dumps({
                "error": f"CodeToGraph index not found at '{graph.path}'. Run /codetograph explicitly, then retry this tool."
            }, ensure_ascii=False))]

        try:
            if name == "search_nodes":
                query = arguments.get("query", "")
                limit = arguments.get("limit", 20)
                matches = graph.find_scored(query)[:limit]
                result = []
                for _score, _mid in matches:
                    n = graph.nodes[_mid]
                    result.append({
                        "id": n["id"],
                        "label": n.get("label"),
                        "type": n.get("entity_type"),
                        "file": n.get("source_file"),
                        "location": n.get("source_location"),
                        "score": _score,
                    })
                return [types.TextContent(type="text", text=json.dumps(
                    {"query": query, "count": len(result), "matches": result}, indent=2, ensure_ascii=False
                ))]

            elif name == "resolve":
                label = arguments.get("label", "")
                if not label:
                    return [types.TextContent(type="text", text=json.dumps({"error": "label is required"}))]
                data = graph.resolve(label)
                return [types.TextContent(type="text", text=json.dumps(data, indent=2, ensure_ascii=False))]

            elif name == "get_node":
                nid = arguments.get("node_id", "")
                node = graph.nodes.get(nid)
                if not node:
                    return [types.TextContent(type="text", text=json.dumps({"error": f"Node '{nid}' not found"}))]
                out_count = len(graph._adj.get(nid, []))
                in_count = len(graph._rev_adj.get(nid, []))
                call_count = len(graph._calls_by_source.get(nid, []))
                return [types.TextContent(type="text", text=json.dumps({
                    "id": node["id"],
                    "label": node.get("label"),
                    "type": node.get("entity_type"),
                    "file": node.get("source_file"),
                    "location": node.get("source_location"),
                    "file_type": node.get("file_type"),
                    "outgoing_links": out_count,
                    "incoming_links": in_count,
                    "calls_made": call_count,
                    "details": node.get("details"),
                }, indent=2, ensure_ascii=False))]

            elif name == "get_neighbors":
                nid = arguments.get("node_id", "")
                relation = arguments.get("relation", "")
                confidence = arguments.get("confidence", "")
                data = graph.neighbors(nid, relation, confidence)
                return [types.TextContent(type="text", text=json.dumps(data, indent=2, ensure_ascii=False))]

            elif name == "expand":
                nid = arguments.get("node_id", "")
                hops = arguments.get("hops", 2)
                relation = arguments.get("relation", "")
                max_nodes = arguments.get("max_nodes", 50)
                data = graph.expand(nid, hops, relation, max_nodes)
                return [types.TextContent(type="text", text=json.dumps(data, indent=2, ensure_ascii=False))]

            elif name == "trace_calls":
                nid = arguments.get("node_id", "")
                max_depth = arguments.get("max_depth", 3)
                max_steps = arguments.get("max_steps", 40)
                data = graph.trace_calls(nid, max_depth, max_steps)
                return [types.TextContent(type="text", text=json.dumps(data, indent=2, ensure_ascii=False))]

            elif name == "reverse_trace_calls":
                nid = arguments.get("node_id", "")
                max_depth = arguments.get("max_depth", 3)
                max_steps = arguments.get("max_steps", 40)
                data = graph.reverse_trace_calls(nid, max_depth, max_steps)
                return [types.TextContent(type="text", text=json.dumps(data, indent=2, ensure_ascii=False))]

            elif name == "find_path":
                from_id = arguments.get("from_id", "")
                to_id = arguments.get("to_id", "")
                max_hops = arguments.get("max_hops", 6)
                data = graph.find_path(from_id, to_id, max_hops)
                return [types.TextContent(type="text", text=json.dumps(data, indent=2, ensure_ascii=False))]

            elif name == "graph_stats":
                stats = graph.stats
                confidence = {}
                rel_counts = {}
                for link in graph.data.get("links", []):
                    c = link.get("confidence", "?")
                    confidence[c] = confidence.get(c, 0) + 1
                    r = link.get("relation", "?")
                    rel_counts[r] = rel_counts.get(r, 0) + 1
                return [types.TextContent(type="text", text=json.dumps({
                    **stats,
                    "confidence_breakdown": confidence,
                    "relation_types": rel_counts,
                }, indent=2, ensure_ascii=False))]

            elif name == "god_nodes":
                top_n = arguments.get("top_n", 10)
                exclude_external = arguments.get("exclude_external", True)
                data = graph.god_nodes(top_n, exclude_external)
                return [types.TextContent(type="text", text=json.dumps(data, indent=2, ensure_ascii=False))]

            elif name == "get_diagram_path":
                eid = arguments.get("entity_id", "")
                data = graph.get_diagram_path(eid)
                return [types.TextContent(type="text", text=json.dumps(data, indent=2, ensure_ascii=False))]

            elif name == "export_html":
                output_path = arguments.get("output_path", "")
                if not output_path:
                    return [types.TextContent(type="text", text=json.dumps({"error": "output_path is required"}))]
                node_limit = arguments.get("node_limit", 5000)
                path = graph.to_html(output_path, node_limit)
                return [types.TextContent(type="text", text=json.dumps(
                    {"status": "ok", "path": path}, indent=2, ensure_ascii=False
                ))]

            elif name == "query_graph":
                question = arguments.get("question", "")
                if not question:
                    return [types.TextContent(type="text", text=json.dumps({"error": "question is required"}))]
                mode = arguments.get("mode", "bfs")
                depth = arguments.get("depth", 3)
                max_nodes = arguments.get("max_nodes", 50)
                context_filter = arguments.get("context_filter", "")
                data = graph.query_graph(question, mode, depth, max_nodes, context_filter)
                return [types.TextContent(type="text", text=json.dumps(data, indent=2, ensure_ascii=False))]

            else:
                return [types.TextContent(type="text", text=f"Unknown tool: {name}")]

        except Exception as exc:
            return [types.TextContent(type="text", text=f"Error: {exc}")]

    async def main():
        async with stdio_server() as (read, write):
            await server.run(read, write, server.create_initialization_options())

    import asyncio
    asyncio.run(main())


def main():
    if len(sys.argv) < 2:
        print("Usage: codetograph-mcp <path/to/codetograph.json> [<path/to/diagrams-dir>]", file=sys.stderr)
        print("       python -m codetograph_mcp <path/to/codetograph.json> [<path/to/diagrams-dir>]", file=sys.stderr)
        sys.exit(1)
    graph_path = sys.argv[1]
    diagrams_dir = sys.argv[2] if len(sys.argv) > 2 else ""
    serve(graph_path, diagrams_dir)


if __name__ == "__main__":
    main()
