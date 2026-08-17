# Homegraph Execution Rules

Homegraph is a hard prerequisite for implementation-source analysis. It is not an optional enrichment step.

## 1. Index lifecycle

Resolve the absolute repository root first and use that same root for every Homegraph CLI/MCP operation.

### No existing index

If `<repo>/.homegraph/` does not exist:

1. Run `homegraph init -i <repo>`.
2. Do not assume initialization succeeded merely because `.homegraph/` was created.
3. Probe the graph with a repository-level Homegraph MCP query using the repository as `projectPath`.
4. If the probe succeeds, continue even if initialization emitted non-fatal file errors.
5. If the probe fails:
   - inspect `homegraph status <repo>` and `.homegraph/errors.log` when present,
   - run a full `homegraph index <repo>` only when recovery is required,
   - probe again.
6. If the graph is still not queryable, stop project-spec generation and report the Homegraph limitation. Do not silently fall back to broad source scanning.

### Existing index

If `<repo>/.homegraph/` already exists:

1. Run `homegraph sync <repo>` to reconcile added, changed, and removed source files incrementally.
2. Reuse the incrementally updated graph; do not full-index merely because source changed.
3. Probe the graph with a repository-level MCP query after sync.
4. If sync reports an error but the graph probe succeeds, continue and use targeted source verification for any affected area.
5. If the probe fails, use `homegraph status <repo>` and recover with `homegraph index <repo>` only when necessary.
6. If the graph remains unusable, stop generation rather than switching to broad source exploration.

CLI exit text is operational evidence only. **A successful MCP graph query is the readiness gate.**

## 2. Mandatory graph-first gate

Before reading implementation source code, complete all of the following:

1. Repository-level `explore`:
   - architecture shape,
   - physical-module relationships,
   - important entry points,
   - cross-module dependencies.
2. Module-level `explore` for every physical module:
   - responsibilities,
   - important public/framework surface,
   - major internal areas,
   - candidate runtime/data flows.
3. Build a transient **Graph Analysis Plan** containing:
   - modules to document,
   - important symbols/files selected by Homegraph,
   - major flows requiring traces,
   - data/persistence paths,
   - external integration paths.

Root README/build/package/module/CI configuration may be read before this gate because Homegraph does not replace project configuration discovery.

Implementation source files may not be broadly enumerated or read before the gate succeeds.

## 3. Flow coverage

For each major behavior that will appear in the generated docs, use Homegraph to establish the relationship path before source verification.

Use `trace_calls` (or the installed equivalent) for call-oriented behavior whenever possible.

At minimum, cover as applicable:

- application/bootstrap path,
- primary user/caller flows,
- cross-module calls,
- persistence/cache paths,
- remote/API integration paths,
- important state transitions,
- error/fallback paths whose outcome is documented.

One broad `explore` is not a substitute for flow tracing.

## 4. Sparse source verification — not source reconstruction

After the Graph Analysis Plan exists, **do not reconstruct the repository from source files**. Homegraph is the primary evidence for structure, ownership, dependencies, call paths, and implementation topology.

Source reads are a sparse verification mechanism for facts Homegraph cannot establish precisely.

### A source read is allowed only when it answers one of these questions

- What exact condition/constant/threshold changes observable behavior?
- What is the terminal UI/state-machine outcome of a traced flow?
- What exact error/fallback behavior occurs at a decision point?
- What persistence/cache rule cannot be established from the graph?
- What external contract/configuration value cannot be established from graph/config evidence?
- Is a suspected inconsistency or implementation risk real?

Do **not** read source merely to:
- confirm that a class/function/file exists,
- restate a dependency already shown by Homegraph,
- enumerate DAOs/entities/mappers/components,
- understand every intermediate layer in a traced call chain,
- collect implementation detail for completeness,
- "double check" graph relationships without a concrete ambiguity.

### Verification queue

Before reading implementation source for a module, create a transient **Verification Queue**. Every planned source read must have:

1. a concrete unresolved claim/question,
2. the Homegraph evidence that led to it,
3. the smallest symbol/file needed to resolve it.

If a file has no unresolved verification question, do not read it.

### Read the smallest surface

Prefer, in order:

1. symbol/range-level read when available,
2. one directly relevant file,
3. one adjacent file only if the first file leaves the claim unresolved.

Do not follow a call chain file-by-file after Homegraph already established the chain.

### Hard default budgets

Treat these as maximums, not targets:

- **Per major flow:** normally at most 2 implementation files.
- **Per module:** normally at most 6 implementation files total.
- **Repository-wide:** normally at most 20 implementation files total for the first documentation pass.

Root/module configuration, README/docs, and CI files do not count toward these implementation-source budgets.

Exceed a budget only when a specific high-value claim cannot otherwise be established. When exceeding it, first record the unresolved question and why Homegraph/config evidence is insufficient. Do not increase the budget simply because the module contains more files.

For large repositories, become **more selective**, not less: document architecture from graph evidence and verify only representative/high-risk behavior.

### Stop condition

Stop source verification for a module as soon as:

- its responsibilities and boundaries are established by Homegraph,
- major documented flows are graph-backed,
- business-visible terminal outcomes selected for documentation are verified,
- important findings have enough evidence.

Do not continue reading implementation files to improve completeness once these conditions are met.

## 5. Graph coverage checkpoint

Before generating module docs, confirm that the transient graph analysis covers:

- every physical module,
- every major documented runtime/business flow,
- important persistence paths,
- important external integrations,
- cross-module dependencies.

If a planned section lacks graph coverage, obtain that coverage before writing it or explicitly mark the fact as source/config-only evidence when Homegraph cannot represent it.


## 6. Avoid layer-by-layer source walks

A traced path such as:

```text
ViewModel -> Repository -> RemoteDataSource -> API
                         -> LocalDataSource -> DAO -> Entity/Mapper
```

does **not** justify reading every file in that path.

Use Homegraph to document the relationship. Read only the smallest implementation point needed for an unresolved semantic claim.

Example:

- Need to know cache freshness behavior → read the repository method containing the freshness decision.
- Need to know the remote endpoint → read configuration/API contract if not available from graph/config.
- Do **not** then read every DAO, entity, mapper, datasource interface, DTO, and helper merely because they participate in the flow.

## 7. Working-tree and operational-state separation

Homegraph may index the current filesystem, including legitimate in-progress source changes. That does not make Git/tooling state a product finding.

Do not document as architecture/business findings:

- `git status`,
- deleted/untracked files merely because they are locally changed,
- Homegraph sync/index events,
- `.homegraph/errors.log`,
- temporary/generated benchmark files,
- editor/tool artifacts.

When a local source change materially changes observable architecture or behavior, document the resulting code behavior if that working tree is the analysis target, but never report the fact that the file is locally modified/deleted as a system characteristic.

## 8. Context-bounded analysis

Do not convert the Graph Analysis Plan into a repository-wide prose draft.

For the current module only:
- keep a compact normalized summary,
- verify only queued unresolved claims,
- write its documents before moving to the next module.

Once a module document is written, prefer the generated document/summary for downstream synthesis instead of keeping or rereading its full implementation evidence.

## 9. Hard anti-enumeration rule

While Homegraph is usable, do not recursively list implementation trees or enumerate all source files in a module.

Forbidden as normal discovery:

```text
Get-ChildItem <module> -Recurse -File
find <module>/src -type f
rg --files <module>/src
git ls-files <module>/src
```

Use module/build metadata to establish physical modules and Homegraph to discover implementation structure.

A file listing is allowed only for a narrowly scoped non-source class that Homegraph does not model, such as:
- root/module configuration,
- CI workflow files,
- test-file presence,
- resources/profile metadata.

Do not mix those narrow listings with implementation discovery.

## 10. Per-read unresolved-question gate

Immediately before each implementation source read, there must be one concrete unresolved semantic question.

Valid examples:
- What exact freshness threshold controls cache reuse?
- Does this error path end in ERROR, IDLE, or SHOW_CITY?
- Is this external endpoint HTTP or HTTPS?
- Does persistence replace or append an existing row?

Invalid reasons:
- understand this layer,
- inspect all DAOs,
- confirm Homegraph,
- see what this class does,
- collect details for completeness.

If the question can already be answered from Homegraph/config/generated module docs, skip the source read.

## 11. Tighter first-pass budgets

These are ceilings, not targets:

- normally **1 implementation file per major flow**;
- normally **4 implementation files per module**;
- normally **12 implementation files repository-wide** for the first pass.

A second file for a flow is allowed only when the first cannot resolve the queued claim.

For large repositories, prefer fewer source reads and more graph-backed architectural statements.

Configuration, README/docs, CI, and narrowly scoped test files are outside this implementation budget, but they must still be read only when their corresponding document section is being produced.

## 12. Template/context discipline

Homegraph analysis must not trigger template loading.

Do not load document templates until the workflow reaches the exact document-writing step. Never load multiple document templates together.

## 13. Just-in-time graph exploration

Do not fully explore every module before documentation starts.

Global discovery should establish only the repository/module skeleton.

For each module, perform detailed Homegraph exploration **immediately before** generating that module's documents:
- module responsibility and public surface,
- major internal relationships,
- major runtime/business flows,
- persistence/integration paths that belong to that module.

Do not trace future modules early unless a cross-module question for the current module requires it.

## 14. Correctness escape hatch

Optimization budgets never justify an unsupported exact claim.

If the document depends on an exact value or terminal behavior and Homegraph does not expose it precisely, read the defining source even if this exceeds the normal first-pass source-read budget.

Examples requiring verification when not graph-visible:
- freshness/timeout/retry thresholds,
- enum/state transition outcomes,
- fallback/error terminal states,
- HTTP/HTTPS endpoint values,
- persistence conflict semantics,
- interface/implementation contract details,
- feature flags or branching conditions.

Do not infer exact behavior from symbol names such as `FIFTEEN_MINUTES`, comments, README prose, or neighboring code.
