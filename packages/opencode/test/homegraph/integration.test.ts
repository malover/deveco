import { describe, expect, test } from "bun:test"
import { selectHomeGraphExecutable } from "@/homegraph/integration"

describe("HomeGraph integration", () => {
  test("returns no executable when HomeGraph is not installed", () => {
    expect(selectHomeGraphExecutable([])).toBeUndefined()
    expect(selectHomeGraphExecutable(["/definitely/missing/homegraph"])).toBeUndefined()
  })
})
