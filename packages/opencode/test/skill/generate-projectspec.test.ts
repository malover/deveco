import { describe, expect, test } from "bun:test"

const skillRoot = new URL("../../resources/skills/generate-projectspec-hierarchy-v6/", import.meta.url)
const goal = Bun.file(new URL("../../src/agent/prompt/goal.txt", import.meta.url)).text()

function read(relative: string) {
  return Bun.file(new URL(relative, skillRoot)).text()
}

describe("generate-projectspec-hierarchy-v6 Goal integration", () => {
  test("keeps documentation generation owned by the skill", async () => {
    const [skill, workflow, homegraph, prompt] = await Promise.all([read("SKILL.md"), read("workflow.md"), read("references/homegraph.md"), goal])

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
    expect(prompt).toContain('call the `skill` tool with `name: "generate-projectspec-hierarchy-v6"`')
    expect(prompt).toContain("If both high-level documents already exist and are readable and non-empty, reuse them")
  })

  test("loads high-level knowledge before linked detail owners without legacy artifacts", async () => {
    const prompt = await goal
    const architecture = prompt.indexOf("Read `docs/high-level-architecture.md` first")
    const business = prompt.indexOf("then `docs/high-level-business.md`")
    const index = prompt.indexOf("then `docs/index.md`")
    const details = prompt.indexOf("Read each linked relevant document")

    expect(architecture).toBeGreaterThan(-1)
    expect(business).toBeGreaterThan(architecture)
    expect(index).toBeGreaterThan(business)
    expect(details).toBeGreaterThan(index)
    expect(prompt).toContain("Ignore `docs/project-spec.md` when deciding whether the new documentation exists")
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
      expect(template).toContain("- **Evidence status:** <Observed|Declared|Inferred|Unavailable> — <anchor or boundary>")
      expect(template).toContain("not executable specifications")
      expect(template).toContain("not-useful")
    }
    expect(model).toContain("businessOwnerDocument")
    expect(model).toContain("parentBehavior")
    expect(model).toContain("diagram_decision")
    expect(validation).toContain("implementation keywords")
  })
})
