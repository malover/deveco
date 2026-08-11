# Goal Step 0 Instructions

Run this workflow deterministically and return control to the Goal orchestrator only after validation.

## Stage A — HomeGraph status

1. Resolve `{project-root}` and `{project-root}/docs`.
2. Call `homegraph_status` exactly once. Verify the reported project/root identity matches `{project-root}`. Record the current HomeGraph revision/index identity and repository commit when the tools expose them; use the explicit value `unavailable` when either cannot be verified.
3. Treat `.homegraph/` as read-only shared state. Never initialize, refresh, delete, rebuild, migrate, or switch its provider. Do not invoke Python or TypeScript CodeToGraph as a fallback. If HomeGraph is unavailable, continue with targeted file scanning and record the limitation.

## Stage B — Project SPEC

1. Read `../project-spec/instructions.md` and `../project-spec/template.md`.
2. Reuse `docs/project-spec.md` only when it contains exact repository and HomeGraph revisions matching Stage A and status is healthy with no pending index work. Missing revision values mean stale.
3. When stale or absent, follow the Project SPEC instructions and call `project_spec_write` once. Correct invalid structured input once; do not create a separate evidence artifact.

## Stage C — Full documentation

1. Inspect `docs/project-scan-report.json`. Reuse the documentation set only when its `source_revision.repository` and `source_revision.homegraph` exactly match Stage A, its validation status is successful, and every configured required output is readable.
2. Otherwise set:
   - `workflow_mode = "initial_scan"` when `docs/index.md` is absent, else `"full_rescan"`
   - `scan_level = [goal_step0].scan_level`
   - `resume_mode = false`
   - `autonomous = true`
   - `project_root_path = {project-root}`
   - `knowledge_graph_type = "homegraph"` and `has_knowledge_graph = true` only when Stage A is healthy
3. Read and follow `./full-scan-workflow.md` with those supplied values. The Goal contract overrides its interactive defaults: skip its HomeGraph status call, explanations, resume/archive decisions, scan-level question, and project-root question.
4. Ensure the final scan report records `source_revision.repository` and `source_revision.homegraph` from Stage A. Do not treat timestamps, file counts, or symbol counts as revision identity.

## Stage D — Validate and return

Require readable, non-empty files at:

- `docs/project-spec.md`
- `docs/index.md`
- `docs/project-scan-report.json`

Also validate every output listed in the completed scan report. On success, return a compact object with this contract:

```json
{
  "status": "completed",
  "projectSpec": "docs/project-spec.md",
  "docsRoot": "docs",
  "homegraph": "healthy|degraded|unavailable",
  "projectSpecAction": "created|updated|reused",
  "documentationAction": "created|updated|reused",
  "repositoryRevision": "<revision|unavailable>",
  "homegraphRevision": "<revision|unavailable>",
  "limitations": []
}
```

On failure, return `[TOOL_ERROR] repository-documentation: <detail>`; do not enter Phase 1.
