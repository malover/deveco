# Updating and Validating Documentation

## V1 update stance

V1 focuses on strong baseline generation. Full impact-scoped iterative update behavior comes later.

Keep update-friendly foundations:

- stable paths;
- one generated marker region per Markdown file;
- stable `ARC-*`/`CHK-*`/`LIM-*` IDs when meaning/scope remains unchanged;
- compact `.projectspec` intelligence/analysis metadata;
- developer content outside markers preserved.

## Preserve manual content

For existing generated Markdown:

1. locate one generated start/end marker pair;
2. replace only the generated region;
3. preserve outside content byte-for-byte where practical;
4. never nest generated markers.

Manual content in `constraints-and-limitations.md` is especially important. If generated evidence conflicts with a manual rule, flag it rather than silently deleting/rephrasing the manual rule.

## Mechanical gates

### Metadata and analysis

- `workspace-inventory.json`, `documentation-plan.json`, and `repository-intelligence.json` exist.
- every Project has its planned `.projectspec/analysis/<project>.json`;
- every planned module appears in its Project analysis packet;
- every module has resolved `analysisDepth`, Business role/detail, completeness state, and diagram decision;
- every `deep` module records at least two distinct analysis passes;
- behavioral modules have at least one traced flow;
- reference search outcome is recorded for deep modules.

### Structure

- `docs/index.md` exists.
- every verified Project has Architecture, Business, governance.
- every physical module/build unit has module Architecture.
- module Business exists only when plan role/detail justifies it.
- no artificial root Business/Architecture layer is required for multi-Project mode.

### Index

- repository overview reflects semantic metadata rather than raw descriptor dumping;
- every Project Architecture/Business/governance document is linked;
- every module Architecture and standalone module Business document is linked;
- module responsibility/Business role/key entry surfaces come from analysis JSON;
- cross-Project relationships appear when repository intelligence provides them.

### Business

- Project Business is substantive and absorbs `project-grouped` behavior.
- `architecture-only` modules have no Business.
- important flows reach an observable result/handoff.
- deep UX/domain modules include material evidenced states/branches, not only happy path.
- domain concepts remain separate from technical model dumps.

### Architecture

- mandatory module/project core headings exist.
- dependency direction is explicit.
- deep/important modules include the implementation-impacting conditional sections listed in their analysis packet.
- state machines/state owners are explained when analysis found them, not merely listed.
- Extension Guidance names repository-specific seams/reference patterns where available.
- important evidence anchors support ownership, flow, state/data/integration, and extension claims.
- Architecture does not copy governance registries.

### Governance

- `ARC-*`, `CHK-*`, and `LIM-*` IDs are unique per Project registry.
- ARC has scope/basis/impact/evidence/verification.
- CHK has scope/applies-when/actionable checks.
- LIM is evidence-backed and has implementation impact.
- final synthesis considered module-scoped invariants discovered during deep analysis, especially state/data ownership, registration, native/platform handoffs, and dependency rules.

### Mermaid

- fences are balanced;
- declaration supported;
- flowchart node/decision/subgraph/edge labels are conservatively quoted;
- no placeholder labels;
- if analysis marks a module diagram `required`, the corresponding doc contains Mermaid.

## Semantic audit — richness and usefulness

Ask:

1. Could an implementation agent make a real feature change from these docs without rediscovering the basic ownership/state/data path?
2. Did a complex module end up as only a purpose paragraph + one flow + tiny evidence footer despite a rich analysis packet?
3. Are state/data/lifecycle/FSM responsibilities explained where they affect extension decisions?
4. Are there concrete reference implementations or an explicit no-useful-reference search result?
5. Are UX/business flows rich enough to cover meaningful observed states/branches?
6. Are the few extension points actually repository-specific?
7. Are the highest-value drift risks represented in Project governance rather than duplicated everywhere?
8. Are diagrams useful, evidence-backed, and render-safe?
9. Does `index.md` provide a fast semantic map and working links to the detailed docs?

Do **not** repair by padding word counts or creating filler headings. Reopen HomeGraph/source only for a named missing question, patch the affected docs/analysis, rebuild index if needed, and validate once more.

## Mechanical validator

Run:

```bash
python <skill-dir>/scripts/validate_docs.py <docs-root> \
  --inventory <docs-root>/.projectspec/workspace-inventory.json \
  --plan <docs-root>/.projectspec/documentation-plan.json
```

The validator checks structure/analysis/index/link/heading/governance/Mermaid consistency, not factual truth.
