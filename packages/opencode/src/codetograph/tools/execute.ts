import { CodeToGraphSchemas } from "../schemas"
import { CodeToGraphService } from "../service"

export async function run(service: CodeToGraphService.Service, name: string, input: unknown) {
  await service.reload()
  if (!service.available)
    return {
      error: `CodeToGraph index not found at '${service.path}'. Run /codetograph explicitly, then retry this tool.`,
    }

  switch (name) {
    case "search_nodes": {
      const value = CodeToGraphSchemas.inputs.search_nodes.parse(input)
      const matches = service.search(value.query, value.limit)
      return { query: value.query, count: matches.length, matches }
    }
    case "resolve": {
      const value = CodeToGraphSchemas.inputs.resolve.parse(input)
      if (!value.label) return { error: "label is required" }
      return service.resolve(value.label)
    }
    case "get_node": {
      const value = CodeToGraphSchemas.inputs.get_node.parse(input)
      return service.node(value.node_id)
    }
    case "get_neighbors": {
      const value = CodeToGraphSchemas.inputs.get_neighbors.parse(input)
      return service.neighbors(value.node_id, value.relation, value.confidence)
    }
    case "expand": {
      const value = CodeToGraphSchemas.inputs.expand.parse(input)
      return service.expand(value.node_id, value.hops, value.relation, value.max_nodes)
    }
    case "trace_calls": {
      const value = CodeToGraphSchemas.inputs.trace_calls.parse(input)
      return service.traceCalls(value.node_id, value.max_depth, value.max_steps)
    }
    case "reverse_trace_calls": {
      const value = CodeToGraphSchemas.inputs.reverse_trace_calls.parse(input)
      return service.reverseTraceCalls(value.node_id, value.max_depth, value.max_steps)
    }
    case "find_path": {
      const value = CodeToGraphSchemas.inputs.find_path.parse(input)
      return service.findPath(value.from_id, value.to_id, value.max_hops)
    }
    case "graph_stats":
      CodeToGraphSchemas.inputs.graph_stats.parse(input)
      return service.stats()
    case "god_nodes": {
      const value = CodeToGraphSchemas.inputs.god_nodes.parse(input)
      return service.godNodes(value.top_n, value.exclude_external)
    }
    case "get_diagram_path": {
      const value = CodeToGraphSchemas.inputs.get_diagram_path.parse(input)
      return service.diagramPath(value.entity_id)
    }
    case "export_html": {
      const value = CodeToGraphSchemas.inputs.export_html.parse(input)
      if (!value.output_path) return { error: "output_path is required" }
      return { status: "ok", path: await service.exportHtml(value.output_path, value.node_limit) }
    }
    case "query_graph": {
      const value = CodeToGraphSchemas.inputs.query_graph.parse(input)
      if (!value.question) return { error: "question is required" }
      return service.queryGraph(value.question, value.mode, value.depth, value.max_nodes, value.context_filter)
    }
    default:
      return `Unknown tool: ${name}`
  }
}

export * as CodeToGraphTools from "./execute"
