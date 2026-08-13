# High-Level Architecture

## System Responsibility
Concise technical responsibility of the repository.

## Technology and Runtime
Only major technologies/runtime facts needed to understand implementation.

## Module Map
For each physical module:
- module name/type,
- technical responsibility,
- major incoming/outgoing relationships.

Optionally include one Mermaid module/system relationship diagram.

All node and edge labels must be double-quoted.

## Important Entry Points
Main application/framework/package entry points only.

## Architectural Relationships
Significant cross-module/component relationships discovered primarily from Homegraph.

Use evidence-calibrated language:
- "Observed dependency direction is..."
- "Homegraph shows..."
- "Current implementation routes..."

Do not claim architecture is strict/enforced unless proven.

## Data and State
Important state ownership, persistence boundaries and caches.

## External Integrations
Important external APIs, SDKs, platform systems and databases.

## Key Runtime Flows
A small number of architecturally significant flows corresponding to processes/operations in `high-level-business.md`.

Implementation details such as cache/DB/API branches belong here rather than in the canonical business diagram.

## Build, Run, Test, and CI

### Setup
Document evidenced prerequisites/dependency-installation steps.

### Build
Document exact evidenced build commands.

Prefer repository wrappers such as `./hvigorw` / `hvigorw.bat` when present.

### Run
Document the evidenced launch/run workflow.

If running requires DevEco Studio and no reliable CLI command exists, say so.

### Test
Document exact evidenced test commands and test scope.

### CI
Inspect the COMPLETE discovered `.github/workflows` set.

Summarize:
- workflow names/files,
- triggers,
- important jobs,
- build/test/check commands,
- what workflows validate.

### CI Coverage Gaps
Include only gaps supported after inspecting all discovered workflow files.

Examples:
- builds but does not run tests,
- package produced but lint absent,
- no architecture checks present.

## Existing Architectural Patterns
Only patterns clearly demonstrated by current code.

Avoid claims such as "strict layering" unless enforced/proven.

## Repository Findings

### Observed Inconsistencies
Documentation/source/graph/configuration disagreements.

For each:
- **Declared/documented:** ...
- **Observed implementation:** ...
- **Why it matters:** ...
- **Affected scope:** ...

### Architecture Concerns
Evidence-backed concerns such as:
- security,
- coupling,
- maintainability,
- robustness,
- overly broad public surface,
- architectural smells.

For each:
- **Observed condition:** ...
- **Why it matters:** ...
- **Affected scope:** ...

Group related findings.

Do not duplicate findings elsewhere.

Omit empty categories.

## Key Evidence
3–8 important evidence anchors, including build/CI evidence when relevant.
