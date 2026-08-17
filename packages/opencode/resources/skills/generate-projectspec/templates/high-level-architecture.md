> Atomic direct-write rule: this is the only active document template. Once evidence is sufficient, write the file directly; do not create a near-final prose draft elsewhere first.

> Deduplication: summarize module-owned detail; include it here only when required for cross-module/system-wide understanding. Prefer pointing to the responsible module over replaying implementation detail.

# High-Level Architecture

## System Context
Concise repository responsibility, analyzed boundary, external actors/systems, and linked-source/package boundaries relevant to understanding the solution.

## Physical Module Map
For each physical repository module:
- name/type,
- technical responsibility,
- important incoming/outgoing relationships.

Keep linked repositories/packages/external systems visibly separate from physical modules.

Optionally include one Mermaid context/module diagram.

## Solution / Component Architecture
Explain the major architectural responsibilities/layers and how they collaborate across the repository.
Summarize module detail rather than replaying it.

## Important Entry Points
Main application/framework/package entry points only.

## Data Architecture
Cover important:
- state/data ownership,
- sources of truth,
- persistence/storage,
- caches/freshness semantics,
- major transformations,
- cross-module data flow,
- external data sources.

## Integration Architecture
Cover important:
- external APIs/systems,
- platform APIs,
- SDK/package/linked-repository boundaries,
- IPC/service boundaries,
- protocols/contracts where relevant,
- responsible module and interaction direction.

## Key Runtime Flows
A small number of architecturally significant Homegraph-backed flows corresponding to major business capabilities/use cases.

Implementation branches such as cache/DB/API choices belong here rather than in the canonical business diagram.

## Technology and Runtime
Major languages, frameworks, databases, platforms and tools needed to understand implementation.
Do not invent technology-choice rationale.

## Observed Architecture Patterns and Constraints
Observed structural patterns only.
Clearly distinguish observation from approved/enforced architecture rules.

## Security and Quality Posture
Concise evidence-backed current posture covering relevant security, robustness, maintainability, observability, testability, and fault-handling characteristics.
Do not invent target NFRs.

## Build, Run, Test, and CI

### Setup
Exact evidenced setup/prerequisite steps.

### Build
Exact evidenced build commands/procedure.

### Run
Exact evidenced launch procedure; state when DevEco Studio is required and no CLI path is evidenced.

### Test
Exact evidenced tests/commands and actual test scope.

### CI/CD
Summarize the complete tracked CI configuration at the selected revision:
- workflow names/files,
- triggers,
- important jobs,
- build/test/check/deploy behavior when present.

### CI Coverage Gaps
Only evidence-backed gaps after inspecting the complete workflow set.

## Repository Findings

### Observed Inconsistencies
Omit if none.

### Architecture Concerns
Omit if none.

### Implementation Risks
Omit if none.

## Key Evidence
3–8 high-value evidence anchors spanning architecture, data/integration, runtime and developer workflow where relevant.