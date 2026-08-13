# Module Architecture — <module-name>

## Responsibility
Technical role of this physical module.

## Module Metadata
Relevant `module.json5` facts.

## Internal Structure
Group implementation into ~4–7 meaningful architectural responsibilities.

Group by responsibility, not merely directory shape or component size.

Do not inventory every directory/class.

## Public Surface / Entry Points

### External / Package Surface
Exports actually available to other modules/packages.

If low-level implementation components are exported alongside a higher-level facade, state this explicitly and explain that consumers are not technically restricted to the facade.

### Framework / Application Entry Points
Abilities, routes, services, lifecycle entry points, etc.

### Internal Shared Symbols
Only when important for understanding module wiring.

Do not call an internal singleton a public module API.

## Dependencies

### Inbound
Important dependencies into this module.

### Outbound
Important dependencies from this module.

Use evidence-calibrated wording rather than "strict" or "enforced" unless proven.

## Data and State Ownership
State, models, persisted data, caches or resources owned by the module.

## Key Runtime Flows
Representative Homegraph-backed execution paths important for feature work.

Maximum one diagram.

All Mermaid node and edge labels must be double-quoted.

Do not reproduce the repository-level business process diagram here.

## Module Build/Test Notes
Include only if this module has distinct build/test configuration or commands.

Do not duplicate the full repository developer workflow.

## Existing Patterns
Observed patterns only.

## Module-Local Findings
Include only findings truly local to this module.

If the issue affects repository-level behavior, shared contracts, cache/persistence semantics, runtime/build/test behavior, or shared public surface, promote it to repository findings instead.

Omit when none exist.

## Key Evidence
3–8 important evidence anchors.
