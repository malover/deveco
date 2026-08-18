# Architecture Documentation

## Purpose

Create a map a coding agent can use to answer: where is this behavior owned, how do I enter it, what depends on it, what state/data/integrations does it touch, what important path executes, and what evidence supports the answer?

Prefer responsibilities and relationships over file/class inventories.

## Required architectural views

At the owning scope, cover when evidenced:

- context and boundaries;
- physical inventory and architectural areas;
- important entry points and public/shared surfaces;
- dependency direction and known consumers;
- runtime/lifecycle/state flows;
- data/state ownership, sources of truth, persistence, caches, and transformations;
- external/platform integrations and contracts;
- build/run/test/CI/deployment posture;
- observed patterns/constraints and findings;
- evidence and limitations.

## Zoom by level

- **Workspace/System**: Projects, external systems, cross-project contracts, shared capabilities, blast radius, root orchestration.
- **Project**: owned modules/build units, intra-project areas and dependencies, project public surface, project-local runtime/data/integration/build behavior.
- **Module**: 4-7 internal responsibilities, entry points/exports, direct dependencies/consumers, local state/data/integrations, major flows, local findings.
- **GN target**: normally a Project inventory row; expand only when independently useful.

Do not show all levels in one diagram.

## Ownership precision

Distinguish:

- implementation ownership;
- data/state ownership and source of truth;
- lifecycle/wiring/registration ownership;
- public API ownership;
- external delegated behavior.

Do not say a module owns data merely because it declares a type. Do not claim implementation across a Project boundary; describe the contract/delegation and link to the provider.

## Public surfaces

Separate:

- package exports and externally consumable APIs;
- framework/application entry points such as abilities, routes, services, extensions, and lifecycle hooks;
- internal shared symbols/facades.

If low-level internals are exported beside a facade, state the bypass possibility as an observed concern only when evidenced.

## Runtime and data flows

Use graph-backed paths when available. Select flows that explain value delivery, lifecycle, persistence/cache behavior, external calls, cross-module boundaries, or notable failures. Do not trace every function.

For exact constants, conditions, terminal state/error outcomes, persistence semantics, and contract values, verify the defining source/config.

## Dependencies

List direct dependencies by default. Mention transitive dependencies only when they impose a meaningful runtime, deployment, security, versioning, or integration constraint, and label them transitive.

Keep these distinct:

- owned Module;
- sibling Project;
- local workspace/package;
- external package;
- external system/platform API.

## Observed posture, not target design

Describe patterns as observed:

- “Current dependency direction is ...”
- “The implementation routes ...”
- “Graph evidence shows ...”

Do not claim “strict”, “enforced”, “guaranteed”, or design rationale without enforcement/decision evidence. Do not invent NFR targets, threat models, SLAs, RTO/RPO, migration plans, or technology justifications.

## Build, test, and CI

Document only commands and checks evidenced by wrappers, build files, READMEs, test configuration, and the complete relevant CI workflow set. Prefer repository wrappers. Say when DevEco Studio or unavailable infrastructure is required. Avoid repeating Project-local commands at workspace level unless root orchestration uses them.

## Evidence anchors

End each standalone Architecture document with a compact evidence table:

| Claim area | Evidence | Class |
|---|---|---|
| Entry/public surface | `path#symbol-or-key` | Observed |

Keep one precise anchor at the lowest owning level. Parent documents should link downward instead of repeating all anchors.
