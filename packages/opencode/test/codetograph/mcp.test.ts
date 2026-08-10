import { afterEach, describe, expect, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"

const roots: string[] = []
const runtime = path.resolve(import.meta.dir, "../../resources/mcp/codetograph/src")

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

describe("bundled CodeToGraph MCP", () => {
  test("serves tools over stdio without third-party Python packages", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "deveco-codetograph-"))
    roots.push(root)
    await fs.mkdir(path.join(root, "docs"), { recursive: true })
    await fs.writeFile(
      path.join(root, "docs", "codetograph.json"),
      JSON.stringify({
        graph: { files: 1, entities: 1, links: 0 },
        nodes: [
          {
            id: "src_main",
            label: "main",
            entity_type: "function",
            source_file: "src/main.ts",
            source_location: "L1",
          },
        ],
        links: [],
      }),
    )

    const processHandle = Bun.spawn(["python3", "-m", "codetograph_mcp", "docs/codetograph.json", "docs/diagrams"], {
      cwd: root,
      env: { ...process.env, PYTHONPATH: runtime },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    })
    processHandle.stdin.write(
      [
        { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } },
        { jsonrpc: "2.0", method: "notifications/initialized" },
        { jsonrpc: "2.0", id: 2, method: "tools/list" },
        { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "graph_stats", arguments: {} } },
      ]
        .map((item) => JSON.stringify(item))
        .join("\n") + "\n",
    )
    processHandle.stdin.end()

    const [exitCode, stdout, stderr] = await Promise.all([
      processHandle.exited,
      new Response(processHandle.stdout).text(),
      new Response(processHandle.stderr).text(),
    ])
    expect(stderr).toBe("")
    expect(exitCode).toBe(0)

    const responses = stdout
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    expect(responses[0].result.serverInfo.name).toBe("codetograph")
    expect(responses[1].result.tools.map((tool: { name: string }) => tool.name)).toContain("query_graph")
    expect(JSON.parse(responses[2].result.content[0].text).entities).toBe(1)
  })
})
