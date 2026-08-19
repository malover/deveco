# HomeGraph Execution

HomeGraph is the primary semantic evidence layer and a strict V1 prerequisite.

## One repository-wide graph

Use the repository root as `projectPath` for all HomeGraph calls. Do **not** initialize a separate graph for each Project.

Why:

- cross-Project and cross-module consumers remain visible;
- reference implementations elsewhere in the repository are discoverable;
- repeated initialization is avoided;
- one dependency/impact view can corroborate deterministic boundaries.

Project/module analysis is scoped by paths and anchors inside the same repository-wide graph.

## Readiness lifecycle

1. Call `homegraph_status` for repository root.
2. If missing, run the installed initialization path, normally:

```bash
homegraph init -i <repository-root>
```

3. If present, perform the installed incremental sync/update when status/revision indicates it is needed.
4. Call `homegraph_files` and verify expected descriptors/source areas are indexed.
5. Run one anchored `homegraph_explore` using a real descriptor, ability, page, entry symbol, or module path.
6. Only after the anchored query succeeds is HomeGraph ready for semantic generation.

Initialization can take roughly a minute or more on a large repository. Wait for the operation to complete rather than treating latency as failure.

## Failure recovery — keep HomeGraph

A failed query does not downgrade the run.

For context overflow, memory budget, truncation, timeout, or overly broad result:

1. reduce the question to one Project/module/flow;
2. use exact path/symbol/ability/page anchors;
3. reduce `maxFiles`, result limits, source ranges, or relationship depth;
4. split “architecture + UX + data + integrations” into separate bounded questions;
5. use `homegraph_search` to locate candidates, then `homegraph_node` for exact source;
6. use `homegraph_callers` / `homegraph_callees` for one direction instead of asking for an unconstrained graph;
7. retry serially.

If the underlying process/index is unhealthy, use the installed recovery/reindex operation and re-probe readiness.

In V1, stop/fail only when the graph itself cannot be made operational. Do not silently continue with a source-only fallback.

## Explore first, expand only gaps

Default progression:

```text
status
  -> files
  -> anchored explore
  -> search (only missing anchors)
  -> node (exact source/relationships)
  -> callers/callees (explicit direction)
  -> impact (only when blast radius matters)
```

`homegraph_explore` is the primary investigation packet. Reuse returned source/call relationships instead of mechanically replaying them through every other tool.

Do not assume CodeToGraph-only tools such as `trace_calls`, `find_path`, or HTML export exist.

## Repository intelligence pass

After deterministic bootstrap, use a small number of anchored repository questions to verify:

- candidate Project boundaries;
- module ownership;
- major application/component entry surfaces;
- cross-Project/local package relationships;
- unusual shared architectural hotspots.

This pass should correct mistakes, not semantically analyze every module.

## Module deep-analysis pass

For a module, start with one question such as:

> Within `<module path>`, explain the module's responsibility, real entry/public surfaces, important state/data owners, direct dependencies/consumers, representative runtime/UX flow, and 1-3 related implementations elsewhere worth following. Anchor the answer in `<descriptor/symbol>` and keep returned source bounded.

Then expand only unresolved questions.

Useful targeted follow-ups:

- callers of a public surface to identify consumers;
- callees of a real entry/orchestrator to trace trigger -> effect;
- state/model owners consumed by the UI;
- persistence/integration calls on the representative flow;
- related symbols outside the module for reference patterns;
- impact only when a shared contract/owner affects drift rules.

## Stopping condition

Stop graph exploration for a module when further calls cannot materially change its documents and you have enough evidence for:

- responsibility/boundary;
- dependency direction;
- at least one representative runtime/data flow when the module executes behavior;
- state/data/integration ownership where applicable;
- Business classification evidence;
- one or a few useful extension/reference patterns;
- constraint candidates and evidence anchors.

Do not maximize graph-call count. Maximize useful implementation understanding per call.

## Cross-Project results

Because the graph is repository-wide, a Project query may return symbols owned by another verified Project. Use them to document the boundary/contract and reference relationship, but do not copy the provider's internals into the consumer's Architecture. Analyze provider internals when processing that Project.
