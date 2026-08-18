# Generation Workflow

## 0. Establish scope and update mode

1. Resolve the analyzed root, requested revision, output root, and whether the user wants tracked-revision or working-tree documentation.
2. Inspect existing `docs/index.md` and ProjectSpec markers. If prior generated metadata identifies a revision, use it to plan an incremental update.
3. For a very large run, create or resume `docs/.projectspec/state.json`. Keep it machine-oriented and exclude it from `docs/index.md`.
4. Do not overwrite user-authored text outside generated markers.
5. Ensure `docs/` and `docs/.projectspec/` exist. When `project_spec_analyze` is available, call it once with the resolved root and baseline. Freeze its artifact at `docs/.projectspec/workspace-inventory.json`.
6. If the analyzer is unavailable, returns an error, omits its artifact, or depends on a missing executable such as `rg`, treat only the analyzer as unavailable. Do not install tools or retry unchanged. Use available directory listing/glob and file-read tools for one bounded descriptor-first pass, then write the same normalized `workspace-inventory.json` yourself. Cover root/build manifests, nested project descriptors, module/build-unit descriptors, ownership, and declared dependency candidates; do not recursively read source files.
7. Verify that `workspace-inventory.json` exists and parses as JSON before Step 1. Never substitute an in-memory inventory. If writing fails, report that concrete filesystem blocker; otherwise continue normally.
8. For large runs, start `docs/.projectspec/run-report.json` and record phase time/tool/read counters without storing source text.

## 1. Freeze hierarchy

Read `references/hierarchy.md`.

1. Read the frozen inventory instead of opening each descriptor again.
2. Verify only ambiguous ownership records against their cited descriptor.
3. Detect the workspace root Project, if any; its internal ID is `_root` and its output slug comes from descriptor name or `root`.
4. Resolve nested candidates against enclosing-project module ownership.
5. Freeze the Project and physical Module/Build-unit worklists.
6. Determine mode only now: one Project means single-project; more than one means multi-project.
7. Record coarse cross-project dependency candidates without implementation traversal.

Do not let later capability grouping erase or create physical Projects.

## 2. Discover capabilities and freeze the Documentation Plan

Read `references/document-model.md` and, for large repositories, `references/evidence-and-performance.md`.

Before choosing files, read `references/business.md` and create the Business Coverage Matrix. Use descriptor-derived abilities/extensions/routes/public packages as anchors, then issue only bounded Homegraph queries with exact names to identify distinct triggers and terminal outcomes. Do not fully trace every capability yet.

Create `docs/.projectspec/documentation-plan.json` with:

```yaml
workspace_mode: single-project | multi-project
documents:
  - path: index.md
    kind: index
  - path: high-level-business.md
    kind: business
  - path: high-level-architecture.md
    kind: architecture
projects:
  - id: stable-relative-path
    path: relative/path
    kind: arkts | openharmony-component | mixed | other
    modules:
      - id: stable-module-id
        path: relative/path
        architecture: standalone | grouped
        business: standalone | grouped | none
        rationale: short evidence-based reason
capabilities:
  - id: stable-capability-id
    major: true | false
    owner_document: path/to/business.md
    participating_units: [project/module]
    value: short outcome
    actors: [actor-or-consumer]
    trigger: short trigger
    preconditions: [condition]
    terminal_outcomes: [outcome]
    alternatives_failures: [branch]
    states: [state]
    rules: [RULE-id]
    data_external_systems: [concept-or-system]
    evidence: [path#symbol-or-key]
    unknowns: [missing evidence]
cross_project_edges:
  - provider: project-id
    consumer: project-id
    evidence: descriptor-or-contract
```

Create the parent directory and file when absent. Before Step 3, verify that `documentation-plan.json` exists, parses as JSON, and contains the frozen project/module worklists and every planned document path. Do not continue using only an in-memory plan.

Apply these gates:

- Generate Project Business + Architecture for every independent Project in multi-project mode.
- Generate standalone Module Architecture when the module has meaningful unique structure, public/shared API, state/data ownership, integration ownership, complex runtime behavior, unusual build/runtime constraints, or a local finding.
- Generate standalone Module Business only when the module owns a distinct user/system/API-facing capability or a substantial, independently explainable part of a process.
- Group thin adapters, variants, utilities, and GN targets into the owning Project Architecture unless a gate above applies.
- Put distributed capability detail in the narrowest parent Business document that can describe the end-to-end behavior truthfully. Do not invent a synthetic physical module.
- Create a capability Business document when a distributed major capability needs substantial detail and putting several such flows in Project Business would make it dense.
- Freeze all expected output paths now. Revise the plan at most once unless later evidence changes hierarchy.

## 3. Analyze one Project just in time

For the current Project only:

1. Read `references/homegraph.md` and establish a queryable Homegraph index when available. Use the Project root, not the whole multi-repo container.
2. Perform bounded explorations anchored by exact ability, route, extension, public API, or entry symbols from the inventory/coverage matrix. Use `maxFiles: 2-3`; allow up to `5` only for a representative end-to-end flow.
3. Confirm descriptor-derived modules and refine the Documentation Plan without changing frozen Project boundaries.
4. Create a Verification Queue containing only unresolved claims that require exact source/config evidence.
5. Analyze standalone units first; collect compact grouped-unit facts without full-depth exploration.
6. Do not retry a Homegraph memory-budget response unchanged. Tighten to exact symbols/files or use a bounded node/caller query.

For each standalone Module Architecture:

1. Read `references/architecture.md`.
2. Trace only important flows.
3. Verify queued exact claims using the smallest source surface.
4. Load `templates/module-architecture.md`.
5. Write directly, then collapse raw evidence to a compact module summary.

For each standalone Module Business:

1. Read `references/business.md`.
2. Reuse architecture evidence; add only UX/state/caller evidence needed for observable behavior.
3. Verify terminal outcomes and exact business rules.
4. Load `templates/module-business.md`.
5. Write directly, then retain only capability, flow, rule, and evidence summaries.

For each planned capability Business document:

1. Reuse the Business Coverage Matrix and participating module architecture evidence.
2. Trace the representative trigger-to-terminal-outcome path; verify exact observable rules and branches.
3. Load `templates/capability-business.md`.
4. Write one detailed owner without copying module internals or the Project summary.

## 4. Synthesize the current Project

In multi-project mode:

1. Write Project Architecture from module summaries, grouped-unit facts, descriptors, and Project graph evidence using `templates/project-architecture.md`.
2. Write Project Business from capabilities and end-to-end behavior using `templates/project-business.md`.
3. Validate that every physical module appears in the Project Architecture inventory.
4. Validate that every major Project capability has one detailed Business owner satisfying every required coverage field, not merely a table row.
5. Save a compact Project Summary and checkpoint `docs/.projectspec/state.json`.
6. Release detailed context before moving to the next Project.

In single-project mode, retain the Project Summary for high-level synthesis and skip wrapper documents.

## 5. Optional logical OpenHarmony subsystem roll-up

Generate `docs/subsystems/<subsystem>/architecture.md` only when all are true:

- the checkout represents an OpenHarmony system or sizeable subsystem set;
- `subsystem_config.json`, `bundle.json`, or equivalent evidence provides a reliable component-to-subsystem mapping;
- at least two documented components make the roll-up useful.

Treat a subsystem as a logical group, not a repository. Do not generate a subsystem Business document unless independent business ownership and behavior are explicitly evidenced.

## 6. Synthesize high-level documents

After all Project Summaries exist:

1. Write `docs/high-level-architecture.md` from Project Summaries, root manifests/config, and resolved cross-project edges. Do not replay module internals.
2. Write `docs/high-level-business.md` from the capability portfolio, actors, cross-project processes, domain terms, observable rules, and failures.
3. Write `docs/index.md` last so it reflects the actual output set.
4. In single-project mode, use the same templates but interpret “Project inventory” as “Module inventory.”

## 7. Review and patch

Read `references/update-and-validation.md`.

Review generated docs before reopening source:

- hierarchy and ownership;
- Business/Architecture separation and traceability;
- cross-level deduplication;
- capability and physical-unit coverage;
- evidence labels and uncertainty;
- diagrams at the correct zoom level;
- parent/back links and local file links.

Patch only affected documents. Reopen graph/source evidence only for a concrete failed check.

Run:

```bash
python3 <skill-dir>/scripts/validate_docs.py <repository>/docs \
  --inventory <repository>/docs/.projectspec/workspace-inventory.json \
  --plan <repository>/docs/.projectspec/documentation-plan.json
```

On success, remove only `docs/.projectspec/state.json` unless the user asked to keep resumable state. Keep inventory, plan, and large-run telemetry as machine-readable update inputs; do not link them from the index.

## Incremental update path

When prior metadata and revision history are available:

1. Find changed descriptors, docs, symbols/files, and Project boundaries since the documented revision.
2. Map each change to its owning module, Project, capability, and ancestor documents.
3. Reanalyze only affected standalone/grouped units and cross-boundary flows.
4. Regenerate affected generated regions plus their parent summaries and `docs/index.md`.
5. Run full hierarchy/link/coverage validation even when content regeneration is partial.

Fall back to a full hierarchy rediscovery when manifests, project roots, module descriptors, or ownership mappings changed.
