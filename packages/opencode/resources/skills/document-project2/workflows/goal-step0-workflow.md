# Goal Step 0 Workflow

**Goal:** Produce the canonical repository documentation required before SDD Phase 1.

## Runtime contract

- `invocation_mode = "goal-step0"`
- `autonomous = true` after the required scan-depth choice
- `resume_mode = false`
- `project_knowledge = "{project-root}/docs"`
- `scan_level = ""` until the user selects Quick, Deep, or Exhaustive

Ask exactly one question: scan depth. Do not ask workflow, resume, rescan/deep-dive/cancel, project-root, classification-confirmation, completion-review, or other manual questions. Do not greet. After scan depth is selected, continue autonomously. Do not create, delete, refresh, rebuild, migrate, or provider-switch `{project-root}/.homegraph/`.

Read fully and follow: `./goal-step0-instructions.md`.
