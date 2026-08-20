# Self-contained ARC/LIM governance

Create one `constraints-and-limitations.md` per Project. Root governance in multi-Project
mode contains only rules whose blast radius crosses Projects. Module rules are scoped entries
in the owning Project registry; do not create governance files per module.

Use stable unique `ARC-*` and `LIM-*` IDs. Do not use `CHK-*` and do not create a Change
Checks table. Deduplicate repeated statements and calibrate certainty to evidence.

Each ARC entry contains:

- **Scope**
- **Constraint / invariant**
- **Basis** (`Enforced`, `Declared policy`, `Observed pattern`, or `Inferred guardrail`)
- **Implementation impact / blast radius**
- **Evidence** (exact path, symbol, descriptor, or contract)
- **How to work with it**
- **When it applies**
- **What to check** — an inline numbered procedure

Each LIM entry contains Scope, Category, exact verified limitation/evidence gap,
Implementation impact, exact Evidence/boundary, Current handling/unknown, How to work with
it, When it applies, and an inline numbered What to check procedure whenever meaningful.
Architecture and Business link IDs but never copy their registry prose.
