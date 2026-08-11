import { describe, expect, test } from "bun:test"
import { ManualSkillCommand } from "../../src/command/manual"
import { SkillCommandTemplate } from "../../src/command/skill-template"

describe("skill slash commands", () => {
  test("resolve the skill root for manually invoked commands", () => {
    const result = SkillCommandTemplate.render({
      name: "codetograph",
      content: '!`{codetograph-command} --project .`, then read `"{skill-root}/instructions.md"`.',
      location: "/opt/deveco/skills/codetograph/SKILL.md",
    })

    expect(result).toContain('"/opt/deveco/skills/codetograph/instructions.md"')
    expect(result).toContain("codetograph.ts")
    expect(result).toContain("!`")
    expect(result).toContain("The user explicitly invoked /codetograph. Execute this workflow now")
    expect(result).toContain("Do not merely describe the workflow or ask for confirmation")
    expect(result).toContain("Base directory for this skill: /opt/deveco/skills/codetograph")
    expect(result).not.toContain("{skill-root}")
    expect(result).not.toContain("{codetograph-command}")
  })

  test("only exposes explicitly manual skills as direct slash commands", () => {
    expect(ManualSkillCommand.matches("codetograph")).toBe(true)
    expect(ManualSkillCommand.matches("document-project")).toBe(true)
    expect(ManualSkillCommand.matches("another-skill")).toBe(false)
    expect(ManualSkillCommand.source("codetograph")).toBe("command")
    expect(ManualSkillCommand.source("document-project")).toBe("command")
    expect(ManualSkillCommand.source("another-skill")).toBe("skill")
  })
})
