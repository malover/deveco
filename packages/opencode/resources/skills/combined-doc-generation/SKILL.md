---
name: combined-doc-generation
description: Generate compact, evidence-backed, drift-resistant As-Is Business, Architecture, and architectural governance documentation for ArkTS/DevEco/OpenHarmony repositories. Uses one mandatory repository-wide HomeGraph, deterministic project/module discovery, module-first deep analysis, and project-level synthesis for feature implementation by people and agents.
---

# Combined Documentation Generation

Generate documentation whose primary job is to help a person understand the product and help an implementation agent add features **without drifting away from the repository's existing architecture**.

This skill combines two ideas deliberately:

- deterministic hierarchy/output planning from the newer ProjectSpec approach;
- deep, graph-led behavioral and architectural discovery from the older deep/full scan approach.

Do **not** mechanically inventory the repository or create one document per concern. Analyze deeply, then publish only the smallest useful set of documents.

## V1 output contract

Every Project always gets:

```text
<project-doc-root>/
├── architecture.md
├── business.md
├── constraints-and-limitations.md
└── modules/
    └── <module-id>/
        ├── architecture.md
        └── business.md              # only when semantically justified
```

For a single-Project repository, `<project-doc-root>` is `docs/`.

For a multi-Project repository, each Project uses a recognizable relative path directly under `docs/`:

```text
docs/
├── app/
├── service/
└── sdk/
```

Do not add a redundant `projects/` wrapper. Do not generate repository-wide Business/Architecture documents in multi-Project mode. Logical OpenHarmony subsystems are grouping metadata, not document roots.

A rare distributed capability may use `capabilities/<id>/business.md` only when no module owns it cleanly and embedding the full process in Project Business would create substantial duplication or make that document hard to use. Do not create capability files by default.

## Core documentation goals

### Business

Let a person or agent understand:

- what the Project does;
- the main user/system journeys;
- observable states, decisions, failures, and outcomes;
- important domain concepts/data;
- how modules contribute to those journeys.

Project Business **always exists**. It also absorbs meaningful behavior from modules that do not justify their own Business document.

### Architecture

Let an implementation agent understand:

- module/project responsibility and ownership boundaries;
- dependency direction and consumers;
- important runtime/data/state flows;
- source-of-truth and integration boundaries;
- where new behavior belongs;
- which existing implementation patterns are safe references.

Every discovered physical module/build unit gets an Architecture document in V1. Keep it compact: omit conditional sections that would contain only filler.

### Constraints and limitations

Treat `constraints-and-limitations.md` as the Project's developer-maintained architectural contract. It owns:

- `ARC-*` architectural constraints/invariants;
- `CHK-*` change checks useful before/during/after feature implementation;
- evidence-backed `LIM-*` implementation limitations/evidence gaps.

Do not dump these rules into every module Architecture file. Architecture should carry only the small amount of local extension guidance needed to understand the module and link to the Project registry.

## Non-negotiable execution invariants

1. **HomeGraph is mandatory in V1.** Use one HomeGraph index for the repository root, not one per Project.
2. If HomeGraph is missing, initialize it. If it exists, check/update it. Prove readiness with status, indexed files, and anchored exploration before semantic analysis.
3. A failed/oversized HomeGraph query is not permission to abandon HomeGraph. Narrow the question, split the scope, reduce returned files/depth/results, use more precise anchors, and retry. Stop only when the graph itself cannot be made operational.
4. Run `scripts/bootstrap_projectspec.mjs` before semantic analysis. It creates deterministic candidate hierarchy and the structural documentation plan. The model must not reconstruct those artifacts from scratch.
5. Treat deterministic Project boundaries as **candidates to verify**, not prose to reinvent. Use HomeGraph plus build/ownership evidence to detect mistakes; change boundaries only when evidence demonstrates a problem.
6. Use one repository-intelligence pass, then process Projects sequentially. Within each Project, process modules before Project synthesis.
7. Use HomeGraph as the primary semantic traversal layer. Direct source/config reads answer precise unresolved questions; do not indiscriminately read every source file.
8. For module Business classification in V1, stay close to the older deep-scan signals: UX/navigation/state and meaningful domain/data-model/workflow ownership are the primary indicators. Technical storage/helpers/models alone do not justify Business.
9. Generate Project `business.md` even when no module gets a Business file.
10. Every module gets `architecture.md`; module `business.md` is conditional.
11. Keep Markdown slim. Omit inapplicable headings instead of generating one-sentence sections, `N/A`, or generic repository-tour prose.
12. Use evidence anchors for important claims, normally repository-relative paths plus symbols/descriptors. Do not cite every sentence.
13. Use Mermaid selectively when it clarifies structure, state, branching, or handoffs. Generate conservative syntax and validate every Mermaid block.
14. After generation, perform mechanical validation, then a semantic coverage/drift-prevention check. Repair concrete defects and validate once more; do not enter an endless self-review loop.
15. V1 generation is baseline generation. Do not build a complex incremental-update engine yet, but preserve generated markers and developer-maintained constraint content so iterative updates can be added later.

## Deterministic startup

Immediately after repository-wide HomeGraph readiness, and after resolving selected revision/output root, run:

```bash
node <skill-dir>/scripts/bootstrap_projectspec.mjs <repository-root> --output-root docs --revision <revision>
```

Use `bun` if Node is unavailable. Do not install dependencies.

The script atomically writes:

- `docs/.projectspec/workspace-inventory.json`
- `docs/.projectspec/documentation-plan.json`

These artifacts contain descriptor-derived Project/module candidates, declared surfaces, source counts, dependency hints, and the initial output plan. They intentionally do **not** decide final semantic Business ownership.

After HomeGraph verification, write/update:

- `docs/.projectspec/repository-intelligence.json` — verified Project/module hierarchy, repository type summary, cross-Project edges, key anchors, and corrections;
- `docs/.projectspec/analysis/<project-id>.json` — compact reusable Project/module analysis summaries, not raw graph dumps.

## Normalized hierarchy

```text
Workspace/System
  -> optional logical Subsystem
  -> Project
      -> Module/Build unit
```

Typical ArkTS/DevEco mapping:

```text
Application
  -> HAP/HAR/HSP modules
```

Typical OpenHarmony system mapping:

```text
System
  -> Subsystem (logical only)
      -> Component/Part (Project; physical repo/build boundary)
          -> GN target (Module/build unit)
```

A `module.json5` never proves a Project by itself. A logical subsystem never becomes a fake repository/document Project.

## Progressive loading

1. Read [workflow.md](workflow.md).
2. During candidate verification, read [references/hierarchy.md](references/hierarchy.md).
3. Before HomeGraph semantic work, read [references/homegraph.md](references/homegraph.md).
4. Before Project/module analysis, read [references/deep-analysis.md](references/deep-analysis.md) and [references/evidence-and-performance.md](references/evidence-and-performance.md).
5. Before deciding module Business files, read [references/document-model.md](references/document-model.md).
6. Before Business writing, read [references/business.md](references/business.md).
7. Before Architecture writing, read [references/architecture.md](references/architecture.md).
8. Before governance extraction, read [references/constraints-and-limitations.md](references/constraints-and-limitations.md).
9. Read [references/diagrams.md](references/diagrams.md) only when a diagram is applicable.
10. Load exactly one matching template immediately before writing a document.
11. Before completion, read [references/update-and-validation.md](references/update-and-validation.md).

Never preload all templates/references.

## HomeGraph tool policy

Default sequence:

```text
homegraph_status
  -> homegraph_files
  -> anchored homegraph_explore
  -> targeted search/node/callers/callees only where needed
```

Use the repository root as `projectPath` for all graph calls so cross-Project/module relationships stay visible. Constrain queries by verified Project/module paths and concrete anchors rather than building separate indexes.

Do not assume unavailable CodeToGraph-style tools such as `trace_calls` or `find_path` exist. Match the installed HomeGraph capabilities.

## Completion contract

Finish only when:

- both deterministic metadata artifacts exist and parse;
- HomeGraph is queryable for the repository root;
- candidate Project/module boundaries have been verified and any corrections recorded;
- every Project has `architecture.md`, `business.md`, and `constraints-and-limitations.md`;
- every physical module/build unit has `architecture.md`;
- only semantically justified modules have `business.md`;
- Project Business covers the Project's main journeys and absorbs meaningful behavior from non-standalone Business modules;
- module/project Architecture describes ownership, dependency direction, representative flows, and useful extension/reference guidance;
- governance contains scoped `ARC-*`, actionable `CHK-*`, and only evidence-backed `LIM-*` entries;
- Mermaid blocks are structurally valid and safely quoted;
- the bundled validator passes with inventory and enriched plan;
- one final semantic audit confirms the documentation tells an implementation agent where change belongs and what architectural rules must be preserved.

## Run validation

```bash
python <skill-dir>/scripts/validate_docs.py docs \
  --inventory docs/.projectspec/workspace-inventory.json \
  --plan docs/.projectspec/documentation-plan.json
```

Mechanical validation does not prove factual correctness. Fix concrete validation/semantic defects, then run one final validation pass.
