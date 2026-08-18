<!-- PROJECTSPEC:GENERATED:START -->
# Project Architecture — <project>

> Scope: `<project path>`  
> Baseline: `<revision>`  
> Evidence: Observed / Declared / Inferred / Unavailable as noted  
> Parent: [High-Level Architecture](<relative link>) · [Documentation index](<relative link>)  
> Change-safety scope: <Project-wide constraints>

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

Document evidenced commands/tooling, module/variant/device/native build wiring, tests and fixtures, CI workflow coverage, generated code, and environment limitations.

## Security, privacy, localization, accessibility, and resources

Capture current enforcement/ownership and coupled resources where relevant.

## Architectural Constraints and Invariants

| ID | Constraint/invariant | Why it matters | Affected modules/consumers | Evidence |
|---|---|---|---|---|

Cover source-of-truth ownership, dependency direction, lifecycle/state/concurrency, public/schema/native compatibility, security/data handling, and build/platform/resource rules.

## Extension and Modification Points

| Feature/change | Correct seam/owner | Existing pattern to follow | Coupled artifacts |
|---|---|---|---|

## Known Limitations and Evidence Gaps

Document verified limitations, fragile coupling, unsupported variants, incomplete tests, and exact external evidence gaps. Resolve local uninspected evidence for major flows.

## Change Guardrails

- Locate the capability/data/public owner before adding code.
- Inspect callers/consumers and cross-Project/native blast radius.
- Preserve dependency direction, lifecycle ordering, state ownership, and contracts above.
- Update coupled build/profile/resources/locales/schemas/exports.
- Exercise relevant happy/error/cancel/offline/permission/device paths.
- Run evidenced checks and update linked specifications.

## Capability-to-architecture-and-test traceability

| Capability/flow/rule | Entry/orchestrator | State/data/integration owner | Representative test/evidence |
|---|---|---|---|

## Project findings

## Evidence register

| Claim area | Evidence anchor | Class | What it proves |
|---|---|---|---|
<!-- PROJECTSPEC:GENERATED:END -->
