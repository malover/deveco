<!-- PROJECTSPEC:GENERATED:START -->
# Project Architecture — <project>

> Scope: `<project path>`  
> Baseline: `<revision>`  
> Governance: [Constraints and limitations](constraints-and-limitations.md)  
> Business: [Project Business](business.md)

## Project Boundary and Architecture

Explain what this Project is at runtime/build level, its observed architectural shape, important entry/public boundaries, and safest high-level starting points for feature work.

## Module Responsibilities and Dependency Direction

| Module | Responsibility | Depends on | Used by | Detail |
|---|---|---|---|---|

Include every physical module/build unit and link its Architecture document.

Normally include one compact Mermaid dependency/ownership view. Quote every human-readable node/edge/subgraph label.

## Cross-Module Runtime and Data Flows

Describe the representative Project-level paths needed to understand module composition. For a large application, 2-4 is a starting point, not a hard ceiling; include another only when it explains a materially different ownership/data/native path.

## External, Platform, and Native Boundaries

Include materially important platform services, native libraries, external systems, sibling Projects/local packages, or public contracts. Explain local ownership/handoff rather than listing dependencies.

## Change Ownership Map

| Change area | Start in | Why | Related module docs / ARC-CHK IDs |
|---|---|---|---|

Keep this compositional. Detailed state/reference patterns remain in module Architecture; durable rules/checks remain in governance.

## Source Evidence

| Architecture claim | Evidence anchor | What it establishes |
|---|---|---|
<!-- PROJECTSPEC:GENERATED:END -->
