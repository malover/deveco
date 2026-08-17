> Atomic direct-write rule: this is the only active document template. Once evidence is sufficient, write the file directly; do not create a near-final prose draft elsewhere first.

> Ownership: keep detailed module-owned behavior/evidence here so repository-level documents can summarize it rather than duplicate it.

# Module Architecture — <module-name>

## Responsibility
Technical role of this physical module and its contribution to repository architecture.

## Module Metadata
Relevant module/build metadata. Support Stage and legacy FA project forms.

## Internal Structure
Group implementation into roughly 4–7 meaningful architectural responsibilities.
Do not inventory every directory/class.

## Public Surface / Entry Points

### External / Package Surface
Actual exports available to consumers.

### Framework / Application Entry Points
Abilities, routes, lifecycle/services/framework hooks.

### Internal Shared Symbols
Only when important for module wiring.

## Dependencies

### Inbound
Important direct dependencies into the module.

### Outbound
Important direct dependencies from the module.
Mention transitive dependencies only when materially constraining and label them explicitly.

## Data Architecture / State Ownership
Module-owned state/data, persistence, caches, models at architectural level, transformations, and source-of-truth responsibilities.
Distinguish implementation, state/data, lifecycle/wiring, and registration/global-reference ownership.

## Integrations
External services, platform APIs, SDK/package/linked-repository boundaries used by this module and the observed interaction direction.

## Key Runtime Flows
Representative Homegraph-backed execution paths important for feature work.
Maximum one diagram.

## Observed Patterns and Constraints
Observed module-level architectural patterns only; do not imply enforcement without evidence.

## Security / Quality Notes
Only evidence-backed module-specific posture that adds value beyond repository-level summary.

## Module Build/Test Notes
Only if distinct from repository workflow.

## Module-Local Findings
Only findings truly local to this module. Omit when none exist.

## Key Evidence
3–8 important evidence anchors.