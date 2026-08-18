<!-- PROJECTSPEC:GENERATED:START -->
# Module Architecture — <module>

> Scope: `<project/module path>`  
> Baseline: `<revision>`  
> Evidence: Observed / Declared / Inferred / Unavailable as noted  
> Parent: [Project Architecture](<relative link>) · [Documentation index](<relative link>)  
> Change-safety scope: <module-owned behavior/contracts>

## Responsibility, boundary, and why this module is standalone

State owned behavior/data/contracts and what remains outside. If unique substance is absent, group this module in Project Architecture.

## Module metadata and build/runtime role

Include kind, descriptor/build target, products/device variants, generated/native/resource participation, and independently relevant build facts.

## Source-tree and ownership map

| Area/path | Responsibility | Key entry/owner | Change significance |
|---|---|---|---|

## Internal architecture and collaboration

Explain 4-7 responsibilities/layers, dependency direction, orchestration, and reusable patterns.

## Entry points, exports, lifecycle hooks, and known consumers

| Surface/symbol | Type/contract | Caller/consumer | Effect/lifecycle | Evidence |
|---|---|---|---|---|

## Direct dependencies and integration boundaries

Classify owned sibling module, sibling Project/local package, local native, external package, platform API, and external system. State direction and contract.

## Runtime, lifecycle, state, and error flows

Trace important paths from entry through state/data/integration decisions to terminal effect/error/recovery.

## Data, state, persistence, cache, and consistency

Identify source of truth, mutation owner, data lifecycle, transformations, ordering/transactions, invalidation, schema/versioning, and recovery.

## Native, platform, permissions, and external integrations

Document bridge/API contract, threading/process context, callbacks/events, permission/enforcement point, errors, and ownership.

## Build, tests, resources, localization, and CI

Include actual commands/config and tests where evidenced, plus resources/locales/build files that change with behavior.

## Architectural Constraints and Invariants

| ID | Constraint/invariant | Why it matters | Scope/consumer impact | Evidence |
|---|---|---|---|---|

Cover ownership, dependency direction, lifecycle/state/concurrency, contract/schema/native compatibility, security/data handling, and build/platform/resource constraints.

## Extension and Modification Points

| Change type | Correct seam/symbol | Pattern/reference | Coupled artifacts |
|---|---|---|---|

## Known Limitations and Evidence Gaps

Separate verified limitations/fragility/test gaps from unavailable external evidence. Local code not inspected is not unavailable.

## Change Guardrails

- Verify callers/consumers and impact before changing exports/contracts/state.
- Preserve ownership, dependency direction, lifecycle/order, schema/native/API constraints.
- Follow listed extension seams rather than bypassing facades.
- Update coupled resources/config/locales/build/tests.
- Exercise scope-specific success and failure scenarios.

## Business capability and test traceability

| Capability/flow/rule | Module contribution | Entry/data/integration symbol | Test/evidence |
|---|---|---|---|

## Local findings and contributor gotchas

## Evidence register

| Claim area | Evidence anchor | Class | What it proves |
|---|---|---|---|
<!-- PROJECTSPEC:GENERATED:END -->
