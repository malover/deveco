# Goal Step 0 Instructions

Run this workflow with one required scan-depth choice, then continue autonomously and return control to Goal only after validation.

## Stage A — HomeGraph status

1. Resolve `{project-root}` and `{project-root}/docs`.
2. Call `homegraph_status` exactly once. Verify the reported project/root identity matches `{project-root}` and the index is healthy enough for reliable graph-backed analysis. Record the HomeGraph revision/index identity and repository commit when exposed.
3. If HomeGraph is unavailable, unhealthy, unindexed, or belongs to another project, return `[TOOL_ERROR] repository-documentation: HomeGraph unavailable`, keep Step 0 incomplete, and stop. Do not use direct-file or CodeToGraph fallback.
4. Treat `.homegraph/` as read-only shared state. Never initialize, refresh, delete, rebuild, migrate, or switch its provider.

## Stage A.1 — Scan depth

Invoke `question` exactly once before repository analysis:

**Choose project documentation scan depth:**

1. **Quick** — fast structural understanding through HomeGraph; minimal exact source/config reads.
2. **Deep** — comprehensive HomeGraph traversal across important subsystems with selective exact source verification.
3. **Exhaustive** — maximum HomeGraph-backed coverage across indexed modules, with broader reads where graph coverage is incomplete.

Default to `[goal_step0].default_scan_level` only if the question tool is rejected or denied. Store the result as `scan_level` and use the identical value for Project SPEC and full documentation. Do not ask any other workflow question.

## Stage B — Project SPEC

1. Read `../homegraph-analysis.md`, `../project-spec/instructions.md`, and `../project-spec/template.md`.
2. Reuse `docs/project-spec.md` only when it contains exact repository and HomeGraph revisions matching Stage A and status is healthy with no pending index work. Missing revision values mean stale.
3. When stale or absent, follow the shared policy at the selected `scan_level`, then call `project_spec_write` once. Correct invalid structured input once; do not create a separate evidence artifact.
4. Validate `docs/project-spec.md` before Stage C. Do not begin full documentation until Project SPEC was successfully generated or reused.

## Stage C — Full documentation

1. Inspect `docs/project-scan-report.json`. Reuse the documentation set only when its `source_revision.repository` and `source_revision.homegraph` exactly match Stage A, its validation status is successful, and every configured required output is readable.
2. Otherwise set:
   - `workflow_mode = "initial_scan"` when `docs/index.md` is absent, else `"full_rescan"`
   - `scan_level =` the Stage A.1 selection
   - `resume_mode = false`
   - `autonomous = true`
   - `project_root_path = {project-root}`
   - `knowledge_graph_type = "homegraph"` and `has_knowledge_graph = true` only when Stage A is healthy
3. Read and follow `./full-scan-workflow.md` with those supplied values and `../homegraph-analysis.md`. The Goal contract overrides its interactive defaults: skip its HomeGraph status call and every question because scan depth is already selected.
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
  "homegraph": "healthy",
  "projectSpecAction": "created|updated|reused",
  "documentationAction": "created|updated|reused",
  "repositoryRevision": "<revision|unavailable>",
  "homegraphRevision": "<revision|unavailable>",
  "limitations": []
}
```

On failure, return `[TOOL_ERROR] repository-documentation: <detail>`; do not enter Phase 1.
