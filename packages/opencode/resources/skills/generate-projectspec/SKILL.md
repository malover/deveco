---
name: generate-projectspec
description: Generate compact, evidence-backed As-Is architecture and business knowledge for an existing repository using Homegraph-first discovery and module-first synthesis.
---

# generate-projectspec

Generate exactly:

```text
docs/
├── high-level-architecture.md
├── high-level-business.md
└── modules/
    └── <physical-module>/
        ├── architecture.md
        └── business.md
```

Do not generate auxiliary user-facing documentation files.

The generated knowledge base is descriptive and diagnostic. It documents the current observed system. It does not invent future-state requirements, ADRs, architecture enforcement rules, KPIs, stakeholders, rollout plans, or other project intent that is not evidenced.

Follow `workflow.md`.
Use the rules under `rules/` as the authoritative source for semantics.
Use the templates under `templates/` only for output structure.

Core requirements:
- Treat `rules/homegraph.md` as a hard execution gate: initialize/sync Homegraph, prove the graph is queryable, then perform graph-first implementation analysis. Do not silently fall back to broad source scanning.
- Treat implementation source reads as a sparse audit, not a second discovery pass. Enforce the Verification Queue, source-read budgets, and stop conditions from `rules/homegraph.md`.
- Generate module documentation before repository-level synthesis.
- Reconcile declared documentation, Homegraph, and source/config evidence.
- Treat tracked content at the selected repository revision as the documentation baseline unless the user explicitly asks to document current uncommitted working-tree state.
- Preserve analysis boundaries: physical modules, linked repositories/submodules, local/workspace packages, external packages, and external systems are distinct.
- Business docs describe As-Is behavior and outcomes; architecture docs describe implementation structure and runtime mechanics.
- Cross-cutting findings appear once in `docs/high-level-architecture.md`.

## Loading discipline

Start with `workflow.md` only.

Load rule and template files only when `workflow.md` explicitly requires them for the current phase/document. Do not preload all rules, templates, or `README.md`.

## Atomic performance constraints

- Do not enumerate implementation source trees while Homegraph is usable.
- Every implementation source read requires a concrete unresolved semantic question.
- Use the first-pass source-read ceilings from `rules/homegraph.md`.
- Never load more than one document template at a time.
- Do not list the skill directory or preload rules/templates.
- Inspect tests/CI only when writing the corresponding architecture section.

## v3 scalability constraints

- Global discovery is shallow: identify modules and the cross-module skeleton only.
- Detailed Homegraph exploration happens just-in-time per module.
- Do not analyze future modules before the current module docs are written.
- Correctness overrides source-read budgets for exact behavioral claims.
- Write each document directly once evidence is sufficient; do not duplicate it as a full prose draft in reasoning first.
- Defer repository-wide CI/test inspection until high-level architecture synthesis.

## v4 precision and compactness constraints

- For Git repositories, document the selected revision, not uncommitted working-tree state.
- Use revision-backed tracked content before claiming CI/configuration is absent.
- Apply "lowest useful level, summarize upward" to reduce cross-document duplication.
- Preserve end-to-end behavioral verification and precise evidence anchors.
- Maintain Graph Analysis Plan and Promoted Findings List incrementally.
- Keep routine execution silent; avoid repetitive user-facing "Let me..." narration.
- Search/read targeted README sections before reading large repository documents in full.
