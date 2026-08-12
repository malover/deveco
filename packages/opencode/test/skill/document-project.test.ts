import { describe, expect, test } from "bun:test"

const root = new URL("../../resources/skills/document-project/", import.meta.url)

function read(relative: string) {
  return Bun.file(new URL(relative, root)).text()
}

describe("document-project Goal Step 0 policy", () => {
  test("runs Project SPEC before the original document-project skill", async () => {
    const goal = await Bun.file(new URL("../../src/agent/prompt/goal.txt", import.meta.url)).text()

    const projectSpec = goal.indexOf("Step 0a — Project SPEC")
    const fullDocumentation = goal.indexOf("Step 0b — Full documentation")

    expect(projectSpec).toBeGreaterThan(-1)
    expect(fullDocumentation).toBeGreaterThan(projectSpec)
    expect(goal).toContain("skill `document-project`")
    expect(goal).not.toContain("skill `document-project2`")
  })

  test("reuses one HomeGraph index and does not regenerate Project SPEC", async () => {
    const [skill, workflow] = await Promise.all([read("SKILL.md"), read("workflows/goal-step0-workflow.md")])

    expect(skill).toContain("use the HomeGraph MCP only")
    expect(workflow).toContain("Do not initialize, sync, recover, or query HomeGraph status again")
    expect(workflow).toContain("Do not generate Project SPEC in this skill")
  })

  test("OR-merges baseline flags before building the output manifest", async () => {
    const fullScan = await read("workflows/full-scan-instructions.md")

    expect(fullScan).toContain("LLM value OR matching CSV baseline value")
    expect(fullScan).toContain("A baseline `true` can never be turned back to `false`")
    expect(fullScan).toContain("require the `harmony` baseline")
    expect(fullScan).toContain("REQUIRED OUTPUT MANIFEST")
    expect(fullScan).toContain("generate all of them, not a model-selected subset")
  })

  test("keeps the original supporting-document artifact set", async () => {
    const fullScan = await read("workflows/full-scan-instructions.md")

    for (const output of [
      "api-contracts.md",
      "data-models.md",
      "deployment-guide.md",
      "localization.md",
      "test-strategy.md",
      "ux-flows.md",
      "ux-screen-trees.md",
      "ux-screen-wireframes.html",
      "ux-interactive-mockup.html",
      "integration-architecture.md",
      "project-parts.json",
    ]) {
      expect(fullScan).toContain(output)
    }
  })
})
