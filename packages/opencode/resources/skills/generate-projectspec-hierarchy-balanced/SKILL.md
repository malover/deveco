---
name: generate-projectspec-hierarchy-balanced
description: Generate module-first As-Is Project Business, Architecture, and self-contained ARC/LIM governance documentation for mixed repositories. Use for a balanced deep scan that retains document-project LLM+CSV discovery, requires repository-wide HomeGraph readiness, and creates an index/router without legacy document sprawl.
---

# Generate ProjectSpec Hierarchy Balanced

Use this skill when a repository needs implementation-ready documentation between the
old `document-project` scan and the larger hierarchy skills. This is a new,
independent contract; it does not modify or replace `generate-projectspec-hierarchy-v7`,
`document-project`, or `combined-doc-generation`.

## Contract

- Generate As-Is **Business**, **Architecture**, and **Constraints/Limitations** only.
- Work module-first: freeze physical Projects and build modules before semantic grouping.
- Every physical module/build unit receives Architecture. Module Business is optional and
  evidence-gated as `behavior-owner` or substantial `supporting-behavior`; grouped behavior
  belongs in Project Business. Pure DTO/resource/build modules remain Architecture-only.
- Every Project receives Business, Architecture, and one governance registry. In a
  multi-Project workspace, root governance is cross-Project-only; do not invent a
  repository-wide Business or Architecture document.
- Keep old `document-project` Deep Scan discovery as internal metadata: LLM-primary
  classification, CSV archetype safety net, OR-merged requirements, conditional API/data/
  state/UI/UX/localization/test/deployment/assets/security/async scans, and source-tree /
  entry / integration / reference findings. These findings do not create legacy standalone
  output files.
- `deep` is the default scan level; `quick`, `deep`, `exhaustive`, and explicit adaptive depth
  selection are available.
- HomeGraph is mandatory and repository-wide. Readiness is serial:
  `homegraph_status` -> `homegraph_files` -> anchored `homegraph_explore`. Initialize or
  synchronize stale indexes, attempt one bounded recovery, then explicitly ask whether to
  retry, approve reduced-confidence direct scanning, or stop. Never silently fall back.
- `docs/index.md` is the final concise router and repository overview. It includes scan,
  revision, HomeGraph, Project/module, technology, and cross-Project metadata, with links.
- Architecture includes ownership, dependency direction, lifecycle/state/data scopes,
  runtime/data flows, contracts, extension seams, blast radius, a compact scope matrix,
  and selective Mermaid diagrams. Use a small verified `classDiagram` only for an
  architectural question, never as a class dump.
- Governance uses stable `ARC-*` and `LIM-*` entries only. There is no `CHK-*` namespace
  and no Change Checks table. Each entry is self-contained with inline how-to-work and
  numbered what-to-check fields.
- Every generated Markdown document has exactly one `PROJECTSPEC:GENERATED` region;
  preserve developer content outside it. Metadata must not contain secrets, tokens,
  signing material, personal data, or raw graph dumps.

## Invocation modes

Set `invocation_mode` to `manual` unless the caller supplies `goal-step0`.

- Manual mode starts with a concise question turn before any repository read, bootstrap, or
  HomeGraph call. Ask only unresolved root/revision/output, scan level (default `deep`),
  classification/documentation guidance, and resume/fresh choices; do not repeat caller facts.
- Goal-step0 consumes the caller's approved root/revision/scan level and existing Project
  SPEC context without routine questions, but still performs mandatory HomeGraph readiness
  and the balanced output contract.
- Do not narrate repeated planning or restate this contract after tool results. Keep phase
  updates to compact facts, gaps, and the next deterministic action.

## Progressive loading

Manual mode must stop after this file and ask its unresolved questions; do not load `workflow.md`,
references, templates, repository files, or HomeGraph before the answer. After the answer, or
immediately for `goal-step0`, load only the phase material needed for the next action:

1. Read `workflow.md`.
2. Before graph work read `references/homegraph.md`.
3. Before packet work read `references/evidence-plan.md`.
4. Before document writing read `references/document-writing.md`.
5. Before update/finish read `references/update-and-validation.md`.
6. Load exactly one matching template immediately before writing it. Older focused references
   remain compatibility material; do not load them as a batch.

## Deterministic startup

After the initial manual question turn, the first repository analysis action is:

```bash
node <skill-dir>/scripts/bootstrap_projectspec.mjs <repository-root> --output-root docs --revision HEAD --scan-level deep
```

It atomically writes `docs/.projectspec/workspace-inventory.json`,
`docs/.projectspec/documentation-plan.json`, and the compact
`docs/.projectspec/evidence-plan.json`. The plan is structural and provisional until build
ownership and repository-wide HomeGraph evidence freeze boundaries.

## Resumable state

Maintain `docs/.projectspec/project-scan-report.json` with mode, scan level, repository and
HomeGraph revisions, completed steps, cached LLM analysis, merged CSV baseline, current step,
outputs, missing outputs, validation status, HomeGraph coverage ledger, fallback approval, and
changed modules/impacted ancestors. Reuse a valid checkpoint for the same revision and
boundary; reanalyze only changed modules and impacted ancestors. Never store full source or
graph responses in it.

## Packet-first handoff

Evidence collection ends at a validated packet. Run `scripts/validate_packet.py` before any
Markdown write; it checks identity, enums, evidence anchors, redaction, and raw-payload
absence. Run `scripts/render_documents.py` before narrative writing to create missing canonical
generated regions and links; it preserves existing generated regions unless replacement is
explicitly requested.
Document writing must not start a second repository-wide discovery pass. Re-query only for a
recorded packet gap.

## Completion gate

Finish only when all physical modules have Architecture, Business role/detail is resolved,
grouped behavior appears in Project Business, Project/root required documents exist,
analysis packets are complete, governance entries validate as self-contained ARC/LIM,
Architecture has no copied governance sections, diagrams/links/markers validate, and the
index is built last. Mechanical validation does not replace semantic review.
