# Project SPEC Instructions

Generate `docs/project-spec.md` as a compact, factual briefing of the current repository. It describes existing behavior only; it must not design the requested feature.

## Evidence invariant

Every authoritative relationship must be supported by a current HomeGraph edge/path or a directly verified source/config invocation. Put unresolved ordering and relationships in `uncertainties`; never infer them from names alone.

## Procedure

1. Read and follow `../homegraph-analysis.md`. Use the Stage A HomeGraph status and selected `scan_level`; do not call status again.
2. Use `homegraph_files` for indexed shape, then investigate at minimum with focused `homegraph_explore` questions covering:
   - architecture, subsystem responsibilities, and module boundaries;
   - entry points and important runtime flows;
   - state, data, and persistence flows;
   - shared contracts, dependencies, hotspots, and modification risk.
3. Apply Quick/Deep/Exhaustive exactly as defined by the shared policy. Use `homegraph_node` for exact indexed source and targeted search/callers/callees/impact wherever important relationships remain unresolved.
4. Read manifests, documentation, permissions, build/config, CI, resources, and unindexed facts directly where appropriate. Do not default to broad raw source reads when HomeGraph is healthy.
5. Cover overview, modules and boundaries, entry points, runtime flows, contracts, state/persistence, change impact, reusable patterns, build/config/testing, documentation, and limitations.
6. Keep concise hotspots, entry points, modules, and flows in current context for the full-documentation stage. Continue until evidence is sufficient or remaining uncertainty cannot be resolved; use no numerical graph-call or time ceiling.
7. Call `project_spec_write` once with compact semantic facts and evidence references. Compactness comes from summarization, not shallow discovery. Its validated path/hash response is sufficient.

The legacy isolated agent remains a compatibility fallback selected by `{PROJECT_SPEC_MODE}`; this workflow must not select it automatically.
