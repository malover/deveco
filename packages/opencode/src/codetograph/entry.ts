import path from "node:path"
import { CodeToGraphServer } from "./server"

export async function run() {
  const graph = path.join("docs", "codetograph.json")
  const diagrams = path.join("docs", "diagrams")
  return CodeToGraphServer.serve(graph, diagrams)
}

if (import.meta.main) {
  await run()
}

export * as CodeToGraphEntry from "./entry"
