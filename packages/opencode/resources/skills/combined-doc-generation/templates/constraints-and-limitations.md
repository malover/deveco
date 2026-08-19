<!-- PROJECTSPEC:GENERATED:START -->
# Constraints and Limitations — <project>

> Scope: `<project path>`  
> Baseline: `<revision>`  
> Architecture: [Project Architecture](architecture.md)

This file is the Project's compact architectural contract. Module-specific rules stay here with module scope; do not create module constraint files.

## Architecture Constraints

### ARC-001 — <short rule name>

- **Scope:** `project | module:<id> | modules:<a,b> | contract:<name>`
- **Constraint:** <concise evidence-backed invariant/rule>
- **Basis:** `Enforced | Declared policy | Observed pattern | Inferred guardrail`
- **Implementation impact:** <why a feature agent must care / blast radius>
- **Evidence:** `<path#symbol-or-descriptor>`
- **Verification:** <specific inspection/build/test check>

Repeat only for high-value constraints. Delete the example and renumber/reuse stable IDs appropriately.

## Change Checks

### CHK-001 — <change type>

- **Scope:** `project | module:<id> | modules:<a,b>`
- **Applies when:** <recognizable feature/change condition>
- **Check:**
  1. <specific inspection>
  2. <specific dependency/state/schema/test verification>
- **Related:** `ARC-...` / `LIM-...` when applicable
- **Evidence:** `<anchor for why this check matters>`

## Known Limitations

### LIM-001 — <exact limitation or evidence gap>

- **Scope:** `project | module:<id> | boundary:<name>`
- **Limitation / gap:** <verified fact or exact unavailable evidence>
- **Implementation impact:** <concrete consequence for future changes>
- **Evidence:** `<path#symbol/contract>` or exact external boundary
- **Current handling / unknown:** <what the repository currently does or what cannot be concluded>

Omit this section entirely when no implementation-relevant limitation/evidence gap is supported.
<!-- PROJECTSPEC:GENERATED:END -->

## Developer-maintained additions / overrides

Add project-specific architectural rules or corrections here. Future iterative generation must preserve this section and other content outside the generated markers. If generated evidence conflicts with a manual rule, report the conflict rather than silently deleting the manual rule.
