import { describe, expect, test } from "bun:test"
import { skillTemplate } from "../../src/command"

describe("skill slash commands", () => {
  test("resolve the skill root for manually invoked commands", () => {
    const result = skillTemplate({
      content: 'Run `bun run "{skill-root}/scripts/tool.ts"` and read `./instructions.md`.',
      location: "/opt/deveco/skills/codetograph/SKILL.md",
    })

    expect(result).toContain('bun run "/opt/deveco/skills/codetograph/scripts/tool.ts"')
    expect(result).toContain("Base directory for this skill: /opt/deveco/skills/codetograph")
    expect(result).not.toContain("{skill-root}")
  })
})
