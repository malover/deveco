import { describe, expect, test } from "bun:test"

const skillRoot = new URL("../../resources/skills/generate-projectspec-hierarchy-v6/", import.meta.url)
const goal = Bun.file(new URL("../../src/agent/prompt/goal.txt", import.meta.url)).text()

function read(relative: string) {
  return Bun.file(new URL(relative, skillRoot)).text()
}

describe("generate-projectspec-hierarchy-v6 Goal integration", () => {
  test("keeps documentation generation owned by the skill", async () => {
    const [skill, workflow, prompt] = await Promise.all([read("SKILL.md"), read("workflow.md"), goal])

    expect(skill).toContain("high-level-architecture.md")
    expect(skill).toContain("high-level-business.md")
    expect(skill).toContain("significance-based")
    expect(workflow).toContain("Documentation Plan")
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
})
