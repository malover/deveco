import path from "node:path"
import { CodeToGraphServer } from "./server"
import { CodeToGraphRuntime } from "./runtime"

export async function run(args = process.argv.slice(2)) {
  const runtime = args[0] as CodeToGraphRuntime.Runtime | undefined
  if (runtime !== "typescript" && runtime !== "python") throw new Error(`Unknown CodeToGraph runtime: ${runtime}`)

  const graph = path.join("docs", "codetograph.json")
  const diagrams = path.join("docs", "diagrams")
  await initialize(graph)

  if (runtime === "typescript") return CodeToGraphServer.serve(graph, diagrams)

  const python = args.slice(1)
  if (!python.length) throw new Error("Python command is missing")
  const child = Bun.spawn([...python, "-m", "codetograph_mcp", graph, diagrams], {
    cwd: process.cwd(),
    env: process.env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })
  const exitCode = await child.exited
  if (exitCode !== 0) throw new Error(`CodeToGraph Python MCP exited with code ${exitCode}`)
}

async function initialize(graph: string) {
  if (await Bun.file(graph).exists()) return
  const child = Bun.spawn(
    [...CodeToGraphRuntime.generateCommand(), "--project", process.cwd(), "--output", path.dirname(graph)],
    {
      cwd: process.cwd(),
      env: process.env,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "inherit",
    },
  )
  const [exitCode, output] = await Promise.all([child.exited, new Response(child.stdout).text()])
  if (output) process.stderr.write(output)
  if (exitCode !== 0) throw new Error(`CodeToGraph initialization exited with code ${exitCode}`)
  if (!(await Bun.file(graph).exists())) throw new Error(`CodeToGraph initialization did not create ${graph}`)
}

if (import.meta.main) {
  await run()
}

export * as CodeToGraphEntry from "./entry"
