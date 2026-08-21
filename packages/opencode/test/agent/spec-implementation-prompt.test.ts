import { describe, expect, test } from "bun:test"

const prompt = Bun.file(new URL("../../src/agent/prompt/spec-implementation.txt", import.meta.url)).text()
const workflow = Bun.file(new URL("../../resources/spec/commands/spec-implement.md", import.meta.url)).text()

describe("spec implementation architecture conformance", () => {
  test("loads governance before implementation and repairs in one session", async () => {
    const [system, command] = await Promise.all([prompt, workflow])
    expect(system).toContain("docs/index.md")
    expect(system).toContain("same child session")
    expect(system).toContain("Code Gate")
    const context = command.indexOf("Read `{PROJECT_ROOT}/docs/index.md`")
    const implementation = command.indexOf("4. **Implementation Workflow:**")
    const gate = command.indexOf("5. **Code Gate And In-Session Remediation:**")
    const report = command.indexOf("7. **Completion Validation:**")
    expect(context).toBeGreaterThan(-1)
    expect(implementation).toBeGreaterThan(context)
    expect(gate).toBeGreaterThan(implementation)
    expect(report).toBeGreaterThan(gate)
    expect(command).toContain("at most three total static conformance attempts")
    expect(command).toContain("Do not delegate remediation")
    expect(command).toContain("`COMPLETED` requires `Code Gate: PASS`")
  })

  test("preserves verification boundaries", async () => {
    const command = await workflow
    expect(command).toContain("`verify_ui`, `build_project`, and `start_app` tools MUST NOT be invoked")
    expect(command).toContain("deferred Phase 5 checks")
  })
})
