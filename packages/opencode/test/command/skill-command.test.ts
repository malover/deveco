import { describe, expect, test } from "bun:test"
import { skillTemplate } from "../../src/command"
import { ManualSkillCommand } from "../../src/command/manual"

describe("skill slash commands", () => {
  test("resolve the skill root for manually invoked commands", () => {
    const result = skillTemplate({
      name: "codetograph",
      content: 'Run `bun run "{skill-root}/scripts/tool.ts"` and read `./instructions.md`.',
      location: "/opt/deveco/skills/codetograph/SKILL.md",
    })

    expect(result).toContain('bun run "/opt/deveco/skills/codetograph/scripts/tool.ts"')
    expect(result).toContain("The user explicitly invoked /codetograph. Execute this workflow now")
    expect(result).toContain("Do not merely describe the workflow or ask for confirmation")
    expect(result).toContain("Base directory for this skill: /opt/deveco/skills/codetograph")
    expect(result).not.toContain("{skill-root}")
  })

  test("only exposes explicitly manual skills as direct slash commands", () => {
    expect(ManualSkillCommand.matches("codetograph")).toBe(true)
    expect(ManualSkillCommand.matches("document-project")).toBe(true)
    expect(ManualSkillCommand.matches("another-skill")).toBe(false)
  })
})
