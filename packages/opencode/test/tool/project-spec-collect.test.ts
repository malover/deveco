import { describe, expect, test } from "bun:test"
import { compactProjectSpecEvidence, extractProjectSpecPaths } from "@/tool/project-spec-evidence"

describe("project_spec_collect compaction", () => {
  test("keeps relevant evidence, removes duplicates, and respects the bound", () => {
    const input = [
      "noise with no useful relationship",
      "src/MainAbility.ets: MainAbility.onCreate calls initLauncher",
      "src/MainAbility.ets: MainAbility.onCreate calls initLauncher",
      "feature/Desktop.ets -> GridLayoutConfigs",
      "state manager persists grid config to database",
    ].join("\n")

    const output = compactProjectSpecEvidence(input, 180)
    expect(output.length).toBeLessThanOrEqual(180)
    expect(output).toContain("MainAbility.onCreate")
    expect(output.match(/MainAbility\.onCreate/g)).toHaveLength(1)
    expect(output).toContain("GridLayoutConfigs")
    expect(output).not.toContain("noise with no useful relationship")
  })

  test("extracts safe representative source paths", () => {
    const output = extractProjectSpecPaths(
      "feature/pagedesktop/PageDesktop.ets calls common/SettingsModel.ts and node_modules/pkg/index.ts",
    )
    expect(output).toEqual(["feature/pagedesktop/PageDesktop.ets", "common/SettingsModel.ts"])
  })
})
