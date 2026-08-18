# Generation Workflow

## 0. Bootstrap before analysis

1. Resolve repository root, selected revision/working-tree policy, output root, and update mode.
2. Run `scripts/bootstrap_projectspec.mjs` immediately. This is the first repository analysis action and must create both metadata files.
3. Read the compact result and the two JSON artifacts. Do not reread every descriptor.
4. Verify:
   - every explicit manifest Project and coherent build root is represented;
   - nested ArkTS module roots remain owned by their declaring Project;
   - local `file:`/workspace dependencies are not external;
   - every physical module/build unit has a stable ID and path;
   - `documentation-plan.json` contains all mandatory structural documents.
5. Correct only ambiguous/incorrect descriptor records. Do not replace deterministic data with prose.
6. Inspect existing generated markers and prior baseline. Preserve manual content. For large runs create/resume `state.json` and start `run-report.json`.

The bootstrap plan is intentionally provisional for Business semantics. Do not begin writing yet.

## 1. Freeze physical hierarchy

Read `references/hierarchy.md`.

1. Freeze Workspace/System -> optional Subsystem -> Project -> Module/Build-unit.
2. Resolve root Project versus multi-project mode only from build/ownership evidence.
3. Record declared dependency direction as consumer -> provider, plus contract and evidence.
4. Distinguish owned local/native code, sibling Projects, platform APIs, and external packages.
5. Preserve every physical unit in the Architecture worklist, including grouped units.

Change a frozen boundary only when direct ownership/build evidence contradicts it; record the correction.

## 2. Establish HomeGraph and build semantic coverage before selecting final files

Read `references/homegraph.md` before implementation-source analysis. For each frozen Project, check `<Project-root>/.homegraph/`; run `homegraph init -i <Project-root>` when it is missing, or incrementally synchronize an existing index. Then serially call `homegraph_status`, confirm indexed scope with `homegraph_files`, and prove queryability with an anchored `homegraph_explore` using a descriptor-derived file, route, ability, or symbol. If one bounded recovery attempt fails, call `question` to offer retry, explicit bounded fallback, or stop.

Maintain a compact HomeGraph Coverage Ledger for the current Project: readiness, anchors, overview evidence, major-capability entry/orchestrator/callees/terminal effect, persistence/integration/cross-module coverage, unresolved verification questions, and any approved fallback.

Use the Documentation Plan as the structural baseline only after graph-backed semantic coverage is established.

Read `references/document-model.md`, `references/business.md`, and for large repositories `references/evidence-and-performance.md`.

### 2.1 Build the capability coverage matrix

Start from every deterministic `capabilityCandidate`, then add source-evidenced candidates from:

- abilities, extensions, services, routes, pages, dialogs, cards, widgets, commands, and public APIs;
- state enums/conditional rendering and primary controllers/view models;
- representative tests named for user/system operations;
- public package exports and cross-Project contracts;
- persistence/integration owners that implement independently triggered behavior.

Classify every candidate as:

- `major`: independently triggered value with a distinct terminal outcome;
- `sub-capability`: meaningful behavior owned by a major capability;
- `technical-support`: necessary implementation behavior without its own business outcome;
- `excluded`: duplicate, generated, obsolete only when proven, or non-behavioral—with reason.

Do not infer a capability solely from a directory or filename. Tests and names are anchors that require representative source/contract confirmation.

For every module with standalone Architecture, classify Business role as `behavior-owner`, `supporting-behavior`, or `architecture-only` from observed contracts, states, effects, and handoffs. Resolve non-UI API/system/data journeys as Business behavior when observable; exclude utilities, DTOs, resources, and build glue without such behavior.

### 2.2 Trace representative behavior

For every major capability trace one end-to-end path with HomeGraph first:

1. real trigger/caller and preconditions;
2. entry point and orchestration owner;
3. state transitions/decision branches;
4. data reads/writes/cache/transformations;
5. external/platform/native handoffs;
6. observed local terminal outcome or exact external callback/contract;
7. material cancel, error, empty, offline, permission, retry, and recovery branches;
8. one representative test when present.

Use `homegraph_explore` for the focused capability packet, `homegraph_search` only to locate missing anchors, `homegraph_node` for precise evidence, bounded `homegraph_callees` for trigger-to-outcome direction, `homegraph_callers` for consumers, and `homegraph_impact` when shared blast radius changes guardrails. Reuse returned evidence and stop when the ledger has a terminal effect or exact external handoff.

For GUI behavior, also inventory screens/states, component-to-action mapping, conditional rendering, back/dismiss behavior, visible data, localization, and accessibility evidence. For non-GUI behavior, reconstruct an equivalent caller/system/API journey with input, decisions, state/effects, output, and failure recovery.

For each important `RULE-*` or `FLOW-*`, decide whether a short As-Is Given/When/Then characterization example adds value. Require an observable `Then` and evidence status; do not create Cucumber specifications or `.feature` files. For each major journey, record a diagram decision as `required` with type/reason or `not-useful` with reason. Use compact business-oriented Mermaid flow/state diagrams only for branching, meaningful state transitions, multiple actors, or module/platform handoffs.

### 2.3 Enrich the documentation plan exactly once

Update the deterministic plan with:

```json
{
  "capabilities": [{
    "id": "CAP-example",
    "classification": "major",
    "owner_document": "path/to/business.md",
    "participating_units": ["project/module"],
    "trigger": "observed trigger",
    "terminal_outcomes": ["observed outcome or exact handoff"],
    "states": ["meaningful state"],
    "rules": ["RULE-id"],
    "evidence": ["path#symbol-or-key"],
    "unknowns": []
  }],
  "excluded_capability_candidates": [{
    "id": "candidate-id",
    "reason": "evidence-based reason"
  }]
}
```

Apply standalone gates only after tracing. Remove shallow deterministic candidates when their substance belongs in a parent. Add capability documents only when a distributed process would make its Project/Workspace Business document dense. Freeze final paths before writing.

## 3. Analyze and write one Project at a time

Read `references/homegraph.md` before graph use. Keep queries serial and anchored.

For the current Project:

1. Establish Homegraph queryability. If unavailable, use bounded exact-symbol search/source reads.
2. Ask one focused overview question anchored by deterministic entries/surfaces.
3. Create a Verification Queue for claims requiring exact values, branches, contracts, or outcomes.
4. Analyze planned standalone owners and representative flows; gather compact facts for grouped units.
5. Inspect real controllers/state owners/callbacks/persistence/native bridges/tests—not only indexes.
6. Resolve every local `Unavailable` by inspection or relabel it `Not inspected`; only outside-scope/missing evidence is `Unavailable`.
7. Confirm the module Business role, parent capability/flow for supporting behavior, characterization examples, and diagram decisions before loading a Business template.

### 3.1 Write substantive Business owners

For each Project, Module, or capability Business owner:

1. Load its Business template.
2. Explain purpose, scope, actors/consumers, capabilities, and observable value.
3. If UX exists, document the UX flow/state model and user-visible data. If it does not, document the reconstructed system/API/operational journey.
4. Write at least one complete main process per major capability and material alternate/failure/recovery paths.
5. Add use cases, decision/rule tables, domain concepts/data, external systems, observable quality/privacy/localization behavior, and architecture traceability when evidenced.
6. End with evidence, assumptions/inferences, unknowns, and limitations.

Do not satisfy a section with one generic sentence, a file list, or `N/A`. Omit truly inapplicable conditional subsections; never omit the capability/process/rule/evidence core.

### 3.2 Write drift-prevention Architecture owners

For each Architecture document:

1. Load its Architecture template.
2. Explain scope/boundary, responsibilities, entry/public surfaces, consumers/dependencies, internal structure, runtime/lifecycle flows, data/state ownership, integrations, and build/test/CI posture.
3. Add an explicit source-tree/ownership map at the correct zoom.
4. Write **Architectural Constraints and Invariants** as evidence-backed rules:
   - ownership/source-of-truth boundaries;
   - allowed dependency direction and forbidden bypasses/cycles;
   - lifecycle/thread/process/state-order requirements;
   - API/ABI/schema/serialization compatibility;
   - security/permission/data-handling restrictions;
   - platform/device/build/native/resource constraints;
   - performance/resource constraints only when observed.
5. Write **Extension and Modification Points**: where new behavior belongs, reusable seams, and existing patterns to follow.
6. Write **Known Limitations and Evidence Gaps**: current constraints, unsupported cases, fragile boundaries, and genuinely unavailable evidence.
7. Write **Change Guardrails**: pre-change impact checks, consumers/contracts to preserve, tests/commands to run, and documentation links to update.

Constraints must be actionable and local. “Follow clean architecture” is not a constraint. If no constraint is proven for a category, say `No additional <category> constraint was evidenced` only after inspection; do not invent one.

Write each document immediately, retain a compact summary, checkpoint, and release detailed Project context.

## 4. Synthesize upward

### Multi-project

For each Project:

- Project Business owns complete Project-wide capabilities not better owned below.
- Project Architecture inventories every module/build unit and aggregates local drift guardrails.
- Child documents link to the Project pair; Project documents link to children and the root.

### Optional OpenHarmony subsystem

Generate a subsystem Architecture roll-up only when authoritative component/subsystem mapping exists and at least two components make it useful. Include aggregated dependency direction, shared constraints, limitations, and change guardrails. Do not invent a subsystem Business owner.

### High level

After all Project summaries:

1. Write high-level Architecture from Project boundaries, cross-Project contracts, shared data/integration/lifecycle concerns, and the constraints whose blast radius crosses Projects.
2. Write high-level Business from the capability portfolio and complete cross-Project journeys. Do not reduce it to links.
3. Write `index.md` last as a concise access map; substance remains in Business/Architecture documents.

In single-project mode, high-level documents also serve as the Project documents and must retain full Project-level substance.

## 5. Review for truth, depth, and drift prevention

Read `references/update-and-validation.md`.

Review every generated document before reopening source:

- Can a person narrate the primary value flow, decisions, states, failures, and outcomes?
- Can an agent identify where to implement a feature, which boundaries it must not cross, and what contracts/tests it must preserve?
- Does every runtime/ownership claim have symbol/config/contract evidence rather than a directory name?
- Does every major capability reach a terminal outcome/handoff?
- Are local native code and local packages classified as owned?
- Are dependency arrows explicitly `depends on` or `used by`?
- Are constraints concrete, limitations honest, and guardrails actionable?
- Is content duplicated, or are there shallow standalone files to consolidate?

Patch only affected documents. Reopen evidence only for a named failed check.

Run the bundled validator with inventory and plan, then perform a manual semantic audit. A passing script confirms mechanics and required sections, not factual truth.

## Incremental update

1. Rerun deterministic bootstrap for the selected revision.
2. Compare hierarchy/descriptors, capability anchors, public surfaces, and prior plan.
3. Reanalyze changed owners, impacted flows/consumers, and inherited constraints.
4. Regenerate affected regions plus ancestor summaries, guardrails, traceability, and index links.
5. Run full coverage/semantic review even for partial regeneration.

Fall back to full semantic planning when project boundaries, module ownership, public contracts, state models, or major capability triggers change.
