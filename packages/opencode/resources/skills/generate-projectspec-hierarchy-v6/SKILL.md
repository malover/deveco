---
name: generate-projectspec-hierarchy-v6
description: Generate or update scalable, evidence-backed As-Is Business and Architecture documentation for ArkTS, DevEco, OpenHarmony, and mixed software workspaces. Use for a single repository, monorepo, Git-submodule or Repo-tool multi-repository checkout, especially when projects contain HAP/HAR/HSP modules, OpenHarmony components/parts, GN targets, nested independently buildable projects, or large codebases that require incremental and resumable analysis.
---

# Generate ProjectSpec Hierarchy v6

Create a navigable knowledge base for two primary readers:

- **Business**: explain value, actors, capabilities, processes, observable rules, states, and failures in domain language.
- **Architecture**: explain boundaries, responsibilities, entry points, public surfaces, dependencies, runtime/data flows, build/test behavior, and evidence for coding agents and engineers.

Treat this as a preference, not a wall: include technical detail in Business only when it changes observable behavior; include business context in Architecture when it explains a boundary or tradeoff.

Generate **As-Is** documentation. Do not invent future requirements, owners, roadmaps, KPIs, SLAs, ADR rationale, target architecture, rollout plans, or compliance obligations.

## Core invariants

1. Discover physical ownership before semantic grouping.
2. Freeze the Workspace -> Project -> Module/Build-unit hierarchy before choosing documents.
3. Keep every physical unit visible in an architecture inventory, even when it has no standalone file.
4. Make Business capability-complete, not module-count-complete.
5. Make Architecture navigation-complete: a coding agent can find the owning project/module, entry point, dependency direction, and important flow without reading the whole repository.
6. Put detail at the lowest useful level and summarize upward; do not duplicate prose or diagrams.
7. Label observed, declared, inferred, and unavailable evidence honestly.
8. Process one project and one documentation unit at a time; checkpoint large runs.
9. Preserve manual content outside ProjectSpec generated markers during updates.
10. Validate links, placeholders, markers, hierarchy coverage, and Mermaid fences before completion.
11. Freeze `workspace-inventory.json` and `documentation-plan.json`; do not repeatedly rediscover descriptors or reconsider output paths.
12. Treat a terminal outcome as observed only when evidence reaches it; otherwise mark it `Unavailable` and name the missing evidence.
13. Treat required ProjectSpec directories and metadata as skill outputs: create them when absent, even when an optional analyzer, search binary, or graph tool fails.

## Output layouts

### One Project

```text
docs/
├── index.md
├── high-level-business.md
├── high-level-architecture.md
├── capabilities/<capability-id>/business.md  # distributed capability, when useful
└── modules/<module-id>/
    ├── architecture.md              # only when standalone adds value
    └── business.md                  # only for a distinct business capability/contract
```

Do not add a redundant `projects/` layer.

### Multiple Projects

```text
docs/
├── index.md
├── high-level-business.md
├── high-level-architecture.md
├── projects/<project-relative-path>/
│   ├── business.md
│   ├── architecture.md
│   ├── capabilities/<capability-id>/business.md  # distributed capability, when useful
│   └── modules/<module-id>/
│       ├── architecture.md          # significance-based
│       └── business.md              # significance-based
└── subsystems/<subsystem>/architecture.md  # optional logical OpenHarmony roll-up
```

Use project-relative paths to avoid collisions between projects with the same name. Sanitize only unsafe path characters; keep the path recognizable.

## Load progressively

1. Read [workflow.md](workflow.md).
2. During hierarchy discovery, read [references/hierarchy.md](references/hierarchy.md).
3. Before planning or analyzing a large repository, read [references/evidence-and-performance.md](references/evidence-and-performance.md).
4. Before using Homegraph, read [references/homegraph.md](references/homegraph.md).
5. Before choosing the output set, read [references/document-model.md](references/document-model.md).
6. Load [references/business.md](references/business.md) only for Business analysis/writing.
7. Load [references/architecture.md](references/architecture.md) only for Architecture analysis/writing.
8. Load [references/diagrams.md](references/diagrams.md) only when a diagram is useful.
9. Load one matching file from `templates/` immediately before writing that document.
10. Before updating existing docs or finishing, read [references/update-and-validation.md](references/update-and-validation.md).

Never preload all references or templates. Never load more than one template at once.

## Tool policy

- Use manifests and build/package descriptors for hierarchy and ownership.
- When `project_spec_analyze` is available, call it once before semantic analysis and use its compact response plus `docs/.projectspec/workspace-inventory.json`; do not reread every descriptor individually.
- If the analyzer fails for any reason—including a missing executable such as `rg`—do not install dependencies, retry unchanged, or stop. Immediately create `docs/.projectspec/`, perform the workflow's portable descriptor-first fallback with available file/list/read tools, and write the required inventory yourself.
- Before consuming either metadata file, verify it exists and is valid JSON. Create or repair `workspace-inventory.json` and `documentation-plan.json` from evidence already collected rather than continuing with in-memory-only substitutes.
- Use Homegraph as the preferred semantic index when available and queryable.
- If Homegraph is absent or unusable, use targeted symbol/text search and the smallest relevant source reads. Do not silently replace it with a recursive source-tree dump.
- Use source/config to verify exact externally meaningful constants, branches, state outcomes, contracts, and failure behavior.
- Treat tracked content at the selected revision as the default truth. Use working-tree state only when requested.
- Never copy secrets, tokens, signing material, personal data, or credential values into docs.

## Completion contract

Finish only when:

- the frozen Project and Module worklists are represented in architecture inventories;
- every major capability/process has one detailed Business owner;
- every important cross-project edge has provider, consumer, direction, and evidence;
- every standalone document is linked from `docs/index.md` and its parent document;
- no generated document contains unsupported certainty, empty boilerplate, or unresolved template placeholders;
- `scripts/validate_docs.py <docs-root> --inventory <workspace-inventory.json> --plan <documentation-plan.json>` passes, with any intentionally unresolved evidence gap stated in the relevant document.
