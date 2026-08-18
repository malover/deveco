<!-- PROJECTSPEC:GENERATED:START -->
# Project Architecture — <project>

> Scope: `<project path>`  
> Baseline: `<revision>`  
> Evidence: Observed / Declared / Inferred / Unavailable as noted  
> Parent: [High-Level Architecture](<relative link>) · [Documentation index](<relative link>)  
> Governance: [Project constraints and limitations](constraints-and-limitations.md)

## Architecture summary and Project boundary

Explain the Project’s runtime/build role, major architectural pattern as observed, public contract, and safest place to begin feature work.

## Build model and physical module inventory

| Module/build unit | Kind | Path | Responsibility | Area | Dependencies/consumers | Detail |
|---|---|---|---|---|---|---|

Include every physical unit. Group only units without unique standalone substance.

## Source-tree and ownership map

Annotate entry/lifecycle, feature/UI, state/orchestration, domain/data, integration/native, shared/public, resources/locales, tests, and build/config roots.

## Architectural areas and dependency direction

Explain 4-7 areas, allowed direction, collaboration mechanism, and known bypass/cycle risks. Include a labeled diagram when useful.

## Entry points, lifecycle hooks, and public/shared surfaces

| Surface | Owning module/symbol | Caller/consumer | Contract/lifecycle | Evidence |
|---|---|---|---|---|

## Runtime, lifecycle, state, and error flows

Trace representative bootstrap and capability paths with ordering, decisions, handoffs, terminal effects, and recovery.

## Data, state, persistence, and consistency

Identify source-of-truth/mutation owners, stores/caches, transformations, invalidation, transaction/order rules, schema/version behavior, and failure recovery.

## Integrations and cross-Project/native/platform boundaries

Classify each boundary accurately; document inputs/outputs, callbacks/events, permissions, error mapping, and consumer/provider ownership.

## Technology, build, run, test, CI, and deployment

Document evidenced commands/tooling, module/variant/device/native build wiring, tests and fixtures, CI workflow coverage, generated code, and environment posture. Put limitations in the governance registry.

## Security, privacy, localization, accessibility, and resources

Capture current enforcement/ownership and coupled resources where relevant.

## Extension and Modification Points

| Feature/change | Correct seam/owner | Existing pattern to follow | Coupled artifacts |
|---|---|---|---|

## Capability-to-architecture-and-test traceability

| Capability/flow/rule | Entry/orchestrator | State/data/integration owner | Representative test/evidence |
|---|---|---|---|

## Project findings

## Evidence register

| Claim area | Evidence anchor | Class | What it proves |
|---|---|---|---|
<!-- PROJECTSPEC:GENERATED:END -->
