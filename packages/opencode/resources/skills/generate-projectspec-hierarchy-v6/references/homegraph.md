# Homegraph Execution

Use Homegraph for semantic relationships after descriptor-driven hierarchy discovery. Never use graph results to override explicit Project/module ownership.

## Project-scoped lifecycle

Use the current Project root as `projectPath`.

- Do not build one giant workspace graph merely because independent Projects share a parent directory.
- If no index exists, initialize the Project, then prove readiness with a small semantic query.
- If an index exists, synchronize it incrementally, then probe it.
- Treat successful queryability as the readiness gate; directory creation or CLI success text alone is insufficient.
- Use a full rebuild only as recovery after an incremental attempt fails and the index is not queryable.
- If Homegraph remains unavailable, follow the bounded fallback in `evidence-and-performance.md` and disclose reduced relationship confidence.

Do not turn index initialization, synchronization, local error logs, or graph cache files into product findings.

## Explore first

Use the installed equivalent of this progression:

1. project/file inventory or status only to establish scope/readiness;
2. `explore` for a focused question about responsibilities, entry points, dependencies, UI/state participation, or a major flow;
3. `search` only to locate unresolved candidate symbols;
4. `node` for precise source/relationships around one symbol or indexed file;
5. `callers` / `callees` for explicit direction when exploration is insufficient;
6. `impact` only when consumer/blast-radius evidence materially changes documentation.

Homegraph installations may expose different tool names. Match by capability; do not assume a `trace_calls` or `find_path` tool exists.

Do not mechanically decompose every exploration packet into redundant follow-up calls. Reuse returned source, call-path, and impact evidence.

## Project and module passes

For the current Project:

1. ask one shallow question for owned module relationships, entry points, public/shared surfaces, and candidate flows;
2. refine the Documentation Plan;
3. stop broad exploration.

For a standalone module or cross-module capability:

1. ask a focused question about responsibility, boundary, important consumers/dependencies, and observable behavior;
2. expand only representative entry-to-outcome paths;
3. add exact unresolved semantics to the Verification Queue;
4. verify those semantics from the smallest source/config surface;
5. stop when further graph calls repeat established relationships.

Grouped/thin units normally need descriptor evidence plus no more than one focused exploration unless a cross-unit flow or finding requires more.

## Boundary handling

When results include symbols beneath another frozen Project, attribute them to that owning Project. Record only the current Project's observed boundary/contract and defer foreign internals to the provider's analysis.

Cross-project dependency topology comes primarily from manifests, build/package descriptors, and verified contracts. Homegraph may corroborate an edge from either side but need not span independent repositories.
