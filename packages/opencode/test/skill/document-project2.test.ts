import { describe, expect, test } from "bun:test"

const root = new URL("../../resources/skills/document-project2/", import.meta.url)

function read(relative: string) {
  return Bun.file(new URL(relative, root)).text()
}

describe("document-project2 Goal Step 0 policy", () => {
  test("asks one scan-depth question and applies it to both stages", async () => {
    const [workflow, instructions, config] = await Promise.all([
      read("workflows/goal-step0-workflow.md"),
      read("workflows/goal-step0-instructions.md"),
      read("config.toml"),
    ])

    expect(workflow).toContain("Ask exactly one question: scan depth")
    expect(instructions).toContain("Quick")
    expect(instructions).toContain("Deep")
    expect(instructions).toContain("Exhaustive")
    expect(instructions).toContain("use the identical value for Project SPEC and full documentation")
    expect(config).toContain('default_scan_level = "quick"')
    expect(config).not.toContain('scan_level = "deep"')
  })

  test("shares one explore-first HomeGraph policy without fixed ceilings", async () => {
    const [shared, projectSpec, fullScan] = await Promise.all([
      read("homegraph-analysis.md"),
      read("project-spec/instructions.md"),
      read("workflows/full-scan-instructions.md"),
    ])

    expect(projectSpec).toContain("../homegraph-analysis.md")
    expect(fullScan).toContain("../homegraph-analysis.md")
    expect(shared).toContain("Use `homegraph_explore` as the primary investigation mechanism")
    expect(shared).toContain("Prefer it over generic `Read` for indexed source")
    expect(shared).toContain("no fixed call-count, query-count, or elapsed-time ceiling")
    expect(projectSpec).not.toContain("24 HomeGraph calls")
    expect(fullScan).not.toContain("Read all files in subfolder")
    expect(fullScan).not.toContain("max_nodes=")
  })

  test("keeps Goal HomeGraph-only and enforces the stage boundary", async () => {
    const instructions = await read("workflows/goal-step0-instructions.md")

    expect(instructions).toContain("[TOOL_ERROR] repository-documentation: HomeGraph unavailable")
    expect(instructions).toContain("Do not use direct-file or CodeToGraph fallback")
    expect(instructions).toContain("Do not begin full documentation until Project SPEC")
  })
})
