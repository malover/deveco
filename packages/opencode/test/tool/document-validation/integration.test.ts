import { describe, expect, test } from "bun:test"
import { validateDocumentSimple } from "@/tool/document-validation/document-validate-tool"
import { Effect } from "effect"
import * as path from "path"
import { tmpdir } from "../../fixture/fixture"

describe("Integration: validate existing SDD templates", () => {
  const templatesDir = path.resolve(__dirname, "../../../resources/spec/templates")

  test("spec-template.md should be a valid spec document", () => {
    const filePath = path.join(templatesDir, "spec-template.md")
    const result = Effect.runSync(validateDocumentSimple(filePath, "spec"))
    expect(result).toBe("")
  })

  test("plan-template.md should be a valid design document", () => {
    const filePath = path.join(templatesDir, "plan-template.md")
    const result = Effect.runSync(validateDocumentSimple(filePath, "design"))
    expect(result).toBe("")
  })

  test("design requires the architecture drift gate", async () => {
    await using tmp = await tmpdir()
    const filePath = path.join(tmp.path, "plan.md")
    const template = await Bun.file(path.join(templatesDir, "plan-template.md")).text()
    await Bun.write(filePath, template.replace("## Architecture Drift Gate", "## Removed Gate"))
    const result = Effect.runSync(validateDocumentSimple(filePath, "design"))
    expect(result).toContain("Missing required sections")
    expect(result).toContain("Architecture Drift Gate")
  })

  test("accepts a localized architecture drift gate", async () => {
    await using tmp = await tmpdir()
    const filePath = path.join(tmp.path, "plan.md")
    const template = await Bun.file(path.join(templatesDir, "plan-template.md")).text()
    await Bun.write(filePath, template.replace("## Architecture Drift Gate", "## 架构漂移门禁"))
    const result = Effect.runSync(validateDocumentSimple(filePath, "design"))
    expect(result).toBe("")
  })

  test("tasks-template.md should be a valid tasks document", () => {
    const filePath = path.join(templatesDir, "tasks-template.md")
    const result = Effect.runSync(validateDocumentSimple(filePath, "tasks"))
    expect(result).toBe("")
  })
})
