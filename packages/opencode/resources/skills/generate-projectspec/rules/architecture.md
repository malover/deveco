# Architecture Documentation Rules

## Architecture purpose

Architecture docs explain how the observed system is structured and how important behavior executes. Prefer responsibilities, boundaries, ownership, relationships, data flows, integrations, and runtime paths over inventories of files/classes.

## System context and component architecture

At repository level make the overall shape immediately understandable:
- physical modules,
- linked repositories/packages,
- external systems,
- major responsibilities,
- major dependency direction,
- key runtime/data flows.

At module level group implementation into roughly 4–7 architectural responsibilities rather than directory listings.

## Data architecture

Document, when evidenced:
- important domain/data models at architectural level,
- state/data ownership,
- sources of truth,
- persistence/storage boundaries,
- caches and freshness semantics,
- transformations/mappers at boundary level,
- major data flows across modules,
- external data sources.

Do not turn this into a field-by-field schema or class inventory.

Distinguish implementation ownership, state/data ownership, lifecycle/wiring ownership, and registration/global-reference ownership.

Do not say a module "owns" an object/reference merely because its type or implementation is defined there.

## Integration architecture

Document, when evidenced:
- external services/APIs,
- platform APIs,
- SDK/package boundaries,
- IPC/service boundaries,
- sync/async interaction where architecturally meaningful,
- communication protocols/contracts where relevant,
- module responsible for each integration,
- call/dependency direction.

Keep physical modules, linked repositories, workspace/local packages, external packages, and external systems distinct.

## Dependencies

Module dependency sections primarily describe direct dependencies.

Do not list a dependency under a module merely because a downstream dependency uses it.
Mention transitive dependencies only when they impose a meaningful runtime, deployment, security, or integration constraint; label them explicitly as transitive.

## Public surface

Distinguish:

### External / Package Surface
Actual exports consumable by other modules/packages.

### Framework / Application Entry Points
Abilities, routes, lifecycle entry points, services, framework hooks.

### Internal Shared Symbols
Shared internal instances/functions important for wiring but not public APIs.

If low-level implementation components are publicly exported alongside a facade, state that consumers are technically able to bypass the facade.

## Runtime flows

Use Homegraph-backed execution paths for architecturally significant processes.
Runtime flows may include cache/DB/API branches and implementation mechanisms that business diagrams intentionally omit.

## Observed architecture principles and constraints

Describe recurring structural patterns only when demonstrated by current evidence, for example:
- observed dependency direction,
- repository/facade boundaries,
- where state is currently owned,
- how integrations are currently accessed,
- current UI/application/data responsibility split.

Label them as **observed patterns/constraints**, not approved or enforced rules.

Do not say "strict", "enforced", "guaranteed", or "cannot bypass" unless explicit enforcement is evidenced.

Prefer:
- "Observed dependency direction is..."
- "Current implementation routes..."
- "Homegraph shows..."
- "Existing code follows..."

## Security and quality posture

When evidence exists, summarize the current posture rather than inventing target NFRs.

Relevant evidence may include:
- authentication/authorization mechanisms,
- transport/security APIs,
- secrets/config handling,
- logging/observability,
- error handling/fault behavior,
- coupling/maintainability signals,
- testability and actual tests,
- CI checks and gaps.

Do not invent SLAs, RTO/RPO, threat models, compliance obligations, performance targets, or corporate standards.

## Technology stack

Document major languages, frameworks, databases, platforms, and tools that materially help a coding agent understand implementation.
Do not invent justification for technology choices unless rationale is explicitly documented.

## Test and CI posture

Describe what is currently configured and validated, not a hypothetical test strategy.
Exact developer workflow extraction is governed by `developer-workflow.md`.

## Analysis boundary

When implementation is outside the analyzed repository boundary, describe delegation/contracts rather than unavailable internals.

## Direct-to-file generation

Once the current architecture document has sufficient evidence, write it directly.

Do not first reproduce the intended final document as:
- a long prose outline,
- a section-by-section draft in reasoning,
- an exhaustive evidence-anchor inventory.

Use reasoning only for unresolved decisions and concise structure checks.

## Cross-level deduplication

Use a **lowest useful level, summarize upward** rule.

Module architecture documents own:
- implementation-level module responsibilities,
- internal layers/components,
- module-local runtime flow detail,
- module-local data ownership,
- module-local dependencies/integrations,
- exact evidence anchors,
- module-local findings.

High-level architecture owns:
- repository/system context,
- physical module map,
- cross-module relationships,
- repository-wide data/integration architecture,
- repository-wide patterns/constraints,
- promoted findings,
- build/test/CI/deployment posture.

Do not repeat module implementation details in high-level architecture unless they are necessary to explain:
- a cross-module flow,
- repository-wide ownership,
- a promoted risk/finding,
- an architectural constraint or decision.

When a high-level statement depends on module detail, summarize the implication and point to the responsible module rather than replaying the full implementation path.

Prefer one precise evidence anchor at the lowest owning level over repeating the same anchor in multiple documents.
