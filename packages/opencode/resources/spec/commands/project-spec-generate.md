---
description: Generate repository-level Project SPEC context for SDD planning.
agent: general
---

# Project SPEC Generation

Generate or refresh `{PROJECT_ROOT}/spec/project-spec.md` as a factual description of the CURRENT repository. The Project SPEC exists to improve downstream SDD planning and implementation success on large codebases. It is not a feature specification and must not contain proposed architecture for the user's requested change.

## Strict rules

1. **Current state only.** Describe what exists now. Do not design the requested feature, migration, refactor, or idealized architecture.
2. **Evidence over inference.** Prefer source/configuration-established facts. Put uncertain findings in `Uncertain or Inferred Information` instead of presenting them as facts.
3. **Graph bootstrap is mandatory when CodeGraph is available.** Do not treat a missing `.codegraph/` directory as a reason to skip CodeGraph during Project SPEC generation. If DevEco exposes a bundled CodeGraph executable through `DEVECO_CODEGRAPH_EXECUTABLE`, initialize/index or sync the current repository before graph exploration.
4. **Graph first for source relationships.** After a usable HomeGraph or CodeGraph index exists, use graph tools before broad grep/glob/source reading for module relationships, symbols, callers/callees, entry points, call paths, dependencies, and impact information.
5. **Directly inspect project metadata.** Graph analysis is not sufficient for build/configuration knowledge. Read the highest-value project metadata and executable configuration directly.
6. **Targeted verification.** After graph exploration, directly read a small number of representative/critical source files to verify important claims. Do not exhaustively read the repository.
7. **No source edits.** The only repository artifact this workflow may create or update is `{PROJECT_ROOT}/spec/project-spec.md`. Creation/update of `.codegraph/` is explicitly allowed as analysis infrastructure for Step 0.
8. **Compactness.** Optimize the document for an implementation/planning agent, not for human tutorial completeness. For large repositories, summarize architecture rather than enumerating every file.
9. **Preserve useful existing content.** If Project SPEC already exists, keep verified sections that remain correct and update stale/affected information. Do not blindly rewrite accurate material.

## Inputs

- `PROJECT_ROOT`: current workspace/project root.
- Template: `{CONFIG_ROOT}/specs/templates/project-spec-template.md` where `CONFIG_ROOT = ~/.local/share/deveco/`.
- Existing artifact, when present: `{PROJECT_ROOT}/spec/project-spec.md`.
- Bundled CodeGraph executable, when enabled by DevEco: environment variable `DEVECO_CODEGRAPH_EXECUTABLE`.

## Investigation workflow

### 1. Read repository metadata first

Inspect high-value files when they exist, including appropriate equivalents for the repository:

- `README*`, architecture/developer documentation, existing `AGENTS.md` / `CLAUDE.md`
- HarmonyOS manifests such as `module.json5`, `build-profile.json5`, `oh-package.json5`, `oh-package-lock.json5`
- `hvigorfile.*`, `hvigor-config.*`, package/workspace manifests
- build, lint, formatter, typecheck, test and code-generation configuration
- CI workflows
- native build configuration such as `CMakeLists.txt` when relevant

Prefer executable configuration over prose when they conflict.

### 2. Bootstrap graph knowledge

Determine graph backend availability before broad source exploration.

#### 2a. HomeGraph

If HomeGraph MCP tools are available **and already usable for the current repository**, use HomeGraph as the primary graph backend. Do not attempt to install HomeGraph in this workflow.

If HomeGraph is unavailable or cannot answer repository queries, continue to CodeGraph.

#### 2b. CodeGraph

If CodeGraph MCP tools are available, Project SPEC generation MUST attempt to make the repository graph usable before falling back to ordinary exploration.

Use `DEVECO_CODEGRAPH_EXECUTABLE` rather than assuming `codegraph` is globally installed. Execute CodeGraph commands from `PROJECT_ROOT`.

Required sequence:

1. Check whether `{PROJECT_ROOT}/.codegraph/` exists.
2. If it does not exist:
   - run the bundled executable with `init` from `PROJECT_ROOT`;
   - then run it with `index` from `PROJECT_ROOT`.
3. If `.codegraph/` already exists:
   - run the bundled executable with `status` from `PROJECT_ROOT`;
   - then run `sync` to refresh the index against the current checkout;
   - if status/sync indicates the index is invalid or unusable, run `index` once to rebuild it.
4. After bootstrap/sync, call a CodeGraph MCP structural query such as `codegraph_explore` and require a non-empty repository-specific result before declaring CodeGraph usable.
5. If any shell command fails, capture the command/error in the Project SPEC limitations and continue with targeted exploration. Do not silently claim the graph backend was used successfully.

Platform handling:

- On Windows PowerShell, invoke the executable path from `$env:DEVECO_CODEGRAPH_EXECUTABLE` and use the call operator `&`.
- On POSIX shells, invoke `"$DEVECO_CODEGRAPH_EXECUTABLE"`.
- Do not use `bunx`, npm downloads, or a system Node installation to bootstrap CodeGraph. Use the executable already resolved by DevEco.

A missing `.codegraph/` directory is **not** a valid reason to skip CodeGraph during this workflow when `DEVECO_CODEGRAPH_EXECUTABLE` and CodeGraph MCP are available.

### 3. Use graph knowledge for code structure

With a usable graph backend, query it before broad source reads to identify:

- architecturally meaningful modules and their dependencies
- runtime/application entry points
- important shared contracts and high fan-in/fan-out symbols
- representative end-to-end runtime flows
- cross-module boundaries
- change-sensitive areas

For CodeGraph, perform several focused queries rather than one vague query. At minimum cover:

- application/runtime entry points and startup flow
- module/dependency boundaries
- state/persistence/shared managers or services
- high-impact symbols / callers / callees relevant to cross-module behavior

Only after graph queries should you use targeted `glob`, `grep`, and direct reads to fill gaps or verify claims.

If neither backend can be made usable, fall back to targeted repository exploration and record the exact reason under `Uncertain or Inferred Information`.

### 4. Verify representative source

Directly read only the source needed to confirm critical graph-derived claims, especially:

- application/ability startup
- shared interfaces or services with broad impact
- state/persistence ownership
- one or more important cross-module flows

Do not dump broad source-file contents into context when graph evidence already answers the question.

### 5. Synthesize

Load `{CONFIG_ROOT}/specs/templates/project-spec-template.md` and populate all sections supported by evidence. Omit rows/examples/placeholders that do not apply, but keep the template's top-level section structure so downstream agents can locate information consistently.

For `Project Structure`, include a compact tree of meaningful source/configuration boundaries. Do not include caches, generated build output, package-manager dependency trees, or exhaustive leaf files.

For `Module Semantics`, use source-tree/module boundaries actually present in the repository. Do not impose an architecture that is absent from source.

For `Key Runtime Flows` and `Change-Sensitive Areas`, prefer graph-backed evidence over guesses from filenames.

For `Build and Configuration`, rely primarily on direct configuration inspection rather than graph output.

Add a short `Graph Analysis` subsection near the top of the generated Project SPEC containing:

- `Backend`: `homegraph`, `codegraph`, or `none`
- `Index action`: `reused`, `initialized`, `synced`, `rebuilt`, or `unavailable`
- `Graph queries`: count of successful graph queries used as evidence
- `Direct source reads`: approximate count of source/configuration files read directly
- `Limitations`: only when applicable

Do not report `Backend: codegraph` unless at least one repository-specific CodeGraph query succeeded after bootstrap/sync.

### 6. Write artifact

Create the `spec/` directory if required, then write the completed artifact to exactly:

`{PROJECT_ROOT}/spec/project-spec.md`

Use the normal `write` tool for initial creation and `edit`/`write` as appropriate for updates. This file is repository-level and is intentionally not validated by the feature-level `spec_write` schema.

## Completion report

Return to the parent agent with:

- artifact path
- whether the artifact was created or updated
- graph backend used (`homegraph`, `codegraph`, or `none`)
- graph index action (`reused`, `initialized`, `synced`, `rebuilt`, or `unavailable`)
- successful graph-query count
- approximate direct source-read count
- major evidence sources inspected
- any important analysis limitations

Do not start feature planning or implementation.
