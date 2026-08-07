---
description: Generate repository-level Project SPEC context for SDD planning.
agent: general
---

# Project SPEC Generation

Generate or refresh `{PROJECT_ROOT}/spec/project-spec.md` as a factual description of the CURRENT repository. The Project SPEC exists to improve downstream SDD planning and implementation success on large codebases. It is not a feature specification and must not contain proposed architecture for the user's requested change.

## Strict rules

1. **Current state only.** Describe what exists now. Do not design the requested feature, migration, refactor, or idealized architecture.
2. **Evidence over inference.** Prefer source/configuration-established facts. Put uncertain findings in `Uncertain or Inferred Information` instead of presenting them as facts.
3. **Graph first for source relationships.** When a HomeGraph or CodeGraph MCP server is available and indexed for this project, use it before broad grep/glob/source reading for module relationships, symbols, callers/callees, entry points, call paths, and impact information.
4. **Directly inspect project metadata.** Graph analysis is not sufficient for build/configuration knowledge. Read the highest-value project metadata and executable configuration directly.
5. **Targeted verification.** After graph exploration, directly read a small number of representative/critical source files to verify important claims. Do not exhaustively read the repository.
6. **No source edits.** The only repository artifact this workflow may create or update is `{PROJECT_ROOT}/spec/project-spec.md`.
7. **Compactness.** Optimize the document for an implementation/planning agent, not for human tutorial completeness. For large repositories, summarize architecture rather than enumerating every file.
8. **Preserve useful existing content.** If Project SPEC already exists, keep verified sections that remain correct and update stale/affected information. Do not blindly rewrite accurate material.

## Inputs

- `PROJECT_ROOT`: current workspace/project root.
- Template: `{CONFIG_ROOT}/specs/templates/project-spec-template.md` where `CONFIG_ROOT = ~/.local/share/deveco/`.
- Existing artifact, when present: `{PROJECT_ROOT}/spec/project-spec.md`.

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

### 2. Use graph knowledge for code structure

If HomeGraph tools are available, use their structural queries (`explore`, `search`, `node`, `callers`, `callees`, `impact`, `files`, or equivalent) to identify:

- architecturally meaningful modules and their dependencies
- runtime/application entry points
- important shared contracts and high fan-in/fan-out symbols
- representative end-to-end runtime flows
- cross-module boundaries
- change-sensitive areas

If HomeGraph is unavailable but CodeGraph MCP tools are available, use CodeGraph for the same categories of evidence.

If neither graph backend is available or the project is not indexed, fall back to targeted repository exploration. Record the limitation under `Uncertain or Inferred Information`; do not fail Project SPEC generation solely because graph analysis is unavailable.

### 3. Verify representative source

Directly read only the source needed to confirm critical graph-derived claims, especially:

- application/ability startup
- shared interfaces or services with broad impact
- state/persistence ownership
- one or more important cross-module flows

Do not dump broad source-file contents into context when graph evidence already answers the question.

### 4. Synthesize

Load `{CONFIG_ROOT}/specs/templates/project-spec-template.md` and populate all sections supported by evidence. Omit rows/examples/placeholders that do not apply, but keep the template's top-level section structure so downstream agents can locate information consistently.

For `Project Structure`, include a compact tree of meaningful source/configuration boundaries. Do not include caches, generated build output, package-manager dependency trees, or exhaustive leaf files.

For `Module Semantics`, use source-tree/module boundaries actually present in the repository. Do not impose an architecture that is absent from source.

For `Key Runtime Flows` and `Change-Sensitive Areas`, prefer graph-backed evidence over guesses from filenames.

For `Build and Configuration`, rely primarily on direct configuration inspection rather than graph output.

### 5. Write artifact

Create the `spec/` directory if required, then write the completed artifact to exactly:

`{PROJECT_ROOT}/spec/project-spec.md`

Use the normal `write` tool for initial creation and `edit`/`write` as appropriate for updates. This file is repository-level and is intentionally not validated by the feature-level `spec_write` schema.

## Completion report

Return to the parent agent with:

- artifact path
- whether the artifact was created or updated
- graph backend used (`homegraph`, `codegraph`, or `none`)
- major evidence sources inspected
- any important analysis limitations

Do not start feature planning or implementation.