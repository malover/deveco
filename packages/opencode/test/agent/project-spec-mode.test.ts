import { describe, expect, test } from "bun:test"
import { projectSpecGoalPrompt, projectSpecMode } from "@/agent/project-spec-mode"

describe("Project SPEC mode", () => {
  test("uses the direct path by default", () => {
    expect(projectSpecMode({})).toBe("v2-direct")
    expect(projectSpecGoalPrompt("mode={PROJECT_SPEC_MODE}", {})).toBe("mode=v2-direct")
  })

  test("supports both isolated rollback flags", () => {
    expect(projectSpecMode({ DEVECO_PROJECT_SPEC_ISOLATED: "1" })).toBe("legacy-isolated")
    expect(projectSpecMode({ DEVECO_PROJECT_SPEC_V2: "0" })).toBe("legacy-isolated")
  })
})
