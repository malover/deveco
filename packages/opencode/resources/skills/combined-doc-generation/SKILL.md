---
name: combined-doc-generation
description: Generate substantial, evidence-backed As-Is Business, Architecture, and architectural governance documentation for ArkTS, DevEco, OpenHarmony, and mixed repositories. Use repository-wide HomeGraph, deterministic Project/module discovery, just-in-time deep module analysis, Project synthesis, and drift-prevention constraints/change checks.
---

# Combined Documentation Generation

Generate documentation that is useful during feature implementation, not merely a repository map.

- **Business** explains product/domain behavior, UX/system journeys, states, decisions, data, failures, and observable outcomes.
- **Architecture** explains ownership, dependency direction, runtime/data/state flow, extension seams, and concrete implementation patterns an agent should follow.
- **Constraints and limitations** are the developer-maintained architectural contract for drift prevention: scoped `ARC-*` invariants, `CHK-*` change checks, and evidence-backed `LIM-*` gaps.
- **Index** is a concise repository access map synthesized from `.projectspec` analysis JSON plus the generated Project/module documents.

Generate **As-Is** documentation. Do not invent requirements, target architecture, roadmap, rationale, KPIs, SLAs, or speculative limitations.

## Non-negotiable invariants

1. Run deterministic bootstrap first. It creates `docs/.projectspec/workspace-inventory.json` and `documentation-plan.json` before semantic analysis.
2. Use **one repository-wide HomeGraph**. HomeGraph is mandatory in V1. Initialize/synchronize it and prove it queryable before semantic generation.
3. A failed/oversized HomeGraph query is recoverable: narrow, split, reduce limits/depth, use precise anchors, and retry. Do not silently downgrade to source-only analysis.
4. Deterministic discovery proposes Project/module boundaries. HomeGraph verifies/corrects only evidenced problems; the model does not rebuild the repository tree from scratch.
5. Repository discovery is structural, **not the semantic analysis for all later documents**. Before writing each module, perform a fresh just-in-time deep-analysis pass for that module.
6. Scale module analysis depth by architectural importance. Behavior owners, entry/orchestration modules, state/data foundations, native/integration boundaries, and graph hotspots normally receive deep analysis; tiny technical helpers may receive focused analysis.
7. Important/deep modules require at least two bounded HomeGraph passes: an ownership/runtime pass and a targeted enrichment pass covering related/reference implementations plus unresolved state/data/lifecycle/failure questions.
8. Do not write a module document until its compact `.projectspec/analysis/<project>.json` packet satisfies the module analysis-completion contract.
9. Every physical module/build unit gets `architecture.md`. Generate module `business.md` only when UX/domain discovery justifies `behavior-owner` or substantial standalone `supporting-behavior`.
10. Every Project always gets `architecture.md`, `business.md`, and `constraints-and-limitations.md`. Project Business absorbs meaningful behavior from modules that do not justify standalone Business docs.
11. Keep Architecture useful but compact: mandatory core plus conditional sections when analysis finds implementation-impacting state/data/persistence/UI/integration/concurrency/testing facts. Do not suppress a useful section merely because its content could be compressed into another paragraph.
12. Architecture-drift prevention is distributed: module Architecture contains a few high-value extension/ownership/dependency facts; Project governance owns durable rules, forbidden directions, change checks, and limitations.
13. Actively search for repository reference implementations/patterns. Important modules should normally expose a few concrete patterns to follow rather than generic advice.
14. Use Mermaid selectively but readily for complex module/project structure, runtime/state flows, and business journeys. Quote all human-readable node, edge, decision, and subgraph labels. Validate and repair broken Mermaid.
15. Evidence density scales with complexity. Important modules normally need several connected anchors, not a token three-file footer; publish only high-value anchors rather than exhaustive file inventories.
16. Write `docs/index.md` last from the semantic analysis JSON and plan, then validate that it links every Project document and standalone module document.
17. Run one targeted repair cycle for concrete validation misses, then validate once more and stop.
18. Preserve developer content outside generated markers. Full iterative update behavior is intentionally limited in V1.

## Deterministic startup

Run as the first repository analysis action:

```bash
node <skill-dir>/scripts/bootstrap_projectspec.mjs <repository-root> --output-root docs --revision <revision>
```

Use `bun` only if Node is unavailable. The bootstrap is dependency-free and metadata-first. It writes:

- `docs/.projectspec/workspace-inventory.json` — candidate Projects/modules, descriptors, declared surfaces, source-count/significance signals, and resolvable dependency hints.
- `docs/.projectspec/documentation-plan.json` — Project/module document paths, semantic-role placeholders, analysis depth hints, analysis JSON paths, and enrichment requirements.

Do not ask the model to reconstruct these artifacts from scratch.

After repository-wide HomeGraph verification, write:

- `docs/.projectspec/repository-intelligence.json` — corrected Project boundaries, Project types/technology, key entry anchors, cross-Project relationships, and boundary corrections.
- `docs/.projectspec/analysis/<project>.json` — compact reusable Project/module deep-analysis packets used to write docs and build the index.

## Output layout

Always create a repository index at `docs/index.md`.

For one Project, keep Project docs directly under `docs/`:

```text
docs/
├── index.md
├── architecture.md
├── business.md
├── constraints-and-limitations.md
└── modules/
    └── <module>/
        ├── architecture.md
        └── business.md                 # only when justified
```

For multiple Projects:

```text
docs/
├── index.md
├── <project-a>/
│   ├── architecture.md
│   ├── business.md
│   ├── constraints-and-limitations.md
│   └── modules/<module>/{architecture,business}.md
└── <project-b>/
    └── ...
```

Do **not** create an artificial repository-wide Business/Architecture layer for multi-Project repositories. A rare distributed capability Business file remains an escape hatch only when Project Business would otherwise become materially worse.

## Progressive loading

1. Read [workflow.md](workflow.md).
2. During boundary verification read [references/hierarchy.md](references/hierarchy.md).
3. Before graph work read [references/homegraph.md](references/homegraph.md).
4. Before per-module analysis read [references/deep-analysis.md](references/deep-analysis.md).
5. For large runs read [references/evidence-and-performance.md](references/evidence-and-performance.md).
6. Before role/detail decisions read [references/document-model.md](references/document-model.md).
7. Before Business writing read [references/business.md](references/business.md).
8. Before Architecture writing read [references/architecture.md](references/architecture.md).
9. Before governance synthesis read [references/constraints-and-limitations.md](references/constraints-and-limitations.md).
10. Read [references/diagrams.md](references/diagrams.md) when generating a diagram.
11. Load exactly one matching template immediately before writing its document.
12. Before completion read [references/update-and-validation.md](references/update-and-validation.md).

Never preload every reference/template into context.

## Evidence and HomeGraph policy

- Use repository root as `projectPath` for every HomeGraph MCP call.
- Read manifests/build/package descriptors for physical hierarchy; use HomeGraph/source evidence for semantic behavior.
- Use `homegraph_status` -> `homegraph_files` -> anchored `homegraph_explore` to establish readiness.
- Retry query failures by narrowing path/symbol/question, splitting concerns, reducing result limits/depth, or moving from broad explore to node/callers/callees. If the graph/index itself is unhealthy, recover/reindex and probe again.
- For each module, perform analysis **immediately before its docs are written**. Do not rely on a repository overview written many modules earlier.
- Deep modules get a second targeted pass even if the first pass appears plausible. Search outside the module for analogous implementations/shared bases and resolve state/data/lifecycle/failure gaps.
- Read exact source/config only for named unresolved questions such as constants, branch semantics, permissions, persistence behavior, native/platform contracts, or test expectations.
- Never copy secrets, signing material, tokens, personal data, or raw HomeGraph response dumps into docs/analysis metadata.

## Completion contract

Finish only when:

- deterministic metadata exists and hierarchy is HomeGraph-verified;
- repository intelligence exists;
- every Project has an analysis JSON and every planned module has a completed analysis packet;
- deep modules record at least two bounded analysis passes and a reference-pattern search outcome;
- every Project/module Architecture path is generated;
- Business role/detail is resolved for every module; standalone Business exists only where justified and grouped behavior appears in Project Business;
- implementation-impacting conditional Architecture topics discovered in analysis are represented in the document rather than silently compressed away;
- important flows include meaningful states/branches/failures where evidenced, not just happy paths;
- Project governance contains high-value scoped `ARC-*`/`CHK-*` and evidence-only `LIM-*` entries, including module-scoped invariants discovered during deep analysis;
- Mermaid blocks pass conservative syntax checks;
- `docs/index.md` is rebuilt from `.projectspec` analysis and links Project docs plus every standalone module document;
- mechanical validator passes after at most one targeted repair cycle;
- a final semantic audit confirms a person can understand the product/process and an implementation agent can identify owners, dependencies, state/data boundaries, extension patterns, and applicable governance.

## Final commands

After all Project analysis/docs exist, build the index deterministically:

```bash
python <skill-dir>/scripts/build_index.py <docs-root> \
  --plan <docs-root>/.projectspec/documentation-plan.json \
  --intelligence <docs-root>/.projectspec/repository-intelligence.json
```

Then validate:

```bash
python <skill-dir>/scripts/validate_docs.py <docs-root> \
  --inventory <docs-root>/.projectspec/workspace-inventory.json \
  --plan <docs-root>/.projectspec/documentation-plan.json
```
