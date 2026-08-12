# Goal Step 0 Documentation Workflow

**Goal:** Run the original full project documentation workflow after Project SPEC generation.

## Required inputs from Goal

- `invocation_mode = "goal-step0"`
- `autonomous = true`
- `resume_mode = false`
- `project_root_path = "{project-root}"`
- `project_knowledge = "{project-root}/docs"`
- `scan_level = "quick" | "deep" | "exhaustive"` from Goal's single scan-depth question
- `knowledge_graph_type = "homegraph"`
- `has_knowledge_graph = true`
- the repository and HomeGraph revisions recorded during initialization

Before continuing, require a readable `docs/project-spec.md` and a healthy HomeGraph status supplied by Goal. Do not initialize, sync, recover, or query HomeGraph status again. Do not generate Project SPEC in this skill.

Set `workflow_mode = "initial_scan"` when `docs/index.md` is absent, otherwise `"full_rescan"`. Read and follow `./full-scan-workflow.md`.

The Goal override in `full-scan-instructions.md` suppresses all interactive questions. During classification, merge every applicable CSV baseline flag with the LLM classification using OR semantics. For Deep and Exhaustive, generate and validate every exact output required by those merged flags; never finalize a reduced model-selected subset or leave incomplete markers.

On success, return the generated output list and validation status to Goal. On failure, return `[TOOL_ERROR] repository-documentation: <detail>` and stop.
