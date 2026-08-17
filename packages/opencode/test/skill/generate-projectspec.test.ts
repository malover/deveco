import { describe, expect, test } from "bun:test"

const skillRoot = new URL("../../resources/skills/generate-projectspec/", import.meta.url)
const goal = Bun.file(new URL("../../src/agent/prompt/goal.txt", import.meta.url)).text()

function read(relative: string) {
  return Bun.file(new URL(relative, skillRoot)).text()
}

describe("generate-projectspec Goal integration", () => {
  test("keeps documentation generation owned by the skill", async () => {
    const [skill, workflow, prompt] = await Promise.all([read("SKILL.md"), read("workflows/full-scan-workflow.md"), goal])

    expect(skill).toContain("docs/high-level-architecture.md")
    expect(skill).toContain("high-level-business.md")
    expect(skill).toContain("<module-name>/")
    expect(skill).toContain("architecture.md")
    expect(skill).toContain("business.md")
    expect(workflow).toContain("Generate only:")
    expect(prompt).toContain('call the `skill` tool with `name: "generate-projectspec"`')
    expect(prompt).toContain("If both high-level documents already exist and are readable and non-empty, reuse them")
  })

  test("loads high-level knowledge before relevant modules without legacy artifacts", async () => {
    const prompt = await goal
    const architecture = prompt.indexOf("Read `docs/high-level-architecture.md` first")
    const business = prompt.indexOf("then `docs/high-level-business.md`")
    const modules = prompt.indexOf("For each relevant module")

    expect(architecture).toBeGreaterThan(-1)
    expect(business).toBeGreaterThan(architecture)
    expect(modules).toBeGreaterThan(business)
    expect(prompt).toContain("Ignore `docs/project-spec.md` when deciding whether the new documentation exists")
  })
})
