# Module Architecture — <module-name>

## Responsibility
Technical role of this physical module.

## Module Metadata
Relevant `module.json5` facts.

## Internal Structure
Group implementation into ~4–7 meaningful architectural areas.

Do not inventory every directory/class.

## Public Surface / Entry Points

### External / Package Surface
Exports actually available to other modules/packages.

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

## Data and State Ownership
State, models, persisted data, caches or resources owned by the module.

## Key Runtime Flows
Representative Homegraph-backed execution paths important for feature work.

Maximum one diagram.

All Mermaid node and edge labels must be double-quoted.

## Existing Patterns
Observed patterns only.

## Module-Local Findings
Include only issues truly local to this module and not already present in repository findings.

If a relevant finding is cross-cutting, do not duplicate it; optionally write:
`See high-level-architecture.md → Repository Findings.`

Omit when none exist.

## Key Evidence
3–8 important evidence anchors.
