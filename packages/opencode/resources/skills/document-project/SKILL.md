---
name: document-project
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

### Step 5.5: Check Knowledge Graph Availability

<critical>Never generate a graph implicitly. Graph generation is a user-invoked command.</critical>

Check for existing codetograph graph at:
1. `{project-root}/docs/codetograph.json`
2. Legacy paths: `{project-root}/codetograph-out/codetograph.json` or `**/codetograph_out/codetograph.json`

If found, store `{{knowledge_graph_type}}` = `"codetograph"`.

If no graph is found, explain that graph-backed documentation requires the user to run `/codetograph` explicitly. Ask whether to continue without a graph or stop. Do not load or run the `codetograph` skill automatically.

Codetograph provides Mermaid sequence diagrams (`trace_calls`), HTML graph exports (`export_html`), and reverse call tracing (`reverse_trace_calls`).

Set `{{has_knowledge_graph}}` = `true` or `false`.

### Step 6: Execute Append Steps

Execute each entry in `{workflow.activation_steps_append}` in order.

Activation is complete. Begin the workflow below.

## Execution

Read fully and follow: `./instructions.md`
