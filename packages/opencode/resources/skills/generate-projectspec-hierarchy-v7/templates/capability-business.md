<!-- PROJECTSPEC:GENERATED:START -->
# Capability Business Specification — <capability>

> Scope: `<Project(s), modules, and capability>`  
> Baseline: `<revision>`  
> Evidence: Observed / Declared / Inferred / Unavailable as noted  
> Parent: [Project/High-Level Business](<relative link>) · [Documentation index](<relative link>)  
> Coverage: <major capability and sub-capabilities>

## CAP-<slug> — Purpose, value, and outcome

Explain the end-to-end value and why the capability is independently meaningful.

## Scope, actors, callers, and participating surfaces

| Actor/caller | Goal | Entry surface | Terminal outcome |
|---|---|---|---|

## Capability decomposition

| Sub-capability/operation | Trigger | Contribution | Owning unit |
|---|---|---|---|

## UX flow or system/API journey

Include the canonical state/flow diagram. For UX, map screens/states, interactions, conditional rendering, visible data, back/cancel/dismiss/retry, and loading/empty/error/offline/permission/success. Without UX, map caller/request states, decisions, effects, callbacks/results, errors, and recovery.

## FLOW-<slug> — Primary As-Is process

**Goal/value:**  
**Primary actor/caller:**  
**Trigger:**  
**Preconditions:**

1. Complete trigger-to-outcome steps across participating boundaries.

**Postconditions:**  
**Terminal outcome:**  
**Outcome evidence:** Observed at `<path#symbol-or-key>` | External handoff defined by `<contract>`

## Alternate, exception, cancel, and recovery paths

| Condition/state | Decision/action | Observable result | Recovery | Evidence |
|---|---|---|---|---|

## Use cases and scenarios

Include preconditions, main path, exceptions, and postconditions.

## State and transition model

| State | Business meaning | Required data | Trigger | Allowed next states |
|---|---|---|---|---|

## Business rules and decision logic

| Rule ID | Testable rule | Condition | Outcome | Evidence |
|---|---|---|---|---|

## As-Is characterization examples

Include this entire section only when an important locally owned rule or flow benefits from characterization; otherwise omit the heading and its contents. Parent documents link to child-owned examples rather than repeating them.

### EXAMPLE-<stable-id> — <RULE-* or FLOW-*>

- **Given:** <evidenced starting state/input/precondition>
- **When:** <observed trigger/operation/decision>
- **Then:** <observable user/caller/state/persistence outcome or exact external handoff>
- **Evidence status:** <Observed|Declared|Inferred|Unavailable> — <anchor or boundary>

These examples characterize As-Is behavior and are not executable specifications.

## Business journey diagram decision

Include this entire section only for a detailed `FLOW-*` owned here; otherwise omit it. Record `**Diagram decision:** required — <flowchart or stateDiagram-v2 and reason>` immediately followed by one compact Mermaid block, or `**Diagram decision:** not-useful — <reason>` with no diagram for that flow. Do not diagram simple linear flows, duplicate parent/child diagrams, or expose low-level call graphs.

## Domain concepts, business data, and external systems

## Observable quality, privacy, localization, and accessibility

## Participating Projects/modules and handoffs

| Unit | Contribution/ownership | Input/output contract | Architecture detail |
|---|---|---|---|

## Business-to-architecture-and-test traceability

| Capability/flow/rule | Entry/orchestrator | State/data/integration owner | Representative test/evidence |
|---|---|---|---|

## Assumptions, unknowns, and limitations

## Evidence register

| Claim area | Evidence anchor | Class | What it proves |
|---|---|---|---|
<!-- PROJECTSPEC:GENERATED:END -->
