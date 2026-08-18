# Generation Workflow

## 0. Establish scope and update mode

1. Resolve the analyzed root, requested revision, output root, and whether the user wants tracked-revision or working-tree documentation.
2. Inspect existing `docs/index.md` and ProjectSpec markers. If prior generated metadata identifies a revision, use it to plan an incremental update.
3. For a very large run, create or resume `docs/.projectspec/state.json`. Keep it machine-oriented and exclude it from `docs/index.md`.
4. Do not overwrite user-authored text outside generated markers.

## 1. Freeze hierarchy

Read `references/hierarchy.md`.

1. Parse explicit workspace manifests first.
2. Detect the workspace root Project, if any.
3. Detect nested/sibling independent Project roots using build-root evidence.
4. Resolve nested candidates against enclosing-project module ownership.
5. Freeze the Project Worklist.
6. Determine mode only now: one Project means single-project; more than one means multi-project.
7. For every Project, derive the physical Module/Build-unit Worklist from owning descriptors.
8. Record coarse cross-project dependency candidates without implementation traversal.

Do not let later capability grouping erase or create physical Projects.

## 2. Build the Documentation Plan

Read `references/document-model.md` and, for large repositories, `references/evidence-and-performance.md`.

Create a compact plan with:

```yaml
workspace_mode: single-project | multi-project
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
    owner_document: path/to/business.md
    participating_units: [project/module]
cross_project_edges:
  - provider: project-id
    consumer: project-id
    evidence: descriptor-or-contract
```

Apply these gates:

- Generate Project Business + Architecture for every independent Project in multi-project mode.
- Generate standalone Module Architecture when the module has meaningful unique structure, public/shared API, state/data ownership, integration ownership, complex runtime behavior, unusual build/runtime constraints, or a local finding.
- Generate standalone Module Business only when the module owns a distinct user/system/API-facing capability or a substantial, independently explainable part of a process.
- Group thin adapters, variants, utilities, and GN targets into the owning Project Architecture unless a gate above applies.
- Put distributed capability detail in the narrowest parent Business document that can describe the end-to-end behavior truthfully. Do not invent a synthetic physical module.

## 3. Analyze one Project just in time

For the current Project only:

1. Read `references/homegraph.md` and establish a queryable Homegraph index when available. Use the Project root, not the whole multi-repo container.
2. Perform one shallow exploration for responsibilities, entry points, module relationships, public/shared surfaces, and candidate flows.
3. Confirm descriptor-derived modules and refine the Documentation Plan without changing frozen Project boundaries.
4. Create a Verification Queue containing only unresolved claims that require exact source/config evidence.
5. Analyze standalone units first; collect compact grouped-unit facts without full-depth exploration.

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

## 4. Synthesize the current Project

In multi-project mode:

1. Write Project Architecture from module summaries, grouped-unit facts, descriptors, and Project graph evidence using `templates/project-architecture.md`.
2. Write Project Business from capabilities and end-to-end behavior using `templates/project-business.md`.
3. Validate that every physical module appears in the Project Architecture inventory.
4. Validate that every major Project capability has one detailed Business owner.
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
python3 <skill-dir>/scripts/validate_docs.py <repository>/docs
```

On success, remove `docs/.projectspec/state.json` unless the user asked to keep resumable state.

## Incremental update path

When prior metadata and revision history are available:

1. Find changed descriptors, docs, symbols/files, and Project boundaries since the documented revision.
2. Map each change to its owning module, Project, capability, and ancestor documents.
3. Reanalyze only affected standalone/grouped units and cross-boundary flows.
4. Regenerate affected generated regions plus their parent summaries and `docs/index.md`.
5. Run full hierarchy/link/coverage validation even when content regeneration is partial.

Fall back to a full hierarchy rediscovery when manifests, project roots, module descriptors, or ownership mappings changed.
