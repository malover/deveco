import { describe, expect, test } from "bun:test"

const skillRoot = new URL("../../resources/skills/generate-projectspec-hierarchy-balanced/", import.meta.url)
const goal = Bun.file(new URL("../../src/agent/prompt/goal.txt", import.meta.url)).text()

function read(relative: string) {
  return Bun.file(new URL(relative, skillRoot)).text()
}

describe("generate-projectspec-hierarchy-balanced v2 contract", () => {
  test("uses one canonical inventory and bounded HomeGraph orchestration", async () => {
    const [skill, workflow, coordinator] = await Promise.all([
      read("SKILL.md"),
      read("workflow.md"),
      read("scripts/projectspec.py"),
    ])
    expect(skill).toContain("project_spec_analyze")
    expect(skill).toContain('`root: "."`')
    expect(skill).toContain("never search the machine for missing executables")
    expect(skill).toContain("do not run `homegraph_files`")
    expect(skill).toContain("behavior-owner")
    expect(workflow).toContain("project_spec_analyze")
    expect(workflow).toContain("directory in which DevEco Code was invoked")
    expect(workflow).toContain("Do not look for `rg`")
    expect(workflow).toContain("question")
    expect(workflow).toContain("one bounded anchored `homegraph_explore`")
    expect(coordinator).toContain('"contractVersion": CONTRACT_VERSION')
    expect(coordinator).toContain("derive_plan")
    expect(coordinator).not.toContain("bootstrap_projectspec")
  })

  test("requires diagrams and keeps structural validation shared", async () => {
    const [contract, validator, project, module] = await Promise.all([
      read("scripts/document_contract.py"),
      read("scripts/validate_docs.py"),
      read("templates/project-architecture.md"),
      read("templates/module-architecture.md"),
    ])
    expect(contract).toContain("mermaid_blocks")
    expect(validator).toContain("behavior-owner")
    expect(project).toContain("flowchart")
    expect(project).toContain("sequenceDiagram")
    expect(module).toContain("sequenceDiagram")
    expect(validator).not.toContain("validate_packet")
  })

  test("retires v1 resources and publishes v2", async () => {
    const version = await read(".version")
    expect(version.trim()).toBe("2.0.0")
    for (const resource of [
      "scripts/bootstrap_projectspec.mjs",
      "scripts/render_documents.py",
      "scripts/validate_packet.py",
      "documentation-requirements.csv",
      "templates/capability-business.md",
    ]) {
      expect(await Bun.file(new URL(resource, skillRoot)).exists()).toBe(false)
    }
  })

  test("is the always-run Goal documentation bootstrap", async () => {
    const [prompt, index, governance] = await Promise.all([
      goal,
      read("templates/index.md"),
      read("templates/constraints-and-limitations.md"),
    ])
    expect(prompt).toContain("`generate-projectspec-hierarchy-balanced` exactly once")
    expect(prompt).toContain("even when `docs/index.md` already exists")
    expect(prompt).not.toContain("generate-projectspec-hierarchy-v6")
    expect(prompt).not.toContain("docs/high-level-architecture.md")
    expect(prompt.indexOf("Invoke `generate-projectspec-hierarchy-balanced`")).toBeLessThan(
      prompt.indexOf("read `docs/index.md` first"),
    )
    expect(index).toContain("| Project | Type / technology | Summary | Business | Architecture | Constraints |")
    expect(index).toContain("Business / grouped")
    expect(index).toContain("ARC/LIM IDs")
    for (const field of [
      "Scope",
      "Implementation impact / blast radius",
      "When it applies",
      "Evidence",
      "What to check",
    ]) {
      expect(governance).toContain(field)
    }
  })
})
