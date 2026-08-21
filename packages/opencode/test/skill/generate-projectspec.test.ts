import { describe, expect, test } from "bun:test"

const skillRoot = new URL("../../resources/skills/generate-projectspec-hierarchy-v6/", import.meta.url)

function read(relative: string) {
  return Bun.file(new URL(relative, skillRoot)).text()
}

describe("generate-projectspec-hierarchy-v6 standalone contract", () => {
  test("remains independently available", async () => {
    const [skill, workflow, homegraph] = await Promise.all([
      read("SKILL.md"),
      read("workflow.md"),
      read("references/homegraph.md"),
    ])

    expect(skill).toContain("high-level-architecture.md")
    expect(skill).toContain("high-level-business.md")
    expect(skill).toContain("significance-based")
    expect(workflow).toContain("Documentation Plan")
    expect(skill).toContain("queryable HomeGraph")
    expect(skill).toContain("homegraph init -i <Project-root>")
    expect(skill).toContain("single command creates `docs/.projectspec/`")
    expect(workflow.indexOf("homegraph_status")).toBeGreaterThan(-1)
    expect(workflow.indexOf("homegraph_files")).toBeGreaterThan(workflow.indexOf("homegraph_status"))
    expect(workflow.indexOf("homegraph_explore")).toBeGreaterThan(workflow.indexOf("homegraph_files"))
    expect(homegraph).toContain("explicit approval")
    expect(homegraph).toContain("homegraph init -i <Project-root>")
    expect(homegraph).toContain("homegraph index --force <Project-root>")
  })

  test("defines evidence-backed Business characterization and module selection", async () => {
    const [skill, business, model, diagrams, moduleTemplate] = await Promise.all([
      read("SKILL.md"),
      read("references/business.md"),
      read("references/document-model.md"),
      read("references/diagrams.md"),
      read("templates/module-business.md"),
    ])

    expect(skill).toContain("behavior-owner")
    expect(skill).toContain("supporting-behavior")
    expect(skill).toContain("architecture-only")
    expect(business).toContain("Given")
    expect(business).toContain("When")
    expect(business).toContain("Then")
    expect(business).toContain("Evidence status")
    expect(business).toContain("system/API/data/operational journey")
    expect(model).toContain("behavior-owner")
    expect(model).toContain("architecture-only")
    expect(diagrams).toContain("not-useful")
    expect(moduleTemplate).toContain("EXAMPLE-")
    expect(moduleTemplate).toContain("Then")
  })

  test("keeps Business templates role-aware and conditional", async () => {
    const [module, capability, project, highLevel, model, validation] = await Promise.all([
      read("templates/module-business.md"),
      read("templates/capability-business.md"),
      read("templates/project-business.md"),
      read("templates/high-level-business.md"),
      read("references/document-model.md"),
      read("references/update-and-validation.md"),
    ])
    const templates = [module, capability, project, highLevel]

    expect(module).toContain("> Module ID: <stable documentation-plan module id>")
    expect(module).toContain("> Business role: behavior-owner | supporting-behavior")
    expect(module).toContain("> Parent behavior: CAP-* or FLOW-* | None — owns <CAP-* or FLOW-*>")
    expect(module).toContain("`architecture-only` never uses it")
    expect(module).not.toContain("```mermaid")
    for (const template of templates) {
      expect(template).toContain("otherwise omit")
      expect(template).toContain("### EXAMPLE-<stable-id> — <RULE-* or FLOW-*>")
      expect(template).toContain(
        "- **Evidence status:** <Observed|Declared|Inferred|Unavailable> — <anchor or boundary>",
      )
      expect(template).toContain("not executable specifications")
      expect(template).toContain("not-useful")
    }
    expect(model).toContain("businessOwnerDocument")
    expect(model).toContain("parentBehavior")
    expect(model).toContain("diagram_decision")
    expect(validation).toContain("implementation keywords")
  })
})
