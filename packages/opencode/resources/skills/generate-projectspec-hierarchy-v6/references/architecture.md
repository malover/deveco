# Architecture Documentation

## Primary purpose: prevent architectural drift

Architecture documents are change-safety contracts. A coding agent must be able to determine:

- where new behavior belongs and which owner/source of truth must remain authoritative;
- which entry points, public contracts, consumers, and dependency directions must be preserved;
- which lifecycle, state, data, threading/process, native/platform, security, and build constraints apply;
- what extension seams and reference patterns to use;
- what limitations and fragile boundaries exist;
- what impact checks and tests are required before changing the scope.

A component list or dependency diagram alone is insufficient.

## Required views at every architecture level

Provide scope-appropriate substance for:

1. context, scope, boundary, and responsibilities;
2. physical inventory plus logical architectural areas;
3. annotated source-tree/ownership map at the current zoom;
4. entry points, lifecycle hooks, public/shared surfaces, and known consumers;
5. direct dependency direction and cross-boundary contracts;
6. representative runtime/lifecycle/state/control flows;
7. data/state ownership, sources of truth, persistence, caches, transformations, consistency, and invalidation;
8. external/platform/native integrations and failure boundaries;
9. technology/build/run/test/CI/deployment posture evidenced by repository files;
10. security, permission, privacy, localization/accessibility, and resource behavior when relevant;
11. architectural constraints and invariants;
12. extension/modification points and patterns to follow;
13. known limitations/evidence gaps;
14. change guardrails, blast radius, and verification checklist;
15. evidence anchors and business capability traceability.

Omit a conditional domain only when truly irrelevant. Never omit constraints, limitations, or change guardrails.

## Zoom by level

- **Workspace/System**: Project/subsystem boundaries, shared contracts/data/integrations, root orchestration, cross-Project dependency direction, compatibility and blast radius.
- **Project**: complete module/build-unit inventory, architectural areas, intra-project direction, Project public surface, build/runtime/data/native/platform behavior, project-wide invariants.
- **Module**: internal responsibilities, key folders/files, exports/entry points, callers/consumers, direct dependencies, state/data/integration ownership, important flows, local extension seams and gotchas.
- **Subsystem roll-up**: component membership, aggregated dependencies, shared constraints and cross-subsystem blast radius.
- **GN target**: normally an inventory row; expand only for a meaningful public/native/runtime boundary.

Do not show all levels in one universal diagram.

## Ownership precision

Separate:

- implementation/orchestration ownership;
- state/data/source-of-truth ownership;
- lifecycle/wiring/registration ownership;
- public API/ABI/schema ownership;
- external delegated behavior.

A declared type does not prove data ownership. A package index does not prove execution. A call across a Project/platform boundary proves only the local handoff unless provider behavior is inspected.

Repository-local `file:`, workspace, source, or native bridge dependencies are owned local boundaries, not external packages.

## Entry points and public surfaces

Inventory and explain:

- abilities, extensions, routes/pages, services, commands, jobs, lifecycle hooks;
- package exports, inner kits, APIs, callbacks, events, schemas, native bridges;
- internal facades/shared symbols and known bypass paths;
- known consumers and compatibility expectations.

Capture signatures/contracts when they matter to change safety. Do not dump every exported symbol; prioritize surfaces with consumers or behavioral significance.

## Runtime, lifecycle, and state flows

Trace representative flows that explain value delivery, initialization, navigation/callbacks, persistence/cache behavior, external/native calls, asynchronous ordering, or notable failure/recovery.

For each flow identify:

- trigger and entry symbol;
- orchestration owner;
- decision/state transitions;
- cross-module/project/platform handoffs;
- data effects and ordering;
- terminal outcome/error;
- relevant concurrency, thread/process, or lifecycle context.

Verify exact constants/branches/effects in defining source/config. A directory tree never proves a runtime flow.

## Data architecture

For each material data domain capture:

- source of truth and owner;
- entities/value objects and important relationships;
- read/write paths and transformations;
- cache/freshness/invalidation;
- transaction/ordering/consistency constraints;
- migrations/schema/versioning;
- privacy/security/retention behavior when evidenced;
- failure/recovery and cross-device/process behavior.

Explain why a new feature must use the existing owner rather than create parallel state.

## Dependencies and integrations

Keep distinct:

- owned module/build unit;
- sibling Project/local workspace package;
- repository-local native component;
- external package;
- platform API/service;
- external system.

List direct dependencies and known consumers. Mention transitive dependencies only when they impose runtime, deployment, security, compatibility, or resource constraints.

In diagrams/tables use one declared direction consistently: `consumer depends on provider` or `provider used by consumer`. Co-location or a demonstration relationship is not a dependency.

## Architectural Constraints and Invariants

This section is mandatory in every Architecture document. Write concrete, evidence-backed guardrails in these categories when applicable:

### Ownership and boundaries

- authoritative owner/source of truth;
- behaviors/data that must not be duplicated elsewhere;
- required boundary/facade/contract crossings.

### Dependency direction

- permitted layer/module/project direction;
- forbidden reverse dependency, bypass, or cycle;
- local versus external boundary rules.

### Lifecycle, state, and concurrency

- initialization order and readiness gates;
- allowed state transitions and mutation owners;
- async ordering, cancellation, thread/process boundaries;
- idempotency/reentrancy requirements when observed.

### Contract and compatibility

- public API/ABI, event, callback, URI, schema, persistence, or serialization guarantees;
- version/device/product/flavor constraints;
- compatibility-sensitive consumers.

### Security and data handling

- permission/authentication/enforcement point;
- access scope, secrets handling, protected/private data boundaries;
- required platform contract behavior.

### Build, native, and resource constraints

- build target/module wiring, generated code, native bridge/ABI, toolchain/platform limitations;
- memory, latency, storage, network, or process limits only when observed.

Each constraint should state **rule**, **reason/effect**, **scope**, and **evidence**. Example:

| ID | Constraint/invariant | Why changes must preserve it | Scope | Evidence |
|---|---|---|---|---|
| ARC-DATA-01 | All weather writes pass through the repository owner. | Preserves cache/database ordering and one source of truth. | data module | `path#symbol` |

Do not write vague rules such as “follow best practices” or invent rationale.

## Extension and Modification Points

Explain:

- where to add a new feature/route/operation/provider;
- which facade/interface/base type/registration point to extend;
- reference implementations and reusable utilities;
- configuration/resource/localization/test files that normally change together;
- seams that appear extensible but are not safe to bypass.

This is As-Is change guidance, not a future design proposal.

## Known Limitations and Evidence Gaps

Separate:

- verified implementation/platform limitations;
- unsupported/partial states or device/product variants;
- coupling, fragile order, broad surface, missing isolation, or incomplete tests;
- external behavior that cannot be inspected;
- local evidence not inspected (must be resolved for major flows before completion).

Never turn absence of inspection into “does not exist.” Absence claims require a complete scoped search.

## Change Guardrails

Every Architecture document ends with an actionable pre-change section:

1. identify owning capability/data/contract;
2. check callers/consumers and cross-boundary blast radius;
3. preserve listed invariants and dependency direction;
4. update all coupled configuration/resources/locales/schemas/build targets;
5. exercise representative happy, error, cancel/offline/permission paths;
6. run evidenced tests/build checks;
7. update affected Business/Architecture traceability and constraints.

Include scope-specific gotchas and tests. Do not invent commands; mark unavailable commands clearly.

## Build, test, CI, and operations

Document only commands/checks evidenced by wrappers, build files, READMEs, test config, and the complete relevant CI workflow set. Prefer repository wrappers. Include native/build-flavor/device constraints. Say “CI not evaluated” when the search was incomplete; do not claim no CI exists.

## Findings and evidence

Classify findings as observed inconsistency, architecture concern, or implementation risk. State impact and evidence without inventing remediation.

End every standalone Architecture document with precise `path#symbol-or-key` evidence. Parent documents link down and retain only cross-boundary evidence.
