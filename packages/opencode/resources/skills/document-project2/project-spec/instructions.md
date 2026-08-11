# Project SPEC Instructions

Generate `docs/project-spec.md` as a compact, factual briefing of the current repository. It describes existing behavior only; it must not design the requested feature.

## Evidence invariant

Every authoritative relationship must be supported by a current HomeGraph edge/path or a directly verified source/config invocation. Put unresolved ordering and relationships in `uncertainties`; never infer them from names alone.

## Procedure

1. Use the Stage A HomeGraph status supplied by the Goal wrapper; do not call status again.
2. Use `homegraph_files` once for shallow shape. Prefer `homegraph_explore` for focused architecture and flow questions, then use `search`, `node`, `callers`, `callees`, and `impact` only to close named evidence gaps.
3. Read only manifests, documentation, permissions, build, CI, and facts not represented well by the graph.
4. Cover overview, modules and boundaries, entry points, runtime flows, contracts, state/persistence, change impact, reusable patterns, build/config/testing, documentation, and limitations.
5. Keep evidence transient. Make at most 24 HomeGraph calls and no more than two equivalent queries for a symbol or path. Publish remaining gaps as uncertainty.
6. Call `project_spec_write` once with concise semantic facts and evidence references. Its validated path/hash response is sufficient.

The legacy isolated agent remains a compatibility fallback selected by `{PROJECT_SPEC_MODE}`; this workflow must not select it automatically.
