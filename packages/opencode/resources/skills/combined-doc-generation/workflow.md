# Combined Generation Workflow

## 0. Make repository HomeGraph ready

HomeGraph is a hard V1 prerequisite and uses **one repository-wide index**.

1. Resolve repository root, selected revision/working-tree policy, and output root.
2. Call `homegraph_status` for the repository root.
3. If the graph is absent/uninitialized, run the installed HomeGraph initialization command (normally `homegraph init -i <repository-root>`).
4. If an index exists, run the installed incremental update/synchronization path when needed.
5. Prove readiness with:
   - `homegraph_status`;
   - `homegraph_files` at repository scope;
   - one anchored `homegraph_explore` using a real descriptor/source anchor.
6. If an explore/read fails because the request is too broad, context is too large, the result is truncated, or a memory/deadline error occurs:
   - keep HomeGraph as the required provider;
   - narrow Project/module/path scope;
   - split one large question into independent questions;
   - reduce `maxFiles`, depth, limits, or returned source;
   - switch from broad `explore` to precise `search`/`node`/`callers`/`callees` where appropriate;
   - retry serially.
7. Fail the run only when the repository graph itself cannot be made operational after bounded recovery. Do not silently drop to a non-graph generation mode in V1.

Do not create product findings from `.homegraph/`, graph logs, index warnings, or initialization time.

## 1. Deterministic repository scan, then graph verification

Run `scripts/bootstrap_projectspec.mjs` immediately after HomeGraph readiness if it has not already been run. Read `references/hierarchy.md`.

The bootstrap performs the cheap deterministic part:

- explicit repository/workspace topology;
- ArkTS/DevEco build roots and declared modules;
- OpenHarmony `bundle.json` component roots and GN build units;
- package/workspace/local dependency hints;
- descriptors, source counts, and declared UI/ability surfaces;
- candidate Project/module hierarchy and output paths.

Treat this as **candidate discovery**, not an invitation for the LLM to rebuild the tree.

### 1.1 Verify candidate boundaries

Use HomeGraph and build/runtime evidence only to detect actual classification problems.

For each candidate Project, ask a focused question anchored by its descriptors/entry surfaces:

- does it behave as one application/component/library/build ownership boundary?
- are any nested candidate Projects actually declared modules of this Project?
- do sibling candidates represent independent applications/components/services/packages, or only layers/modules of one application?
- are cross-candidate relationships build/package contracts or ordinary internal module dependencies?

Boundary evidence priority:

1. authoritative repo/build manifests;
2. application/component build roots and packaging;
3. independently meaningful runtime/entry lifecycle;
4. local package/component contract;
5. HomeGraph cross-boundary calls/consumers as corroboration.

Do not promote a directory because of its name. Multiple `module.json5` files alone never create multi-Project mode.

Freeze the verified hierarchy. Update every Project record in `documentation-plan.json` to `boundaryStatus: "verified"` (or `"corrected-and-verified"`) and set `requiresHomeGraphVerification: false` after the repository-wide verification pass.

Write `docs/.projectspec/repository-intelligence.json` containing only compact facts:

```json
{
  "workspaceMode": "single-project | multi-project",
  "projects": [
    {
      "id": "...",
      "path": "...",
      "type": "arkts-application | openharmony-component | ...",
      "technology": ["ArkTS", "ArkUI"],
      "frameworkBuild": ["hvigor", "..."],
      "entryAnchors": ["path#symbol"],
      "modules": [{"id": "...", "path": "...", "kind": "..."}],
      "keyAnchors": ["path#symbol"],
      "boundaryCorrections": []
    }
  ],
  "crossProjectEdges": []
}
```

Collect technology/framework/build classification mostly from manifests/descriptors and HomeGraph. Use the LLM only to synthesize or resolve ambiguous project type/architecture style; do not ask it to rediscover deterministic paths/modules.

Update `documentation-plan.json` when candidate corrections change ownership/output paths and to record verification status. Do not rewrite deterministic metadata into prose.

## 2. Process Projects sequentially

Do not analyze all Projects semantically at once.

For Project A, complete module analysis, module docs, Project synthesis, governance, and Project check. Collapse its details to a compact analysis summary before moving to Project B.

Read `references/deep-analysis.md` and `references/evidence-and-performance.md`.

## 3. Analyze and generate modules first

For each physical module/build unit in the current Project:

### 3.1 Build a focused deep-analysis packet

Start with descriptor-derived anchors and one focused `homegraph_explore` question covering:

- responsibility and ownership boundary;
- real entry/public/lifecycle surfaces;
- direct dependencies and known consumers;
- important state/data/persistence ownership;
- representative runtime/data flow(s);
- UX/navigation participation when present;
- platform/native/external integrations;
- tests and related/reference implementations elsewhere in the repository.

Then fill only concrete gaps with `homegraph_search`, `homegraph_node`, `homegraph_callers`, `homegraph_callees`, and precise source/config reads.

Do **not** read every file. The older deep approach contributes its relationship/data-flow/reference-pattern depth, not its exhaustive Markdown file inventory.

### 3.2 Decide module Business role

For V1, follow the old deep/full scan signals closely.

Strong Business signals:

- ArkUI/other UX entry surface with meaningful navigation/state/user flow;
- an independently understandable domain workflow;
- meaningful domain/data-model lifecycle with observable behavior outside storage mechanics;
- meaningful business/service decision logic tied to a user/system outcome.

Weak/non-Business signals by themselves:

- DTO/entity/model definitions only;
- database/repository plumbing only;
- cache/logging/router/helper utility;
- resources/build glue/generated code;
- large file count or a folder named `feature`.

Classify:

- `behavior-owner` — owns substantial independent UX/domain behavior; standalone module Business is expected;
- `supporting-behavior` — contributes meaningful behavior to a Project journey; create module Business only when that contribution is independently understandable and substantial, otherwise absorb it into Project Business;
- `architecture-only` — technical module without a useful standalone Business narrative.

Record classification and rationale in the enriched plan before writing the module Business file. Apply these plan mutations explicitly:

- `behavior-owner` -> `businessDetail: "standalone"`; add `modules/<slug>/business.md` to `plan.documents` with kind `module-business`; set `businessOwnerDocument`.
- `supporting-behavior` -> choose `businessDetail: "standalone"` only when independently substantial; otherwise `"project-grouped"` with no `businessOwnerDocument`. Add a module Business document only for `standalone`.
- `architecture-only` -> `businessDetail: "none"`; no module Business document.

Store concise evidence anchors in `businessRationale`.

### 3.3 Write module Architecture

Every module gets `modules/<id>/architecture.md`.

Load `templates/module-architecture.md`. Keep the mandatory core small and add conditional sections only when they materially improve implementation understanding.

The document must answer:

- what this module owns and does not own;
- how dependencies/consumers point;
- how its important runtime/data flow works;
- where a new feature/change should be attached;
- one or a few existing patterns/reference implementations worth following;
- which Project governance registry applies.

Actively search for 1-3 high-value reference implementations/patterns when they exist. Do not produce a generic “best practices” list.

### 3.4 Write module Business only when justified

Load `templates/module-business.md` only for a justified standalone Business owner.

If UX exists, reconstruct the important user journey from entry/navigation/state/action through observable outcome. If there is no UX, reconstruct the domain/system workflow instead.

Use domain concepts, not DTO/class dumps. Keep technical evidence in a compact Source Evidence section.

### 3.5 Save compact analysis summary

Update `docs/.projectspec/analysis/<project-id>.json` with reusable facts for Project synthesis:

- module role/responsibility;
- Business role and rationale;
- main flows and outcomes;
- dependency direction;
- state/data owners;
- integrations;
- reference patterns;
- constraint candidates;
- evidence anchors.

Do not save raw HomeGraph packets or source dumps.

## 4. Generate Project-level documents after modules

After all modules in the current Project are covered, synthesize upward from their analysis packets plus cross-module HomeGraph evidence.

### 4.1 Project Architecture

Load `templates/project-architecture.md`.

Keep it compositional rather than duplicating module documents. Explain:

- Project boundary and runtime/build role;
- module responsibility map;
- allowed/observed dependency direction;
- important cross-module runtime/data/state flows;
- external/platform/native boundaries;
- where an implementation agent should start for major change areas.

Usually include one Mermaid module/dependency view, and additional diagrams only when they materially clarify separate questions.

### 4.2 Project Business — always

Load `templates/project-business.md`.

Project Business has two jobs:

1. explain the Project-level product/system purpose, actors, main end-to-end journeys, and domain concepts;
2. absorb meaningful business contributions from modules that do not deserve their own Business file.

Do not repeat child Business documents. Summarize child-owned behavior and explain how the pieces compose into Project journeys.

For UX-heavy Projects, start with a small number of important flows rather than exhaustive screen-by-screen documentation. Increase depth only when evidence shows it is needed to understand the product behavior.

If the rare distributed-capability gate from `references/document-model.md` is truly satisfied, write `capabilities/<id>/business.md` before finalizing Project Business, then summarize/link that detail from the Project journey. Do not create capability files for ordinary cross-module flows.

### 4.3 Project constraints and limitations

Constraint candidates may be collected throughout module analysis, but finalize the registry **after** Project Architecture and Business synthesis so cross-module invariants are visible.

Load `templates/constraints-and-limitations.md`.

Create concise scoped rules:

- `ARC-*`: ownership, dependency direction, source-of-truth, lifecycle/state/concurrency, public contract/schema/native/platform/build constraints;
- `CHK-*`: actionable inspections/tests/checks for changes that could violate architecture;
- `LIM-*`: verified limitations or exact evidence gaps with implementation consequence.

A limitation must have evidence and a concrete implementation consequence. Never add speculative “could improve testing” statements.

Do not create module constraint files. Use scope fields such as `project`, `module:<id>`, or `modules:<a,b>`.

Keep developer-maintained content outside generated markers untouched.

## 5. Project check and repair

Before moving to the next Project, check:

- every module Architecture exists and contains unique useful substance;
- standalone module Business files match their semantic roles;
- Project Business covers important Project journeys including grouped/supporting behavior;
- Project Architecture composes modules without re-documenting them;
- dependency direction is explicit;
- important flows reach an observed local outcome or exact external/platform handoff;
- extension guidance points to actual repository patterns;
- governance holds durable rules/checks/limitations instead of Architecture duplication;
- important claims have useful evidence anchors;
- Mermaid diagrams are useful and syntactically conservative.

Repair concrete misses before collapsing Project context.

## 6. Final repository validation

After all Projects, set `documentation-plan.json` to `phase: "semantic-enriched"` and `requiresSemanticEnrichment: false` only when all module roles/details, final document paths, Project governance documents, and verified boundaries are resolved.

Then:

1. Read `references/update-and-validation.md`.
2. Run the mechanical validator with inventory and enriched plan.
3. Fix missing files, broken links/markers, unresolved placeholders, malformed governance IDs/fields, role/output mismatches, and Mermaid defects.
4. Perform one semantic coverage audit:
   - Can a person explain what each Project does and its main journeys?
   - Can an agent identify the correct module/seam for a new feature?
   - Can an agent see dependency direction and source-of-truth ownership?
   - Are the highest-risk drift rules captured as `ARC-*`/`CHK-*` rather than repeated prose?
   - Are module Business files justified rather than generated from module count?
5. Perform targeted missing analysis/generation for any concrete semantic defect.
6. Run the validator one final time.
7. Stop. Do not recursively review the review.

## Future iterative update compatibility

V1 does not implement a full update planner. Preserve these foundations for later iterative updates:

- one generated marker region per document;
- developer-maintained content outside markers;
- stable Project/module paths and governance IDs where meaning is unchanged;
- compact `.projectspec` hierarchy/analysis metadata that can later drive impact-scoped regeneration.
