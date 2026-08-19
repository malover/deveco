# Updating and Validating Documentation

## V1 update stance

V1 focuses on strong baseline generation. Full impact-scoped iterative updates come later.

Keep update-friendly foundations now:

- stable output paths;
- one generated marker region per file;
- stable `ARC-*`/`CHK-*`/`LIM-*` IDs when meaning/scope is unchanged;
- developer content outside markers preserved;
- compact `.projectspec` hierarchy/analysis metadata.

## Preserve manual content

For an existing generated file:

1. locate exactly one `PROJECTSPEC:GENERATED:START` and one matching `END`;
2. replace only the generated region;
3. preserve content outside markers byte-for-byte when practical;
4. never nest generated markers.

For `constraints-and-limitations.md`, manual content outside markers is especially important. If it conflicts with regenerated evidence, flag the conflict instead of silently rewriting the manual rule.

## Mechanical content gates

### Project structure

Every verified Project has:

- `architecture.md`;
- `business.md`;
- `constraints-and-limitations.md`.

Every physical module/build unit has `modules/<slug>/architecture.md`.

No root high-level/index document is required in multi-Project mode.

### Business

- Project Business exists and is substantive.
- Module Business exists only when plan role/detail justifies it.
- `architecture-only` modules never get Business.
- `behavior-owner` modules should have standalone Business.
- `supporting-behavior` may be standalone or `project-grouped`; Project Business must cover grouped contributions.
- Important flows reach an observable result or exact handoff.
- UI behavior includes meaningful UX/state path; non-UI behavior has an equivalent domain/system journey.
- Domain concepts are separated from technical model dumps.

### Architecture

- Module core headings are present.
- Project Architecture explains module composition and dependency direction.
- Extension Guidance contains repository-specific seams/reference patterns rather than generic advice.
- Important evidence anchors exist.
- Architecture does not contain full governance registries or copied `ARC-*` tables.

### Governance

- `ARC-*`, `CHK-*`, and `LIM-*` IDs are unique within the Project registry.
- Every ARC has scope, basis, impact, evidence, verification.
- Every CHK has scope/applies-when/check steps and related rules where relevant.
- Every LIM has scope, exact limitation/gap, evidence, implementation impact.
- No speculative limitation prose.

### Mermaid

- fences are balanced;
- declaration is supported;
- flowchart node/subgraph/edge labels use conservative quoted syntax;
- no placeholder labels remain.

## Semantic audit

After mechanical validation, ask:

1. Can a person explain the Project's main value/system journeys from Business?
2. Can an agent choose the correct module for a new feature?
3. Can an agent see dependency direction and source-of-truth ownership?
4. Are 1-3 useful extension/reference patterns present where applicable?
5. Are the most important drift risks represented in Project governance rather than duplicated in module docs?
6. Did any module get Business merely because it exists?
7. Did any meaningful small module behavior disappear instead of being absorbed into Project Business?
8. Are diagrams useful, evidence-backed, and render-safe?

Repair only concrete misses. Reopen source/HomeGraph only for a named failed question.

## Mechanical validator

Run:

```bash
python <skill-dir>/scripts/validate_docs.py <docs-root> \
  --inventory <docs-root>/.projectspec/workspace-inventory.json \
  --plan <docs-root>/.projectspec/documentation-plan.json
```

The validator checks planned files, markers, links, placeholders, Business-role consistency, core headings, governance records, and Mermaid safety. It does not prove narrative truth.

After repair, run it one final time and stop.
