# Evidence and Performance

## Evidence classes

Use four classes:

| Class | Meaning | Typical sources |
|---|---|---|
| Observed | Current executable/configured behavior | source, build/config, graph relationship |
| Declared | Human-authored intent or description | README, design doc, comments |
| Inferred | Reasoned interpretation not directly proven | naming/structure synthesis |
| Unavailable | Required evidence is outside scope or missing | external repo, failed index, absent contract |

Prefer Observed for executable claims. Keep Declared claims when useful and identify mismatches. Use “appears”, “suggests”, or an explicit `Inferred:` prefix for material inference.

Use evidence anchors as repository-relative `path` plus stable symbol/section/descriptor key. Add line ranges only when the target system produces stable links; do not rely on line numbers alone.

## Selected revision

Document tracked content at the selected revision by default. For submodules use the parent-pinned gitlink revision when available. For Repo-tool Projects use manifest/checked-out revision evidence. Do not turn local Homegraph state, untracked files, or `git status` into product documentation.

## Hierarchy scan budget

Hierarchy discovery is metadata-only:

- parse explicit manifests;
- search for known build-root descriptors;
- read module lists and dependency declarations;
- stop when Project and Module worklists are frozen.

Do not enumerate source trees to decide ownership.

## Semantic analysis budget

Use Homegraph per Project when queryable:

1. one Project overview query;
2. focused queries for standalone docs and ambiguous grouped units;
3. representative traces for important flows;
4. source verification only for unresolved exact claims.

Maintain a Verification Queue. Every source read must answer a named question and use the smallest symbol/file expected to resolve it.

Default starting budgets are heuristics, not correctness limits:

- grouped/thin unit: descriptor facts plus at most one focused semantic query;
- standalone module: roughly 2-4 focused queries and the representative entry/orchestrator/state/data/integration/test sources needed to establish its unique substance;
- major flow: one trace packet plus the minimum defining source for exact semantics.

Do not stop merely because a numeric budget was reached. Stop when the trigger-to-terminal path, material branches, architectural constraints, and change guardrails are supported; or when additional evidence repeats established facts/cannot change the document.

## Fallback without Homegraph

1. Use descriptor and existing-document evidence first.
2. Search for named entry points, exports, abilities/routes, state enums, integration clients, persistence owners, and error types.
3. Read the smallest relevant files.
4. State the reduced graph confidence in Architecture.
5. Never perform an indiscriminate full-source read to imitate a graph index.

## Large repository execution

Treat a repository as large when any applies: about 250k+ owned source LoC, 3k+ owned source files, 20+ Projects, 100+ modules/build units, or compact summaries cannot fit in one context. Treat about 1M+ LoC, 10k+ source files, 50+ Projects, or 300+ modules as very large.

For large repositories:

- batch by Project, never arbitrary file count;
- finish, validate, checkpoint, and collapse one Project before the next;
- keep only Project Summary, cross-project edges, promoted findings, and output paths in active context;
- write `docs/.projectspec/state.json` atomically after each Project;
- resume from completed Project IDs after rechecking hierarchy fingerprints;
- bound diagrams and split dense maps by subsystem/capability.
- target a warm-index wall time below 8-10 minutes for roughly 500k LoC; treat a slower run as a profiling signal, not permission to omit required evidence;
- bound reads per Project and capability rather than imposing one tiny workspace-wide ceiling; spend the saved hierarchy/planning time on representative behavior, constraints, tests, and native/platform boundaries;
- allow at most one Documentation Plan revision after it is frozen unless hierarchy evidence changes.

Suggested checkpoint fields:

```json
{
  "schemaVersion": 1,
  "skillVersion": 6,
  "selectedRevision": "...",
  "hierarchyFingerprint": "...",
  "completedProjects": [],
  "projectSummaries": {},
  "crossProjectEdges": [],
  "promotedFindings": [],
  "outputPaths": []
}
```

Do not store raw source, secrets, full graph packets, or large prose drafts in the checkpoint.

## Run telemetry

For large runs, write `docs/.projectspec/run-report.json` with phase durations, graph calls, direct reads, bytes/characters returned, retries, truncations, and final document counts. Telemetry is diagnostic and machine-oriented; do not link it from `docs/index.md` or turn it into product findings.

## Findings

Separate:

- Observed inconsistencies: declared/config/source evidence conflicts.
- Architecture concerns: structural coupling, ownership ambiguity, unsafe dependency shape, broad public surface.
- Implementation risks: local failure or fragile behavior with runtime impact.

Place a finding in full once at the highest scope required by its impact. Lower levels may keep a short pointer. Never put engineering findings in Business unless they have a verified user/caller impact; then describe the impact, not the code smell.
