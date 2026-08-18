<!-- PROJECTSPEC:GENERATED:START -->
# High-Level Architecture

> Scope: `<workspace or sole project>`  
> Baseline: `<revision or working tree>`  
> Evidence: Observed / Declared / Inferred / Unavailable as noted  
> Parent: [Documentation index](index.md)  
> Governance: [Constraints and limitations](constraints-and-limitations.md)

## Executive architecture summary

Explain the system shape, dominant runtime/data path, and primary boundaries. Link governance rather than repeating constraints or limitations.

## System context, scope, and boundaries

Identify owned Projects/modules, users/callers, platform/external systems, delegated behavior, and out-of-scope evidence.

## Project / module inventory

| Unit | Kind | Path | Responsibility | Runtime/build boundary | Key dependencies/consumers | Detail |
|---|---|---|---|---|---|---|

Include every physical unit; mark grouped units explicitly.

## Architecture and dependency map

Use a diagram at one level. Declare arrow semantics explicitly.

## Source-tree and ownership map

Describe major roots, entry/lifecycle areas, business feature owners, shared/public contracts, data/persistence owners, integrations/native code, resources/locales, tests, and build/CI locations.

## Entry points, lifecycle, and public/shared contracts

| Surface | Owner | Caller/consumer | Lifecycle/contract | Compatibility sensitivity | Evidence |
|---|---|---|---|---|---|

## Architectural areas and responsibilities

Explain 4-7 cohesive areas and how responsibility is divided.

## Dependency direction and consumer blast radius

Distinguish owned local, sibling Project, local native, external package, platform API, and external system dependencies. Identify known consumers and reverse-impact-sensitive surfaces.

## Key runtime, lifecycle, and state flows

Trace representative initialization and value-delivery/error flows to terminal effects/handoffs.

## Data and state architecture

Cover sources of truth, mutation owners, storage/cache, transformations, consistency/invalidation, migrations/versioning, and cross-process/device behavior.

## Integration and native/platform boundaries

Document contracts, protocols, permissions, callbacks/events, native bridge/ABI, error mapping, and ownership of each side.

## Technology, build, run, test, CI, and deployment posture

Include only evidenced tools/commands/configuration, variants/device targets, generated code, native targets, test layers, workflow coverage, and operational posture. Put limitations in the governance registry.

## Security, privacy, localization, accessibility, and resource behavior

Include evidenced enforcement points and architectural implications.

## Extension and Modification Points

| Change type | Correct owner/seam | Pattern/reference | Coupled files/contracts |
|---|---|---|---|

## Capability-to-architecture traceability

| Capability/flow/rule | Architecture owner | Entry/data/integration path | Test/evidence |
|---|---|---|---|

## Findings

Classify observed inconsistencies, architecture concerns, and implementation risks. Omit empty categories.

## Evidence register

| Claim area | Evidence anchor | Class | What it proves |
|---|---|---|---|
<!-- PROJECTSPEC:GENERATED:END -->
