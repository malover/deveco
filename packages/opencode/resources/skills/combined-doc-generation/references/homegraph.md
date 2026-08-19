# HomeGraph Execution

HomeGraph is the primary semantic evidence layer and a strict V1 prerequisite.

## One repository-wide graph

Use repository root as `projectPath` for all HomeGraph calls. Do not initialize one graph per Project.

This preserves cross-Project/module callers, shared patterns, and impact relationships while avoiding repeated indexing.

## Readiness lifecycle

1. Call `homegraph_status` for repository root.
2. If no usable index exists, run the installed initialization path, normally:

```bash
homegraph init -i <repository-root>
```

3. If an index exists, synchronize/update it when status/revision indicates staleness.
4. Call `homegraph_files` and verify expected descriptors/source areas are indexed.
5. Run one anchored `homegraph_explore` using a real descriptor, ability, page, entry symbol, or module path.
6. Only after this succeeds is HomeGraph ready.

Large repositories may take roughly a minute or more to initialize. Wait for completion instead of treating normal indexing latency as failure.

## Query failure recovery — never silently drop HomeGraph

A context overflow, memory-budget response, truncation, timeout, or overly broad result is a **query-shaping problem** until proven otherwise.

Recover progressively:

1. scope to one Project/module/path;
2. anchor to an exact symbol/ability/page/descriptor;
3. split architecture, UX, data/state, and integration questions;
4. reduce returned files/result limits/relationship depth;
5. use `homegraph_search` only to locate candidates;
6. use `homegraph_node` for one precise symbol;
7. use `homegraph_callers` / `homegraph_callees` for explicit direction rather than broad exploration;
8. retry serially.

If the graph process/index itself is unhealthy, use the installed recovery/reindex operation and re-probe readiness.

V1 fails only when repository-wide HomeGraph cannot be made operational. Do not automatically continue with source-only inspection.

## Repository intelligence pass

After bootstrap, use a small number of anchored questions only to verify:

- candidate Project boundaries;
- module ownership;
- Project type/technology/entry anchors;
- cross-Project/local package relationships;
- obvious shared architectural hotspots.

Write `.projectspec/repository-intelligence.json` and freeze hierarchy.

This pass must remain compact. It does **not** replace later module discovery.

## Just-in-time module pass

Immediately before a module is documented, run a fresh module-scoped exploration using anchors from inventory/repository intelligence.

Pass 1 should resolve responsibility, entries, dependencies/consumers, representative runtime/UX path, state/data topics, and Business classification.

For `deep` modules, Pass 2 must target unresolved detail and related code outside the module, for example:

- state/data ownership and lifecycle;
- FSM/state-manager responsibility split;
- persistence/cache/native/platform handoffs;
- error/cancel/recovery branches;
- analogous implementations/shared bases/tests;
- callers/impact for extension blast radius.

Do not simply repeat Pass 1 with a broader prompt.

## Useful tool progression

```text
status
  -> files
  -> anchored explore
  -> targeted explore for gaps
  -> search (missing anchor only)
  -> node (precise symbol)
  -> callers/callees (direction)
  -> impact (only when blast radius matters)
```

Reuse returned evidence. Do not replay every symbol through every tool.

Do not assume CodeToGraph-only tools such as `trace_calls` or `find_path` exist.

## Reference-pattern search

For important modules, explicitly search outside the current module after the main path is understood. Prefer a few strong references:

- analogous feature/page/service;
- shared base/controller/facade;
- established repository/data/state path;
- registration/extension pattern;
- representative tests.

Record `referenceSearchPerformed` and selected `referencePatterns` in analysis metadata. If none are useful, record the search outcome instead of inventing a pattern.

## Stopping condition

Stop only when the module analysis-completion gate is met and another graph call is unlikely to materially improve implementation guidance.

A plausible summary is not a stopping condition for a deep module. Deep modules still require their distinct enrichment/reference pass.

## Cross-Project results

Repository-wide queries can return another verified Project. Use those results to document the consumer/provider contract and cross-Project relationship; defer provider internals until that Project is processed.
