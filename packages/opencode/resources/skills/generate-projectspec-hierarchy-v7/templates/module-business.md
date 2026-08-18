<!-- PROJECTSPEC:GENERATED:START -->
# Business Specification — <module or module-owned capability>

> Scope: `<project/module path>`  
> Baseline: `<revision>`  
> Evidence: Observed / Declared / Inferred / Unavailable as noted  
> Parent: [Project Business](<relative link>) · [Documentation index](<relative link>)  
> Coverage: <owned capability/subprocess>
> Module ID: <stable documentation-plan module id>
> Business role: behavior-owner | supporting-behavior
> Parent behavior: CAP-* or FLOW-* | None — owns <CAP-* or FLOW-*>

Use this template only for a semantically enriched `behavior-owner` or `supporting-behavior`; `architecture-only` never uses it. A `behavior-owner` explains a distinct observable UX, system, API, operational, or data operation/journey and may own `CAP-*`/`FLOW-*` detail. A `supporting-behavior` explains only its observable contribution, links to its parent `CAP-*` or `FLOW-*`, and does not invent a separate capability, actor, or value proposition. Omit every conditional subsection that does not apply instead of emitting an empty heading or placeholder.

## Business contribution, value, and boundary

Explain the distinct observable behavior that justifies this standalone file. If this cannot be done, group the module in its parent instead.

## Actors, callers, consumers, and surfaces

| Actor/caller | Goal | Surface/operation | Result |
|---|---|---|---|

## Capability and operation catalog

| ID/operation | Trigger/input | Value/output | Parent capability |
|---|---|---|---|

## UX/interaction flow or system journey

For UI behavior include state diagram/journey, interaction map, conditional rendering, visible data, back/cancel/dismiss/retry, and all material states. For non-UI behavior include request/operation lifecycle, decisions, callbacks/results, errors, and recovery.

## FLOW-<slug> — Main As-Is process

**Goal/value:**  
**Primary actor/caller:**  
**Trigger:**  
**Preconditions:**

1. Trigger-to-outcome steps in domain language, with state/data effects.

**Postconditions:**  
**Terminal outcome:**  
**Outcome evidence:** Observed at `<path#symbol-or-key>` | External handoff defined by `<contract>`

## Alternate, exception, cancel, and recovery flows

| Condition/state | Behavior | Observable result | Recovery/next action | Evidence |
|---|---|---|---|---|

## Use cases

Include preconditions, main flow, alternatives/exceptions, and postconditions for each distinct caller goal.

## Observable states and transitions

| State | Business meaning | Required data | Entry trigger | Allowed exits |
|---|---|---|---|---|

## Business rules and decisions

| Rule ID | Testable rule | Condition | Result | Evidence |
|---|---|---|---|---|

## As-Is characterization examples

Include this entire section only when an important local rule or flow benefits from characterization; otherwise omit the heading and its contents. Parent documents link to child-owned examples rather than repeating them. These examples describe As-Is behavior and are not executable specifications.

### EXAMPLE-<stable-id> — <RULE-* or FLOW-*>

- **Given:** <evidenced starting state/input/precondition>
- **When:** <observed trigger/operation/decision>
- **Then:** <observable user/caller/state/persistence outcome or exact external handoff>
- **Evidence status:** <Observed|Declared|Inferred|Unavailable> — <anchor or boundary>

## Business journey diagram decision

Include this entire section only for a detailed `FLOW-*` owned here; otherwise omit it. Immediately after the flow detail, record exactly one of:

- `**Diagram decision:** required — <flowchart or stateDiagram-v2 and reason>`, immediately followed by one compact Mermaid `flowchart` or `stateDiagram-v2` block; or
- `**Diagram decision:** not-useful — <reason>`, with no Mermaid block for that flow.

Do not diagram a simple linear flow, duplicate a parent/child diagram, or expose a low-level call graph.

## Domain concepts, data, and external systems

Describe inputs/outputs and observable persistence/freshness semantics without dumping implementation types.

## Observable quality, privacy, localization, and accessibility

Include only evidenced behavior that affects users/callers/operators.

## Relationship to parent capabilities and participating units

## Architecture and test traceability

| Capability/flow/rule | Architecture entry/owner | Representative test/evidence |
|---|---|---|

## Assumptions, unknowns, and limitations

## Evidence register

| Claim area | Evidence anchor | Class | What it proves |
|---|---|---|---|
<!-- PROJECTSPEC:GENERATED:END -->
