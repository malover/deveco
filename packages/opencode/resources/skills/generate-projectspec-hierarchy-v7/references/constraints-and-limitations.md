# Constraints and Limitations Documentation

## Purpose and scope

Keep architectural governance separate from descriptive Architecture documents.

- In single-project mode, `docs/constraints-and-limitations.md` owns Project and module-scoped governance.
- In multi-project mode, root `docs/constraints-and-limitations.md` contains only cross-Project rules; every Project has its own registry containing Project and module-scoped entries.
- Do not create one file per module. Use the `Scope` field and an applicability matrix. Split only when a registry becomes genuinely unusable, then keep the Project file authoritative and link appendices.

Architecture documents link to the applicable registry but do not repeat constraints, limitations, or change checks.

## Constraint model

Every constraint has a stable `ARC-*` ID and:

| Field | Requirement |
|---|---|
| Scope | workspace, Project, module/build unit, contract, data domain, or native boundary |
| Rule | concrete condition that a design or implementation can satisfy or violate |
| Basis | `Enforced`, `Declared policy`, `Observed pattern`, or `Inferred guardrail` |
| Why/impact | consequence and blast radius, not invented historical rationale |
| Evidence | exact build/config/source/test anchor |
| Verification | evidenced automated check or precise manual inspection; never invent a command |

Use universal wording (`must`, `only`, `never`) only for enforced/declared rules or exhaustive evidence. Phrase dominant behavior as an observed pattern. A proposed safeguard without authority is an inferred guardrail, not an As-Is invariant.

## Limitation model

Every limitation has a stable `LIM-*` ID and distinguishes:

- verified implementation/platform limitation;
- fragile coupling or broad blast radius;
- incomplete/unsupported variant or state;
- incomplete test/CI/build coverage;
- external evidence unavailable;
- local evidence not inspected.

Record scope, category, current impact, evidence, current handling/workaround when observed, and the exact unknown. Do not turn missing inspection into a product limitation or invent remediation/roadmap.

## Change checks

Use stable `CHK-*` IDs for actionable pre-change or verification checks. Each check states scope, when it applies, what to inspect/run, and evidence for the check. Link checks to `ARC-*`/`LIM-*` IDs instead of repeating their prose.

## Extraction and deduplication

During each Project pass:

1. Derive candidate rules/limitations/checks from the same source analysis used for Architecture.
2. Place each fact at the narrowest scope whose consumers/blast radius it affects.
3. Deduplicate repeated module/project/workspace statements; retain one authoritative ID and use the applicability matrix.
4. Promote to the workspace registry only when at least two Projects are affected.
5. Link Architecture owners and affected capabilities without copying governance prose back into them.

The generated documentation supplied with this skill showed why the richer schema is required: prior sections usually had useful rules but lacked basis/strength, executable or manual verification, stable limitation IDs, and module applicability. The registry must add those fields rather than merely concatenate old sections.

## Developer-maintained content

Preserve all content outside ProjectSpec generated markers. Treat explicit developer constraints as authoritative unless contradicted by enforced repository configuration; report the conflict rather than silently deleting or rewriting the manual rule. Generated entries may be updated from evidence, but stable IDs should remain stable when meaning and scope are unchanged.

## Architecture-check consumption

For a requirement, plan, task, or code change, resolve the applicable set in this order:

1. workspace entries, when multi-project;
2. owning Project entries;
3. entries scoped to affected modules/contracts/data/native boundaries.

Record applicable `ARC-*`, relevant `LIM-*`, and required `CHK-*` IDs in the plan/task. Reuse the same resolved set for pre-code and post-code architecture checks.
