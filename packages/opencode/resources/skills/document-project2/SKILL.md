---
name: document-project2
description: 'Document brownfield projects for AI context. Use when the user says "document this project" or "generate project docs"'
---

# Document Project Workflow

**Goal:** Document brownfield projects for AI context.

**Your Role:** Project documentation specialist.

## Conventions

- Bare paths (e.g. `instructions.md`) resolve from the skill root.
- `{skill-root}` resolves to this skill's installed directory (where `config.toml` lives).
- `{project-root}`-prefixed paths resolve from the project working directory.
- `{skill-name}` resolves to the skill directory's basename.

## On Activation

### Step 1: Load Workflow Config

Read and load `{skill-root}/config.toml`. All configuration is self-contained in this file:
- `[workflow]` section contains activation steps, persistent facts, and on_complete behavior.
- `[config]` section contains runtime values: `project_knowledge`, `communication_language`, `document_output_language`.

### Step 2: Execute Prepend Steps

Execute each entry in `{workflow.activation_steps_prepend}` in order before proceeding.

### Step 3: Load Persistent Facts

Treat every entry in `{workflow.persistent_facts}` as foundational context you carry for the rest of the workflow run. Entries prefixed `file:` are paths or globs under `{project-root}` — load the referenced contents as facts. All other entries are facts verbatim.

### Step 4: Load Config

Use values from `{config}` section of `config.toml`:
- Use `{config.user_name}` for greeting; if not set, ask the user or use "Developer".
- Use `{config.communication_language}` for all communications; default: `"English"`.
- Use `{config.document_output_language}` for output documents; default: `"English"`.
- Use `{config.project_knowledge}` for output path; default: `"{project-root}/docs"`.

### Step 5: Greet the User

Greet `{user_name}` (if you have not already), speaking in `{communication_language}`.

### Step 5.5: Check HomeGraph Availability

<critical>For graph-backed exploration in this skill, use the HomeGraph MCP only. Do not use Python CodeToGraph or TypeScript CodeToGraph tools unless the user explicitly asks to compare providers.</critical>

Call `homegraph_status` for `{project-root}` (pass `projectPath` when the MCP server is rooted elsewhere).

- If HomeGraph reports a healthy/indexed project, set `{{knowledge_graph_type}}` = `"homegraph"` and `{{has_knowledge_graph}}` = `true`.
- If HomeGraph is unavailable or the project is not indexed, report that graph-enhanced analysis is unavailable and continue with normal file scanning unless the user asks to stop. Do not invoke CodeToGraph as a fallback.

HomeGraph tool policy for this skill:
- `homegraph_explore` — **primary exploration tool**. Start here for architectural/subsystem questions and when given symbols or filenames. It can return relevant source, call paths, and impact context in one request; do not mechanically decompose every investigation into search → node → callers/callees when `explore` already answers it.
- `homegraph_files` — establish the indexed repository/file tree; use glob/language grouping when useful.
- `homegraph_search` — fast symbol-name discovery when only locations/candidates are needed.
- `homegraph_node` — precise source retrieval for one symbol or an entire indexed file, with line numbers and call relationships. Prefer it over generic file Read for indexed source when exact source evidence is needed.
- `homegraph_callers` / `homegraph_callees` — targeted directional call analysis when `explore` needs clarification or a bounded explicit call chain is required.
- `homegraph_impact` — change-impact analysis; use only when impact/blast-radius evidence materially helps architectural understanding.
- `homegraph_diff_impact` — unified-diff/hunk impact evidence for code-review/change-analysis tasks; normally unnecessary for baseline project documentation.
- `homegraph_arkui_migrate` — ArkUI migration/state-semantics snapshot; use only when the project/documentation task specifically requires ArkUI migration semantics.
- `homegraph_spec_match` — match a requirement description against Commit4Spec history; optional historical requirements evidence, not a default scan step.
- `homegraph_spec_find` — find Specs associated with a file path; optional when historical/spec context is relevant.
- `homegraph_spec_trace` — trace a code symbol back to associated Specs; optional when explaining requirement provenance.

Default exploration sequence: `homegraph_status` → `homegraph_files` → `homegraph_explore`. Use `search`, `node`, `callers`, and `callees` selectively to resolve specific gaps or obtain precise evidence. Specialized diff/ArkUI/spec tools are opt-in based on the documentation question, not mandatory scan stages.

HomeGraph does not provide CodeToGraph-style `trace_calls`, `find_path`, or `export_html` tools. When this workflow requests a Mermaid flow/sequence diagram, derive it from HomeGraph caller/callee/explore evidence plus verified source reads, then write the `.mmd` file yourself.

### Step 6: Execute Append Steps

Execute each entry in `{workflow.activation_steps_append}` in order.

Activation is complete. Begin the workflow below.

## Execution

Read fully and follow: `./instructions.md`
