import { describe, expect, test } from "bun:test"

const skillRoot = new URL("../../resources/skills/generate-projectspec-hierarchy-balanced/", import.meta.url)

function read(relative: string) {
  return Bun.file(new URL(relative, skillRoot)).text()
}

describe("generate-projectspec-hierarchy-balanced skill contract", () => {
  test("is independently discoverable and preserves the balanced output boundary", async () => {
    const [skill, workflow, model, architecture, governance] = await Promise.all([
      read("SKILL.md"),
      read("workflow.md"),
      read("references/document-model.md"),
      read("references/architecture.md"),
      read("references/constraints-and-limitations.md"),
    ])

    expect(skill).toContain("name: generate-projectspec-hierarchy-balanced")
    expect(skill).toContain("deep` is the default")
    expect(skill).toContain("Every physical module/build unit receives Architecture")
    expect(skill).toContain("old `document-project` Deep Scan")
    expect(skill).toContain("no `CHK-*` namespace")
    expect(skill).toContain("preserve developer content outside")
    expect(workflow.indexOf("bootstrap_projectspec.mjs")).toBeGreaterThan(-1)
    expect(workflow.indexOf("homegraph_status")).toBeGreaterThan(workflow.indexOf("bootstrap_projectspec.mjs"))
    expect(workflow.indexOf("homegraph_files")).toBeGreaterThan(workflow.indexOf("homegraph_status"))
    expect(workflow.indexOf("anchored `homegraph_explore`")).toBeGreaterThan(workflow.indexOf("homegraph_files"))
    const modules = workflow.indexOf("## 3. Module-first")
    const projects = workflow.indexOf("## 4. Synthesize Projects")
    const index = workflow.indexOf("## 5. Index and validate last")
    expect(modules).toBeGreaterThan(workflow.indexOf("HomeGraph"))
    expect(projects).toBeGreaterThan(modules)
    expect(index).toBeGreaterThan(projects)
    expect(model).toContain("behavior-owner")
    expect(model).toContain("architecture-only")
    expect(architecture).toContain("Scope matrix")
    expect(architecture).toContain("classDiagram")
    expect(governance).toContain("How to work with it")
    expect(governance).toContain("What to check")
    expect(governance).toContain("Do not use `CHK-*`")
    expect(governance).not.toContain("## Change Checks")
  })

  test("retains the old scan as metadata and keeps all planned resources present", async () => {
    const [planScript, csv, indexTemplate, constraintsTemplate, moduleTemplate] = await Promise.all([
      read("scripts/bootstrap_projectspec.mjs"),
      read("documentation-requirements.csv"),
      read("templates/index.md"),
      read("templates/constraints-and-limitations.md"),
      read("templates/module-architecture.md"),
    ])

    expect(planScript).toContain("oldDeepScan")
    expect(planScript).toContain("llm-primary")
    expect(planScript).toContain("csv-baseline-only")
    expect(planScript).toContain("repository-wide HomeGraph")
    expect(planScript).toContain("explicit fallback approval")
    expect(planScript).toContain("moduleArchitecture")
    expect(csv).toContain("web,true,true,true,true")
    expect(csv).toContain("harmony,true,true,true,true")
    expect(indexTemplate).toContain("Repository Overview")
    expect(indexTemplate).toContain("Start here / how to use this documentation for feature work")
    expect(constraintsTemplate).toContain("ARC-")
    expect(constraintsTemplate).toContain("LIM-")
    expect(constraintsTemplate).not.toContain("CHK-<")
    expect(moduleTemplate).toContain("Scope Matrix")
  })

  test("does not reference or mutate the three protected skill identities", async () => {
    const skill = await read("SKILL.md")
    expect(skill).toContain("does not modify or replace")
    expect(skill).toContain("generate-projectspec-hierarchy-v7")
    expect(skill).toContain("combined-doc-generation")
    expect(skill).toContain("document-project")
  })
})
