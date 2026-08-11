# Goal Step 0 Workflow

**Goal:** Produce the canonical repository documentation required before SDD Phase 1.

## Runtime contract

- `invocation_mode = "goal-step0"`
- `autonomous = true`
- `resume_mode = false`
- `project_knowledge = "{project-root}/docs"`
- `scan_level = "deep"` unless `[goal_step0].scan_level` overrides it

Do not ask the user any workflow, resume, scan-depth, or project-root questions. Do not greet. Do not create, delete, refresh, rebuild, migrate, or provider-switch `{project-root}/.homegraph/`.

Read fully and follow: `./goal-step0-instructions.md`.
