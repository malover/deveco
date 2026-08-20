<!-- PROJECTSPEC:GENERATED:START -->
# Constraints and Limitations — <project>

> Scope: `<project or cross-Project scope>` · Baseline: `<revision>`

## Architecture Constraints and Limitations

### ARC-<stable-id> — <short invariant name>

- **Scope:** `<project | module:<id> | modules:<a,b> | contract:<name>`
- **Constraint / invariant:** <exact evidence-backed rule>
- **Basis:** `<Enforced | Declared policy | Observed pattern | Inferred guardrail>`
- **Implementation impact / blast radius:** <concrete consumers and effect>
- **Evidence:** `<path#symbol-or-descriptor>`
- **How to work with it:** <implementation guidance>
- **When it applies:** <recognizable change condition>
- **What to check:**
  1. <inspect exact owner/contract>
  2. <verify affected state/data/dependency/test behavior>

### LIM-<stable-id> — <verified limitation or evidence gap>

- **Scope:** `<project | module:<id> | boundary:<name>`
- **Category:** `<tooling | evidence gap | external boundary | runtime limitation>`
- **Limitation / evidence gap:** <exact verified fact; never speculation>
- **Implementation impact / blast radius:** <concrete consequence>
- **Evidence / boundary:** `<path#symbol-or-external contract>`
- **Current handling / unknown:** <current behavior or bounded unknown>
- **How to work with it:** <safe handling>
- **When it applies:** <recognizable condition>
- **What to check:**
  1. <inspect the boundary or evidence>
  2. <record any newly resolved fact>

Do not add a `CHK-*` namespace or a separate Change Checks table. Each entry owns its own handling and checks.
<!-- PROJECTSPEC:GENERATED:END -->

## Developer-maintained additions / overrides

<preserve content outside markers>
