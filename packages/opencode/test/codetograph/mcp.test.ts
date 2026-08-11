import { afterEach, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { CodeToGraphRuntime } from "../../src/codetograph/runtime"

const roots: string[] = []
const entrypoint = path.resolve(import.meta.dir, "server.fixture.ts")
const runtimeEntrypoint = path.resolve(import.meta.dir, "../../src/codetograph/entry.ts")
type RpcResponse = {
  id: number
  result: {
    serverInfo: { name: string }
    tools: Array<{ name: string }>
    content: Array<{ text: string }>
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

describe("CodeToGraph TypeScript MCP", () => {
  test("builds the TypeScript MCP and explicit generator commands", () => {
    expect(CodeToGraphRuntime.serverCommand().at(-1)).toEndWith("entry.ts")
    expect(CodeToGraphRuntime.generateCommand().at(-1)).toEndWith("codetograph.ts")
  })

  test("serves the TypeScript tools and payloads", async () => {
    const root = await fixture()
    const calls = [
      ["search_nodes", { query: "main" }],
      ["resolve", { label: "main" }],
      ["get_node", { node_id: "src_main" }],
      ["get_neighbors", { node_id: "src_main" }],
      ["expand", { node_id: "src_main", hops: 2 }],
      ["trace_calls", { node_id: "src_main" }],
      ["reverse_trace_calls", { node_id: "src_helper" }],
      ["find_path", { from_id: "src_main", to_id: "src_store" }],
      ["graph_stats", {}],
      ["god_nodes", { top_n: 3 }],
      ["get_diagram_path", { entity_id: "src_main" }],
      ["query_graph", { question: "calls from main", depth: 2 }],
      ["get_node", { node_id: "missing" }],
      ["resolve", { label: "" }],
    ] as const
    const requests = protocol(calls)
    const typescript = await exchange(
      [process.execPath, entrypoint],
      root,
      {
        DEVECO_CODETOGRAPH_MCP_MODE: "1",
        DEVECO_CODETOGRAPH_GRAPH: "docs/codetograph.json",
        DEVECO_CODETOGRAPH_DIAGRAMS: "docs/diagrams",
      },
      requests,
    )

    const typescriptById = new Map(typescript.map((response) => [response.id, response]))
    expect(typescriptById.get(1)!.result.serverInfo.name).toBe("codetograph")
    expect(typescriptById.get(2)!.result.tools.map((tool: { name: string }) => tool.name)).toEqual(
      expect.arrayContaining(calls.slice(0, -2).map(([name]) => name)),
    )
    calls.forEach((_, index) => {
      expect(() => JSON.parse(typescriptById.get(index + 3)!.result.content[0].text)).not.toThrow()
    })
  })

  test("starts without generating an index and keeps the lazy missing-index error", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "deveco-codetograph-missing-"))
    roots.push(root)
    const responses = await exchange(
      [process.execPath, runtimeEntrypoint],
      root,
      {},
      protocol([["graph_stats", {}]]),
    )
    expect(JSON.parse(responses.find((response) => response.id === 3)!.result.content[0].text).error).toContain(
      "Run /codetograph explicitly",
    )
    expect(await fs.stat(path.join(root, "docs")).catch(() => undefined)).toBeUndefined()
  })

  test("exports HTML without a Python runtime", async () => {
    const root = await fixture()
    const output = path.join(root, "docs", "graph.html")
    const responses = await exchange(
      [process.execPath, entrypoint],
      root,
      {
        DEVECO_CODETOGRAPH_MCP_MODE: "1",
        DEVECO_CODETOGRAPH_GRAPH: "docs/codetograph.json",
        DEVECO_CODETOGRAPH_DIAGRAMS: "docs/diagrams",
      },
      protocol([["export_html", { output_path: output }]]),
    )
    expect(JSON.parse(responses.find((response) => response.id === 3)!.result.content[0].text)).toEqual({
      status: "ok",
      path: output,
    })
    const html = await fs.readFile(output, "utf8")
    expect(html).toContain("vis.Network")
    expect(html).toContain('id="legend"')
    expect(html).toContain("network.on('click'")
  })
})

function protocol(calls: ReadonlyArray<readonly [string, object]>) {
  return [
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } },
    },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
    ...calls.map(([name, args], index) => ({
      jsonrpc: "2.0",
      id: index + 3,
      method: "tools/call",
      params: { name, arguments: args },
    })),
  ]
}

async function exchange(command: string[], cwd: string, environment: Record<string, string>, requests: object[]) {
  const processHandle = Bun.spawn(command, {
    cwd,
    env: { ...process.env, ...environment },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  })
  await processHandle.stdin.write(requests.map((item) => JSON.stringify(item)).join("\n") + "\n")
  const responses: Array<Record<string, unknown>> = []
  const reader = processHandle.stdout.getReader()
  const decoder = new TextDecoder()
  const expected = requests.filter((request) => "id" in request).length
  let pending = ""
  while (responses.length < expected) {
    const chunk = await reader.read()
    if (chunk.done) break
    pending += decoder.decode(chunk.value, { stream: true })
    const lines = pending.split("\n")
    pending = lines.pop() ?? ""
    lines.filter(Boolean).forEach((line) => responses.push(JSON.parse(line)))
  }
  await processHandle.stdin.end()
  const [exitCode, stderr] = await Promise.all([processHandle.exited, new Response(processHandle.stderr).text()])
  expect(stderr).toBe("")
  expect(exitCode).toBe(0)
  return responses as RpcResponse[]
}

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "deveco-codetograph-"))
  roots.push(root)
  await fs.mkdir(path.join(root, "docs", "diagrams"), { recursive: true })
  await fs.writeFile(path.join(root, "docs", "diagrams", "main.mmd"), "sequenceDiagram")
  await fs.writeFile(path.join(root, "docs", "diagrams", "INDEX.json"), JSON.stringify({ src_main: "main.mmd" }))
  await fs.writeFile(
    path.join(root, "docs", "codetograph.json"),
    JSON.stringify({
      graph: { files: 2, entities: 3, links: 2 },
      nodes: [
        {
          id: "src_main",
          label: "main",
          entity_type: "function",
          source_file: "src/main.ts",
          source_location: "L1",
          details: [],
        },
        {
          id: "src_helper",
          label: "helper",
          entity_type: "function",
          source_file: "src/helper.ts",
          source_location: "L2",
          details: [],
        },
        {
          id: "src_store",
          label: "Store",
          entity_type: "class",
          source_file: "src/store.ts",
          source_location: "L3",
          details: [],
        },
      ],
      links: [
        {
          source: "src_main",
          target: "src_helper",
          relation: "calls",
          confidence: "EXTRACTED",
          context: "[if]",
          source_location: "L4",
        },
        {
          source: "src_helper",
          target: "src_store",
          relation: "imports",
          confidence: "INFERRED",
          context: "",
          source_location: "L5",
        },
      ],
    }),
  )
  return root
}
