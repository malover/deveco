import { CodeToGraphServer } from "../../src/codetograph/server"

await CodeToGraphServer.serve(
  process.env.DEVECO_CODETOGRAPH_GRAPH || "docs/codetograph.json",
  process.env.DEVECO_CODETOGRAPH_DIAGRAMS || "docs/diagrams",
)
