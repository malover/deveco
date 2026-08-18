# Shared HomeGraph Analysis Policy

Apply this policy to both Project SPEC and full project documentation. They differ in output detail, not in evidence quality or traversal philosophy.

## Provider and index invariants

- HomeGraph is the only graph provider. Never invoke Python or TypeScript CodeToGraph as a fallback.
- Treat `{project-root}/.homegraph/` as read-only shared evidence. Never create, delete, refresh, rebuild, migrate, replace, or provider-switch it.
- Reuse the HomeGraph status and revision supplied by the invoking workflow. Do not repeat health initialization between stages.
- In `goal-step0`, unavailable, mismatched, or unhealthy HomeGraph is fatal. Manual mode may use its existing direct-file fallback.

## Explore-first tool policy

1. Use `homegraph_files` to establish indexed repository shape, modules, and file boundaries.
2. Use `homegraph_explore` as the primary investigation mechanism for architecture, subsystem responsibilities, entry points, runtime/state/data flows, persistence, cross-module relationships, important dependencies, and hotspots.
3. Use supporting tools selectively:
   - `homegraph_search` when a symbol name or location is unknown and source is not yet needed.
   - `homegraph_node` for exact line-numbered source of an indexed symbol or file and its local relationships. Prefer it over generic `Read` for indexed source.
   - `homegraph_callers` and `homegraph_callees` for explicit directional evidence or focused call-chain expansion.
   - `homegraph_impact` for shared/high-risk areas and modification blast radius.
4. Use `homegraph_diff_impact`, `homegraph_arkui_migrate`, `homegraph_spec_match`, `homegraph_spec_find`, and `homegraph_spec_trace` only when the documentation question requires their specialized semantics.

Do not mechanically decompose every `homegraph_explore` result into redundant search/node/caller/callee calls. Use targeted calls to resolve gaps, verify important claims, or obtain exact source evidence.

## Scan-depth behavior

### Quick

- Build fast structural understanding with `homegraph_files`, focused `homegraph_explore`, and `homegraph_search`.
- Use node/callers/callees only for a small number of important unresolved relationships.
- Keep direct reads minimal and normally limited to manifests, package metadata, build/config, CI, permissions, documentation, resources, and facts absent from HomeGraph.

### Deep

- Explore every important subsystem and documentation category with focused `homegraph_explore` questions.
- Expand important symbols with node/callers/callees/impact and selectively verify exact source.
- Do not read every source file in selected or critical directories. Deep means deep graph traversal plus selective exact verification.

### Exhaustive

- Cover all relevant indexed modules, files, and subsystems with broad HomeGraph-led traversal.
- Use direct reads more aggressively for missing/partial graph coverage, resources, configuration, data files, and exact details.
- Do not replace graph traversal with an indiscriminate raw filesystem crawl.

## Direct filesystem tools

When HomeGraph is healthy and source is indexed:

- broad architecture discovery → `homegraph_explore`
- exact indexed source → `homegraph_node`
- symbol lookup → `homegraph_search`
- explicit relationships → callers/callees

Generic Read/Glob/Grep remains appropriate for manifests, package/build/CI/permission files, resources, translations, documentation, generated or non-symbol data, unindexed files, and exact content HomeGraph cannot expose. Glob may supplement filesystem completeness checks but must not be the primary code-discovery mechanism.

## Evidence reuse and stopping

- Retain concise modules, hotspots, entry points, and important flows in current context so later stages can reuse them. Make additional graph calls whenever deeper documentation needs them; do not create another persistent evidence cache.
- Continue while a required claim is unresolved, a relevant subsystem is not understood, a runtime relationship lacks evidence, or a discovered dependency materially changes the documentation.
- Stop when required claims have sufficient evidence, further calls repeat established information, or remaining uncertainty cannot be resolved with available graph/source evidence.
- Avoid identical queries, but impose no fixed call-count, query-count, or elapsed-time ceiling.
