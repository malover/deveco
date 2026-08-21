import { describe, expect, test } from "bun:test"

const goal = Bun.file(new URL("../../src/agent/prompt/goal.txt", import.meta.url)).text()

describe("Goal architecture drift orchestration", () => {
  test("tracks and orders the plan gate", async () => {
    const prompt = await goal
    const phase2 = prompt.indexOf("### Phase 2: Architecture & Design Planning")
    const phase25 = prompt.indexOf("### Phase 2.5: Architecture Drift Verification")
    const review = prompt.indexOf("`Approved, proceed to Phase 3`")
    const phase3 = prompt.indexOf("### Phase 3: Task Breakdown")
    expect(prompt).toContain("exactly these seven high-priority items")
    expect(phase25).toBeGreaterThan(phase2)
    expect(review).toBeGreaterThan(phase25)
    expect(phase3).toBeGreaterThan(review)
    expect(prompt).toContain("Run at most three total attempts")
    expect(prompt).toContain("Plan Gate: PASS")
    expect(prompt).toContain("architecture-compliance.md")
  })

  test("blocks verification when code conformance fails", async () => {
    const prompt = await goal
    const phase4 = prompt.slice(
      prompt.indexOf("### Phase 4: Implementation"),
      prompt.indexOf("### Phase 5: Verification & Validation"),
    )
    expect(phase4).toContain("one Task invocation of `spec-implementation`")
    expect(phase4).toContain("Code Gate is `PASS`")
    expect(phase4).toContain("Do not invoke a second implementation subagent")
    expect(phase4).toContain("keep Phase 4 in progress")
  })
})
