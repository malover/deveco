<!-- PROJECTSPEC:GENERATED:START -->
# High-Level Business Specification

> Scope: `<workspace or sole project>`  
> Baseline: `<revision or working tree>`  
> Evidence: Observed / Declared / Inferred / Unavailable as noted  
> Parent: [Documentation index](index.md)  
> Coverage: <major capabilities and evidence limits>

## Executive summary

Explain the current product/system value, primary consumers, and the most important observable outcomes in business language.

## Purpose, scope, and current boundaries

State what the analyzed system currently does, what is delegated to external/platform systems, and what was outside the selected evidence scope. Do not create a To-Be section.

## Actors, callers, and consumers

| Actor/caller | Goal | Entry surface | Observable outcome |
|---|---|---|---|

## Capability portfolio

| ID | Capability and value | Classification | Owner | Trigger | Terminal outcome | Detail |
|---|---|---|---|---|---|---|

Account for sub-capabilities and excluded candidates in concise coverage notes so the portfolio is auditable.

## End-to-end As-Is business journeys

For every major capability owned at this level, provide a full `FLOW-*` from trigger through decisions/handoffs to terminal outcome, including alternatives/failures/recovery. For child-owned capabilities, explain the cross-capability sequence and link to detail.

## UX and interaction model

When any UI participates, include:

- primary screen/state journey and a Mermaid state/flow diagram;
- interaction-to-state/result mapping;
- loading, empty, error, offline, permission, success, cancel, retry, back/dismiss behavior;
- user-visible data, localization, and accessibility behavior when evidenced.

When no UI exists, replace this with **System/API/Operational Journey**: caller states, request lifecycle, decisions, results, errors, retries, and callbacks.

## Use cases and scenarios

For each primary actor goal, summarize preconditions, main flow, alternatives/exceptions, and postconditions. Link to the detailed owner rather than duplicating full child flows.

## Business rules and decision points

| Rule ID | Testable rule | Condition/decision | Observable effect | Evidence |
|---|---|---|---|---|

## As-Is characterization examples

Include this entire section only when an important rule or flow owned here benefits from characterization; otherwise omit the heading and its contents. Link to child-owned examples rather than repeating them. These describe As-Is behavior and are not executable specifications.

### EXAMPLE-<stable-id> — <RULE-* or FLOW-*>

- **Given:** <evidenced starting state/input/precondition>
- **When:** <observed trigger/operation/decision>
- **Then:** <observable user/caller/state/persistence outcome or exact external handoff>
- **Evidence status:** <Observed|Declared|Inferred|Unavailable> — <anchor or boundary>

## Business journey diagram decisions

Include this entire portfolio section only when a major flow has a recorded decision; otherwise omit it. Summarize child decisions and link to detailed owners without duplicating diagrams. A flow owned here uses `required — <type/reason>` with one compact owner-local Mermaid `flowchart` or `stateDiagram-v2`, or `not-useful — <reason>` with no diagram. Do not diagram simple linear flows, duplicate parent/child diagrams, or expose low-level call graphs.

## Domain concepts, business data, and glossary

Explain core concepts, required inputs, produced outputs, visible persistence/freshness semantics, and ambiguous terms.

## External systems and business dependencies

| System/contract | Why it is needed | Data exchanged | Failure/business impact | Evidence |
|---|---|---|---|---|

## Observable quality, privacy, and operational behavior

Cover permission/authentication, privacy, offline/cache, cancellation/retry, localization/accessibility, compatibility, and operator-visible behavior only when evidenced.

## Alternative, failure, and recovery summary

Provide a decision-oriented summary across major journeys; do not merely list exception classes.

## Capability-to-architecture-and-test traceability

| Capability/flow/rule | Architecture owner/entry | Data/integration owner | Representative test/evidence |
|---|---|---|---|

## Assumptions, unknowns, and limitations

Separate Declared/Inferred context from unavailable external evidence. Local evidence not inspected must be resolved before calling a major capability complete.

## Evidence register

| Claim area | Evidence anchor | Class | What it proves |
|---|---|---|---|
<!-- PROJECTSPEC:GENERATED:END -->
