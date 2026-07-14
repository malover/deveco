import { describe, expect, test } from "bun:test"
import { readSource } from "../lib/source-reader"

describe("index.ts deveco CLI branding guard", () => {
  const source = readSource("packages/opencode/src/index.ts")

  test("uses deveco as the CLI script name", () => {
    expect(source).toMatch(/scriptName\("deveco"\)/)
  })

  test("sets the DEVECO process identity flag", () => {
    expect(source).toMatch(/process\.env\.DEVECO\s*=\s*"1"/)
  })

  test("sets the DEVECO_PID process identity", () => {
    expect(source).toMatch(/process\.env\.DEVECO_PID\s*=\s*String\(process\.pid\)/)
  })

  test("sets DEVECO_PURE for pure mode", () => {
    expect(source).toMatch(/process\.env\.DEVECO_PURE\s*=\s*"1"/)
  })
})
