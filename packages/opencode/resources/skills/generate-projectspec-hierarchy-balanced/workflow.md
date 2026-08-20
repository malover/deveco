# Balanced generation workflow

## 0. Manual startup and bootstrap

For manual mode ask the unresolved root/revision/output, scan-level, classification/documentation,
and resume/fresh questions first. Do not read references, inspect files, invoke HomeGraph, or
run bootstrap before that turn. For `goal-step0`, consume approved caller facts without routine
questions. Do not repeat narration or emit verbose TODO payloads.

Run `scripts/bootstrap_projectspec.mjs` before semantic analysis. Read the inventory, plan, and
compact evidence plan. Verify ancestor build ownership, nested modules, local dependencies,
stable IDs, adaptive depth, and Project boundaries once, then freeze them.

## 1. Retain the old Deep Scan as metadata

Run a bounded analysis phase, not an output-document phase:

1. Ask the LLM for repository/Project type, technologies, architecture patterns, source-tree,
   entry points, integrations, references, and conditional scan requirements.
2. Look up `documentation-requirements.csv` by archetype. OR-merge CSV baseline flags with
   LLM flags, retaining custom LLM scans and each finding's provenance.
3. Apply the conditional matrix for API contracts, data/domain models, state management, UI,
   UX/navigation, localization/resources, tests, build/deployment/CI, assets,
   security/permissions, and async/event behavior.
4. Record findings as `observed`, `declared`, `inferred`, `unavailable`, `not inspected`,
   `llm-only`, or `csv-baseline-only`. Fold them into Business/Architecture packets; never
   create old standalone UX, screen tree, model, API, deployment, or test-strategy files.
5. Persist checkpoint state to `.projectspec/project-scan-report.json` and resume only from
   a validated checkpoint.

## 2. Establish repository-wide HomeGraph

Use one index for cross-Project consumers and shared patterns. Check for `.homegraph/`;
run `homegraph init -i <repository-root>` when absent, and use the installed supported
synchronization command when stale. Prove readiness serially with:

```text
`homegraph_status` -> `homegraph_files` -> anchored `homegraph_explore`
```

The anchor must be a real descriptor, module path, ability, page, route, entry symbol, or
other indexed path. On failure make one bounded recovery/reindex attempt and probe again.
If still unhealthy, explicitly ask: retry, approve reduced-confidence direct scanning, or
stop. Record the decision in the coverage ledger; no silent source-only fallback and no
CodeToGraph fallback.

Use one bounded explore-first query per significant module/flow, then exact
`homegraph_node`, callers, callees, or impact only for named packet gaps. Keep queries serial,
scoped, and release detailed source context after the packet is recorded.

## 3. Module-first packets and documents

For every physical module/build unit, choose `focused`, `standard`, or `deep` from the global
scan level plus deterministic significance; an explicit adaptive scan selects those depths
without changing the `deep` default. Perform an ownership/runtime pass before writing:
responsibilities and non-responsibilities, entry/public/lifecycle surfaces, dependencies and
consumers, representative trigger-to-effect flow, state/data, integrations, tests, and an
initial Business role. Deep modules receive a distinct enrichment/reference pass covering
UI/state/navigation, domain/data lifecycle, persistence/cache/invalidation, failure/recovery,
related implementations, tests, coupled artifacts, and blast radius.

Write a compact `.projectspec/analysis/<project>.json` packet before publishing the module and
run `scripts/validate_packet.py` before consuming it. Then run `scripts/render_documents.py` once
to create missing canonical scaffolds before the model fills narrative slots. It must contain responsibility,
role/detail/rationale, analysis depth and passes, entry surfaces, dependencies/consumers,
flows, conditional topics, state/data owners, integrations, reference patterns, scope matrix,
diagram decisions, ARC/LIM candidates, evidence, unknowns, and completeness. Then write module
Architecture immediately. Write standalone module Business only for `behavior-owner` or
substantial independent `supporting-behavior`; otherwise record grouped behavior or
`architecture-only`.

## 4. Synthesize Projects

After all module packets and documents exist, write each Project Business (UI-first; or a
caller/system/API/data journey for no-UI behavior), Project Architecture (compositional
ownership/dependency/runtime map), and one Project governance registry. A rare distributed
capability Business document is allowed only when no Project/module owner avoids duplication.
In multi-Project workspaces, also write the root governance registry with only genuinely
cross-Project rules.

## 5. Index and validate last (deterministic rendering)

Run `scripts/render_documents.py` only for missing documents or with an explicit replacement
decision; it must preserve existing generated narrative by default. Then run
`scripts/build_index.py` from inventory, plan, repository scan metadata, and the same validated
packets. The index must include repository overview, baseline/revision/scan/HomeGraph facts,
Project table, module table with role/responsibility/entries and Architecture/Business or
grouped links, cross-Project relationships, and a Start here router. It must not contain raw
graph output or full journeys.

Run `scripts/validate_docs.py` with inventory, plan, scan report, and packets. Perform one
targeted repair cycle, then validate again. Check inventory/plan agreement, module Architecture
coverage, role/detail gates, grouped Business, required docs, ARC/LIM fields and unique IDs,
no CHK/Change Checks, architecture governance separation, evidence anchors, local links,
generated markers, and supported Mermaid including selective class diagrams.

## Incremental updates

Rerun deterministic bootstrap for the selected revision, compare frozen boundaries and
checkpoints, reuse valid state, reanalyze changed modules and impacted ancestors, regenerate
only generated regions, rebuild the index last, and preserve all manual content outside markers.
