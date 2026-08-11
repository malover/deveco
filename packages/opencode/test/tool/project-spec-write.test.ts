import { describe, expect, test } from "bun:test"
import path from "node:path"
import { renderProjectSpec, validateProjectSpecInput, type ProjectSpecInput } from "@/tool/project-spec-document"
import { projectSpecTarget } from "@/tool/project-spec-path"

function input(): ProjectSpecInput {
  const claim = {
    statement: "Feature modules depend on common contracts.",
    evidence: ["homegraph_callees:Feature"],
  }
  return {
    overview: {
      purpose: "Test application",
      primaryPlatform: "HarmonyOS",
      primaryLanguages: ["ArkTS"],
      toolchain: ["Hvigor"],
      repositoryShape: "multi-module",
      evidence: ["build-profile.json5"],
    },
    graphAnalysis: {
      status: "healthy",
      revision: "files:10,nodes:20,edges:30",
      calls: 8,
      exploreCalls: 1,
      directReads: 3,
      limitations: [],
    },
    projectStructure: { tree: "common/\nfeature/", evidence: ["homegraph_files"] },
    modules: [
      {
        path: "feature",
        responsibility: "UI feature",
        dependencies: ["common"],
        evidence: ["homegraph_callees:Feature"],
      },
    ],
    entryPoints: [
      {
        symbol: "MainAbility.onCreate",
        path: "entry/MainAbility.ets",
        responsibility: "Starts the app",
        evidence: ["homegraph_node:MainAbility.onCreate"],
      },
    ],
    runtimeFlows: [
      {
        name: "Startup",
        steps: ["MainAbility.onCreate", "initLauncher"],
        trigger: "Ability creation",
        stateAndData: "Initial configuration",
        sideEffects: "Creates window",
        evidence: ["homegraph_explore:MainAbility.onCreate -> initLauncher"],
      },
    ],
    architectureBoundaries: [claim],
    contracts: [],
    stateAndData: [claim],
    changeGuidance: [],
    riskMap: [],
    buildAndConfiguration: [claim],
    testingAndVerification: [claim],
    changeSensitiveAreas: [],
    conventions: [claim],
    documentation: [{ path: "README.md", relevance: "Project purpose" }],
    uncertainties: [
      {
        topic: "Dynamic stage selection",
        currentEvidence: "Stages are registered",
        neededVerification: "Observe runtime selection",
      },
    ],
    repositoryCommit: "abc123",
  }
}

describe("project_spec_write", () => {
  test("uses docs as the canonical repository documentation directory", () => {
    expect(projectSpecTarget("/workspace/project")).toBe(path.join("/workspace/project", "docs", "project-spec.md"))
  })

  test("renders every canonical section exactly once", () => {
    const output = renderProjectSpec(input(), "2026-08-10T00:00:00.000Z")
    const headings = [
      "Project Overview",
      "Graph Analysis",
      "Project Structure",
      "Module Semantics",
      "Runtime Entry Points",
      "Key Runtime Flows",
      "Architecture and Dependency Boundaries",
      "Key Interfaces and Shared Contracts",
      "State and Data",
      "Feature Change Guidance",
      "Modification Risk Map",
      "Build and Configuration",
      "Testing and Verification",
      "Change-Sensitive Areas",
      "Implementation Conventions",
      "Existing Documentation",
      "Uncertain or Inferred Information",
      "Generation Metadata",
    ]

    for (const heading of headings) expect(output.match(new RegExp(`^## ${heading}$`, "gm"))).toHaveLength(1)
    expect(output).toContain("project_spec_write-v2")
    expect(output).not.toContain("project-spec-evidence-v1")
  })

  test("rejects unsupported authoritative claims", () => {
    const source = input()
    const malformed: ProjectSpecInput = {
      ...source,
      runtimeFlows: source.runtimeFlows.map((flow, index) => (index === 0 ? { ...flow, evidence: [] } : flow)),
    }

    expect(() => validateProjectSpecInput(malformed)).toThrow("requires non-empty evidence")
  })

  test("rejects duplicate semantic entries", () => {
    const source = input()
    const malformed: ProjectSpecInput = { ...source, modules: [...source.modules, source.modules[0]] }
    expect(() => validateProjectSpecInput(malformed)).toThrow("modules contains duplicate entries")
  })
})
