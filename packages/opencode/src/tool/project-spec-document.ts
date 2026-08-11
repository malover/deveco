import { Schema } from "effect"

const Risk = Schema.Literals(["High", "Medium", "Low"])
const Evidence = Schema.Array(Schema.String)

const Claim = Schema.Struct({
  statement: Schema.String,
  evidence: Evidence,
})

export const ProjectSpecParameters = Schema.Struct({
  overview: Schema.Struct({
    purpose: Schema.String,
    primaryPlatform: Schema.String,
    primaryLanguages: Schema.Array(Schema.String),
    toolchain: Schema.Array(Schema.String),
    repositoryShape: Schema.String,
    evidence: Evidence,
  }),
  graphAnalysis: Schema.Struct({
    status: Schema.String,
    revision: Schema.optional(Schema.String),
    calls: Schema.Number,
    exploreCalls: Schema.Number,
    directReads: Schema.Number,
    limitations: Schema.Array(Schema.String),
  }),
  projectStructure: Schema.Struct({
    tree: Schema.String,
    evidence: Evidence,
  }),
  modules: Schema.Array(
    Schema.Struct({
      path: Schema.String,
      responsibility: Schema.String,
      dependencies: Schema.Array(Schema.String),
      evidence: Evidence,
    }),
  ),
  entryPoints: Schema.Array(
    Schema.Struct({
      symbol: Schema.String,
      path: Schema.String,
      responsibility: Schema.String,
      evidence: Evidence,
    }),
  ),
  runtimeFlows: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      steps: Schema.Array(Schema.String),
      trigger: Schema.String,
      stateAndData: Schema.String,
      sideEffects: Schema.String,
      evidence: Evidence,
    }),
  ),
  architectureBoundaries: Schema.Array(Claim),
  contracts: Schema.Array(
    Schema.Struct({
      symbol: Schema.String,
      path: Schema.String,
      role: Schema.String,
      evidence: Evidence,
    }),
  ),
  stateAndData: Schema.Array(Claim),
  changeGuidance: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      route: Schema.Array(Schema.String),
      startHere: Schema.String,
      preserve: Schema.Array(Schema.String),
      avoid: Schema.Array(Schema.String),
      applicability: Schema.String,
      evidence: Evidence,
    }),
  ),
  riskMap: Schema.Array(
    Schema.Struct({
      risk: Risk,
      area: Schema.String,
      blastRadius: Schema.String,
      evidence: Evidence,
      saferStrategy: Schema.String,
    }),
  ),
  buildAndConfiguration: Schema.Array(Claim),
  testingAndVerification: Schema.Array(Claim),
  changeSensitiveAreas: Schema.Array(
    Schema.Struct({
      area: Schema.String,
      reason: Schema.String,
      evidence: Evidence,
    }),
  ),
  conventions: Schema.Array(Claim),
  documentation: Schema.Array(
    Schema.Struct({
      path: Schema.String,
      relevance: Schema.String,
    }),
  ),
  uncertainties: Schema.Array(
    Schema.Struct({
      topic: Schema.String,
      currentEvidence: Schema.String,
      neededVerification: Schema.String,
    }),
  ),
  repositoryCommit: Schema.optional(Schema.String),
})

export type ProjectSpecInput = Schema.Schema.Type<typeof ProjectSpecParameters>

const REQUIRED_COLLECTIONS = ["modules", "entryPoints", "architectureBoundaries"] as const

export function validateProjectSpecInput(input: ProjectSpecInput) {
  const errors: string[] = []
  const authoritative = [
    ...input.modules,
    ...input.entryPoints,
    ...input.runtimeFlows,
    ...input.architectureBoundaries,
    ...input.contracts,
    ...input.stateAndData,
    ...input.changeGuidance,
    ...input.riskMap,
    ...input.buildAndConfiguration,
    ...input.testingAndVerification,
    ...input.changeSensitiveAreas,
    ...input.conventions,
  ]

  if (input.overview.evidence.length === 0) errors.push("overview requires evidence")
  if (input.projectStructure.evidence.length === 0) errors.push("projectStructure requires evidence")
  if (input.overview.evidence.length > 6) errors.push("overview exceeds six evidence references")
  if (input.projectStructure.evidence.length > 6) errors.push("projectStructure exceeds six evidence references")
  if (!Number.isInteger(input.graphAnalysis.calls) || input.graphAnalysis.calls < 0 || input.graphAnalysis.calls > 24) {
    errors.push("graphAnalysis.calls must be an integer between 0 and 24")
  }
  if (
    !Number.isInteger(input.graphAnalysis.exploreCalls) ||
    input.graphAnalysis.exploreCalls < 0 ||
    input.graphAnalysis.exploreCalls > input.graphAnalysis.calls
  ) {
    errors.push("graphAnalysis.exploreCalls must be an integer between 0 and graphAnalysis.calls")
  }
  if (
    !Number.isInteger(input.graphAnalysis.directReads) ||
    input.graphAnalysis.directReads < 0 ||
    input.graphAnalysis.directReads > 24
  ) {
    errors.push("graphAnalysis.directReads must be an integer between 0 and 24")
  }
  for (const collection of REQUIRED_COLLECTIONS) {
    if (input[collection].length === 0) errors.push(`${collection} must not be empty`)
  }
  for (const key of [
    "modules",
    "entryPoints",
    "runtimeFlows",
    "architectureBoundaries",
    "contracts",
    "stateAndData",
    "changeGuidance",
    "riskMap",
    "buildAndConfiguration",
    "testingAndVerification",
    "changeSensitiveAreas",
    "conventions",
    "documentation",
    "uncertainties",
  ] as const) {
    if (input[key].length > 12) errors.push(`${key} exceeds the compact limit of 12 entries`)
  }
  for (const [index, claim] of authoritative.entries()) {
    if (claim.evidence.length === 0 || claim.evidence.some((item) => !item.trim())) {
      errors.push(`authoritative claim ${index + 1} requires non-empty evidence`)
    }
    if (claim.evidence.length > 6) errors.push(`authoritative claim ${index + 1} exceeds six evidence references`)
  }
  for (const [index, flow] of input.runtimeFlows.entries()) {
    if (flow.steps.length < 2) errors.push(`runtimeFlows[${index}] requires at least two verified steps`)
  }
  for (const [index, guidance] of input.changeGuidance.entries()) {
    if (guidance.route.length < 2) errors.push(`changeGuidance[${index}] requires at least two verified route steps`)
  }
  for (const key of ["modules", "entryPoints", "runtimeFlows", "contracts", "changeGuidance", "riskMap"] as const) {
    const values = input[key].map((item) =>
      "name" in item ? item.name : "symbol" in item ? item.symbol : "area" in item ? item.area : item.path,
    )
    if (new Set(values.map((value) => value.toLowerCase())).size !== values.length) {
      errors.push(`${key} contains duplicate entries`)
    }
  }
  if (errors.length) throw new Error(`Invalid Project SPEC input:\n- ${errors.join("\n- ")}`)
}

export function renderProjectSpec(input: ProjectSpecInput, generatedAt = new Date().toISOString()) {
  validateProjectSpecInput(input)
  const evidence = (items: readonly string[]) => items.map((item) => `\`${escapeCell(item)}\``).join("<br>")
  const claims = (items: readonly { statement: string; evidence: readonly string[] }[]) =>
    items.map((item) => `- ${item.statement} Evidence: ${evidence(item.evidence)}.`).join("\n") || "- None verified."

  const document = `# Project SPEC

> Repository-level current-state context. HomeGraph is the repository knowledge base; this compact briefing contains only explicitly verified claims.

## Project Overview

- **Purpose**: ${input.overview.purpose}
- **Primary platform**: ${input.overview.primaryPlatform}
- **Primary languages**: ${input.overview.primaryLanguages.join(", ")}
- **Toolchain**: ${input.overview.toolchain.join(", ")}
- **Repository shape**: ${input.overview.repositoryShape}
- **Evidence**: ${evidence(input.overview.evidence)}

## Graph Analysis

- **Backend**: persistent HomeGraph MCP
- **Status**: ${input.graphAnalysis.status}
- **Revision**: ${input.graphAnalysis.revision ?? "not exposed"}
- **HomeGraph calls**: ${input.graphAnalysis.calls}
- **Targeted explore calls**: ${input.graphAnalysis.exploreCalls}
- **Direct documentation/config reads**: ${input.graphAnalysis.directReads}
- **Limitations**: ${input.graphAnalysis.limitations.join("; ") || "None observed"}

## Project Structure

\`\`\`text
${input.projectStructure.tree.trim()}
\`\`\`

Evidence: ${evidence(input.projectStructure.evidence)}.

## Module Semantics

| Module Path | Responsibility | Key Dependencies | Evidence |
| --- | --- | --- | --- |
${input.modules.map((item) => `| \`${escapeCell(item.path)}\` | ${escapeCell(item.responsibility)} | ${item.dependencies.map(escapeCell).join(", ") || "None verified"} | ${evidence(item.evidence)} |`).join("\n")}

## Runtime Entry Points

| Entry Point | Path | Responsibility | Evidence |
| --- | --- | --- | --- |
${input.entryPoints.map((item) => `| \`${escapeCell(item.symbol)}\` | \`${escapeCell(item.path)}\` | ${escapeCell(item.responsibility)} | ${evidence(item.evidence)} |`).join("\n")}

## Key Runtime Flows

${input.runtimeFlows.map((flow) => `### ${flow.name}\n\n${flow.steps.map((step) => `\`${step}\``).join(" → ")}\n\n- **Trigger**: ${flow.trigger}\n- **State/data movement**: ${flow.stateAndData}\n- **Side effects**: ${flow.sideEffects}\n- **Evidence**: ${evidence(flow.evidence)}`).join("\n\n") || "No complete multi-step runtime flow was statically verified. See uncertainties."}

## Architecture and Dependency Boundaries

${claims(input.architectureBoundaries)}

## Key Interfaces and Shared Contracts

| Contract / Symbol | Path | Consumers / Role | Evidence |
| --- | --- | --- | --- |
${input.contracts.map((item) => `| \`${escapeCell(item.symbol)}\` | \`${escapeCell(item.path)}\` | ${escapeCell(item.role)} | ${evidence(item.evidence)} |`).join("\n") || "| None verified | — | — | — |"}

## State and Data

${claims(input.stateAndData)}

## Feature Change Guidance

${input.changeGuidance.map((item) => `### ${item.name}\n\n${item.route.map((step) => `\`${step}\``).join(" → ")}\n\n- **Start here**: ${item.startHere}\n- **Verified propagation**: ${item.route.join(" → ")}\n- **Preserve**: ${item.preserve.join("; ") || "No additional convention verified"}\n- **Avoid**: ${item.avoid.join("; ") || "No additional boundary verified"}\n- **Evidence**: ${evidence(item.evidence)}\n- **Applicability**: ${item.applicability}`).join("\n\n") || "No reusable multi-step change archetype was verified."}

## Modification Risk Map

| Risk | Area / Symbol | Potential Blast Radius | Evidence | Safer Change Strategy |
| --- | --- | --- | --- | --- |
${input.riskMap.map((item) => `| ${item.risk} | \`${escapeCell(item.area)}\` | ${escapeCell(item.blastRadius)} | ${evidence(item.evidence)} | ${escapeCell(item.saferStrategy)} |`).join("\n") || "| — | None verified | — | — | — |"}

## Build and Configuration

${claims(input.buildAndConfiguration)}

## Testing and Verification

${claims(input.testingAndVerification)}

## Change-Sensitive Areas

| Area / Symbol | Why Sensitive | Evidence |
| --- | --- | --- |
${input.changeSensitiveAreas.map((item) => `| \`${escapeCell(item.area)}\` | ${escapeCell(item.reason)} | ${evidence(item.evidence)} |`).join("\n") || "| None verified | — | — |"}

## Implementation Conventions

${claims(input.conventions)}

## Existing Documentation

| Path | Relevance |
| --- | --- |
${input.documentation.map((item) => `| \`${escapeCell(item.path)}\` | ${escapeCell(item.relevance)} |`).join("\n") || "| None used | — |"}

## Uncertain or Inferred Information

| Topic | Current Evidence | Needed Verification |
| --- | --- | --- |
${input.uncertainties.map((item) => `| ${escapeCell(item.topic)} | ${escapeCell(item.currentEvidence)} | ${escapeCell(item.neededVerification)} |`).join("\n") || "| None recorded | — | — |"}

## Generation Metadata

- **Generated at**: ${generatedAt}
- **Repository commit**: ${input.repositoryCommit ?? "unavailable"}
- **HomeGraph revision**: ${input.graphAnalysis.revision ?? "unavailable"}
- **Generator**: \`project_spec_write-v2\`
`
  if (document.length > 50_000) throw new Error("Rendered Project SPEC exceeds the compact 50,000-character limit")
  return document
}

function escapeCell(value: string) {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ").trim()
}
