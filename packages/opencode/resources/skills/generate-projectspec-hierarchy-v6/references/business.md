# Business Documentation

## Purpose

Explain the current system in language useful to product, operations, support, engineering, and new contributors: what value exists, who/what invokes it, how the process reaches an outcome, what decisions and data govern it, and what happens outside the happy path.

Business is not a UI inventory or a paraphrased README. Architecture/code supplies precision; UX supplies the observable narrative. Preserve symbols only in traceability/evidence.

## Required depth at every level

Every Business document must contain substantive, scope-appropriate coverage of:

1. purpose, value, scope, and current boundaries;
2. actors/callers/consumers and their goals;
3. capability portfolio and ownership;
4. complete As-Is process flows from trigger to terminal outcome/handoff;
5. UX/interaction journey when any UI participates, otherwise an equivalent system/API/operational journey;
6. observable states, transitions, conditional outcomes, and recovery;
7. use cases with preconditions, main path, alternatives, exceptions, and postconditions;
8. explicit business/behavior rules and decision points;
9. domain concepts, data inputs/outputs, persistence-visible effects, and external systems;
10. observable quality, privacy/permission, localization/accessibility, or operational behavior when evidenced;
11. business-to-architecture and capability-to-test traceability;
12. evidence classes, assumptions/inferences, unknowns, and limitations.

At a parent level, synthesize cross-child behavior and implications; do not merely list links. At a child level, fully explain the owned contribution without duplicating the parent portfolio.

## Evidence order

Use a hybrid method:

1. UX/state/navigation evidence for visible narrative and outcomes.
2. Public API/system contracts for caller-facing behavior.
3. Runtime/graph paths for sequence and ownership.
4. Defining source/config for exact rules, thresholds, validation, persistence, permissions, and failures.
5. Representative tests for outcomes, branches, and semantics.
6. README/design prose for declared purpose only; label it `Declared`.

A directory, filename, test name, export index, or start of a call chain is an anchor—not proof of behavior.

## Capability coverage matrix

Before final document selection, account for every candidate:

| Field | Required meaning |
|---|---|
| ID/classification | major, sub-capability, technical-support, or excluded |
| Value | observable outcome, not implementation responsibility |
| Actor/caller | human, requesting app, OS service, scheduled trigger, or consumer |
| Trigger/preconditions | event and state/contract required to start |
| Main flow | complete trigger-to-outcome sequence |
| Alternatives/failures | decisions, cancel, empty, error, offline, retry, recovery |
| States | business/UI/system states and transitions |
| Rules | stable `RULE-*` statements with defining evidence |
| Data/systems | domain data and external/platform dependencies |
| Participating units | implementation and supporting owners |
| Terminal outcome | observed effect or exact handoff/callback |
| Evidence/unknowns | precise anchors and unresolved facts |
| Detailed owner | exactly one Business document for each major capability |

Do not collapse distinct goals because they share a screen/module. Do not split minor variants into separate capabilities when one process can cover them.

## UX-first reconstruction

When UI exists, do not make UX optional. Build a compact UX flow inside the owning Business document.

### 1. Inventory observable surfaces

Identify routes/pages, dialogs, sheets, cards/widgets, abilities/extensions, menus, notifications, and caller-return surfaces. Record the user/system goal of each, not its visual layout.

### 2. Reconstruct the state model

Map state enums/reactive state/conditional rendering into business meaning:

- ready/idle;
- loading/progress;
- results/content;
- selected/detail/editing;
- empty/no-result;
- success/completed/returned;
- permission/authentication;
- offline/stale;
- error/retry;
- cancelled/dismissed.

Distinguish UI state from domain state. Document which data is visible/required in each state and which transition causes it.

### 3. Map interactions

For every material action capture:

| Action | Surface/component | Trigger/gesture | Orchestrator | State/data effect | Visible result |
|---|---|---|---|---|---|

Include confirm/cancel/back/dismiss/retry and context-dependent navigation. Capture conditional rendering and user-visible validation.

### 4. Trace value and failure

Trace the primary journey plus material alternate, empty, offline, permission, error, cancellation, and recovery paths. Reach the rendered/result/callback/persisted terminal effect; do not stop at navigation registration.

### 5. Cross-check implementation

UX tells **what happens when**. Source/runtime evidence tells exact thresholds, cache decisions, concurrency, persistence ordering, callbacks, native/platform boundaries, and error categories. Combine them.

## Reconstruction without UX

For a service/library/API/CLI or missing UX evidence:

1. Identify domain entities and state from schemas/models/storage.
2. Map external/public contracts and their callers.
3. Trace one representative invocation through orchestration, decisions, data effects, and output.
4. Extract rules from constants, validation, branches, ordering, and error mapping.
5. Reconstruct bootstrap/lifecycle behavior separately.
6. Translate calls into business/system steps.
7. Treat the caller/system states as the interaction journey:
   `request accepted -> validation -> processing -> result/error -> retry/recovery`.

Do not fabricate a human actor. “Requesting application”, “OS service”, “consumer module”, or “scheduled task” may be correct.

## Process and use-case format

For each major process:

```markdown
### FLOW-<slug> — <name>

**Goal/value:** ...
**Primary actor/caller:** ...
**Trigger:** ...
**Preconditions:** ...

1. Actor/system step and observable state/effect.
2. Decision or handoff.
3. Terminal result.

**Postconditions:** ...
**Terminal outcome:** ...
**Outcome evidence:** Observed at `path#symbol-or-key` | External handoff defined by `contract`
**Alternatives/failures/recovery:** ...
```

Use a Mermaid flow/state diagram for the canonical journey when it materially clarifies branching. A list of files or method calls is not a business process.

## As-Is characterization examples

For important rules and flows, add concise characterization examples rather than executable specifications:

```markdown
### EXAMPLE-<slug> — <RULE-id or FLOW-id>

- **Given:** evidenced starting state, input, or precondition
- **When:** observed trigger, operation, or decision
- **Then:** observable user/caller/state/persistence result or exact external handoff
- **Evidence status:** Observed at `<path#symbol-or-key>` | Declared at `<path#section>` | Inferred from `<anchors>` | Unavailable beyond `<boundary>`
```

Use examples for consequential rules, terminal outcomes, material alternate/failure/recovery branches, or state/persistence semantics that prose could leave ambiguous. Reference existing `RULE-*`/`FLOW-*` IDs. `Then` must describe an observable outcome, never an internal call. These are As-Is characterization examples, not acceptance criteria, Cucumber specifications, or `.feature` files. Do not add Cucumber dependencies.

## Module behavior discovery

For every standalone Architecture module, determine whether it owns behavior, supports a parent behavior, or is architecture-only. Inspect caller-visible contracts, returned results, state transitions, validation, persistence effects, transformations, retries, recovery, and platform handoffs. When no UX exists, document a system/API/data/operational journey using requesting application, OS service, consumer module, or scheduled task as the actor when evidenced. Do not create Business narratives for utilities, DTOs, resources, or build glue without observable behavior.

## Rules and decision tables

Write rules as testable statements:

- `RULE-cache-freshness`: Data older than 15 minutes triggers refresh.
- `RULE-selection-limit`: The caller may select at most N items.
- `RULE-cancel-result`: Cancellation returns no selected item and does not persist a change.

Verify exact values and branch semantics. Use a decision table when conditions combine:

| Condition | Decision/action | Observable result | Evidence |
|---|---|---|---|

Internal optimizations belong in Architecture unless they change availability, consistency, timing, ordering, or returned results.

## Domain data and glossary

Explain domain concepts, required inputs, produced outputs, ownership-visible effects, freshness/retention rules, and external data. Do not dump DTO/class/table inventories. Link to Architecture for storage/schema/cache detail.

Include a glossary when repository terminology is non-obvious or inconsistent.

## Observable non-functional behavior

Document only what the As-Is evidence supports:

- permission/authentication and privacy behavior;
- accessibility and localization behavior;
- offline/cache/fallback behavior;
- caller compatibility/version behavior;
- progress, timeout, retry, cancellation, or resource-limit behavior;
- logging/audit/notification visible to operators or users.

Do not invent targets, KPIs, legal obligations, or quality guarantees.

## Evidence and truth gates

- `Observed`: executable/configured behavior reaches the stated effect.
- `Declared`: human-authored intent.
- `Inferred`: reasoned interpretation; state the chain.
- `Unavailable`: evidence is outside scope or missing.
- `Not inspected`: local evidence exists but was not analyzed. This is a work item, not an acceptable completion state for a major capability.

An observed terminal outcome requires evidence at the terminal state/effect. Platform/native calls prove only a handoff unless their contract or local implementation is inspected.

## Prohibited content

Do not invent owners, stakeholder names, roadmaps, release cadence, priorities, To-Be processes, acceptance criteria, pain points, benefits, compliance obligations, or rationale. Do not label code deprecated/placeholder without a marker or complete consumer/build-reference evidence. Do not create a “business domain” for every physical module.
