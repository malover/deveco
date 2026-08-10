---
agent: goal
description: Generate compact, evidence-backed repository context with persistent HomeGraph.
---

# Project SPEC Generation

Generate `{PROJECT_ROOT}/spec/project-spec.md` as a factual expert briefing about the current repository. HomeGraph remains the detailed knowledge base for downstream follow-up queries; Project SPEC must stay compact and must not describe or design the user's requested feature.

## Correctness Invariant

Every authoritative relationship must be backed by one of:

- a current HomeGraph direct edge;
- a current HomeGraph connected path;
- a directly verified source/config invocation.

Similar names, nearby files, independent lifecycle methods, and historical Commit4Spec results are not proof. Put unresolved relationships or ordering in `Uncertain or Inferred Information`.

For a runtime chain `A → B → C`, prove both edges independently or obtain one connected graph path proving the whole chain. Risk labels require current impact, caller/callee, cross-module, lifecycle, shared-state, or persistence evidence.

## Direct HomeGraph Workflow

1. Call `homegraph_status` once. Reuse an existing artifact only when its repository commit and HomeGraph revision exactly match current verifiable values and the index is healthy. When revision values are unavailable, regenerate rather than infer freshness.
2. Call `homegraph_files` once for a shallow indexed repository shape.
3. Build a transient checklist for overview, modules, entry points, runtime flows, contracts, state/persistence, risk, reusable change paths, build/config/testing, documentation, and limitations.
4. Resolve each missing graph-backed fact with the narrowest tool:
   - unknown symbol name: `homegraph_search`;
   - exact symbol/file and nearby edges: `homegraph_node`;
   - inbound relation: `homegraph_callers`;
   - outbound relation: `homegraph_callees`;
   - named multi-hop path: targeted `homegraph_explore`;
   - blast radius: `homegraph_impact`.
5. Read only documentation, manifests, build/CI files, permissions, and other metadata HomeGraph does not represent well.
6. Optionally use `homegraph_spec_find` or `homegraph_spec_trace` for repository conventions, then verify the result against the current graph. Current evidence always wins. Reserve `homegraph_spec_match` primarily for feature planning in Phase 2.
7. Stop querying a section when every claim you intend to publish is proven. Prefer an explicit uncertainty over broad exploration. Safety ceilings are 24 HomeGraph calls, two equivalent calls per symbol/path, and 120 seconds.
8. Call `project_spec_write` once with concise claims and evidence references. Do not create an evidence JSON, repository model, claim-ledger file, or manually formatted Markdown artifact.

## Output Scope

Keep only high-value repository context:

- module architecture and dependency boundaries;
- verified entry points and runtime flows;
- shared contracts and state/persistence ownership;
- high-risk modification areas;
- build/config/testing facts;
- repository-specific conventions and reusable change archetypes;
- documentation provenance, starting symbols/paths, and limitations.

Summarize large consumer sets with counts and representative examples. Exact detail belongs in HomeGraph, not the artifact.

## Legacy Isolated Fallback

When process mode is `legacy-isolated` (`DEVECO_PROJECT_SPEC_ISOLATED=1` or `DEVECO_PROJECT_SPEC_V2=0`), the Goal agent may spawn the hidden `project-spec` subagent. That subagent calls `project_spec_collect` once, may make one precise follow-up, and writes only `spec/project-spec.md`. This fallback exists for A/B comparison and rollback; it is not the normal path.

## Completion

`project_spec_write` owns canonical section ordering, duplicate prevention, evidence/confidence validation, atomic persistence, hashing, and the success result. Do not reread the full artifact only to validate Markdown. Return the artifact path/status/hash, HomeGraph call count, direct-read count, evidence sources, and limitations.
