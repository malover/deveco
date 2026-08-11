import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import { CodeToGraphService } from "./service"
import { CodeToGraphToolDefinitions } from "./tools/definitions"
import { CodeToGraphTools } from "./tools/execute"

export async function serve(graphPath: string, diagramsDir = "") {
  const service = new CodeToGraphService.Service(graphPath, diagramsDir)
  const server = new Server({ name: "codetograph", version: "1.0.0" }, { capabilities: { tools: {} } })
  const ended = new Promise<void>((resolve) => {
    process.stdin.once("end", resolve)
  })
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: CodeToGraphToolDefinitions.all }))
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const value = await CodeToGraphTools.run(service, request.params.name, request.params.arguments ?? {})
      return { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] }
    } catch (error) {
      return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }] }
    }
  })
  await server.connect(new StdioServerTransport())
  await ended
  await server.close()
}

export * as CodeToGraphServer from "./server"
