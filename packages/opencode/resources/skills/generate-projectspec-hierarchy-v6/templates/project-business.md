<!-- PROJECTSPEC:GENERATED:START -->
# Project Business Specification — <project>

> Scope: `<project path>`  
> Baseline: `<revision>`  
> Evidence: Observed / Declared / Inferred / Unavailable as noted  
> Parent: [High-Level Business](<relative link>) · [Documentation index](<relative link>)  
> Coverage: <owned capabilities and exclusions>

## Executive summary and Project contribution

Explain why this Project exists in the current system, the value/contract it provides, and its relationship to sibling Projects.

## Scope and observable boundaries

State current responsibilities, delegated behavior, in-scope actors/surfaces, and verified exclusions.

## Actors, callers, and consumers

| Actor/caller/consumer | Goal | Trigger/contract | Outcome |
|---|---|---|---|

## Capability and sub-capability map

| ID | Capability/value | Classification | Participating modules | Detailed owner | Terminal outcome |
|---|---|---|---|---|---|

## Detailed As-Is processes owned here

For each major capability owned by this file include:

- goal/value, actor/caller, trigger, preconditions;
- numbered main flow reaching terminal outcome;
- postconditions and visible/persisted/callback result;
- alternatives, cancellation, failure, offline/permission, retry, and recovery;
- participating modules and external/platform handoffs;
- exact outcome evidence.

Summarize and link child-owned flows.

## UX and interaction flow

If UI participates, include the primary journey/state diagram, screen/state responsibilities, interaction map, conditional rendering, visible data, back/dismiss/cancel, empty/loading/error/offline/permission/success states, localization/accessibility evidence.

If no UI exists, provide the caller/system/API journey with request states, decisions, effects, outputs, errors, and recovery.

## Use cases and scenario catalog

| Use case | Actor | Preconditions | Success postcondition | Material exceptions | Flow |
|---|---|---|---|---|---|

## Business rules and decision tables

| Rule ID | Testable behavior | Condition | Result | Evidence |
|---|---|---|---|---|

## As-Is characterization examples

Include this entire section only when an important cross-module rule or flow owned here benefits from characterization; otherwise omit the heading and its contents. Link to child-owned examples rather than repeating them.

### EXAMPLE-<stable-id> — <RULE-* or FLOW-*>

- **Given:** <evidenced starting state/input/precondition>
- **When:** <observed trigger/operation/decision>
- **Then:** <observable user/caller/state/persistence outcome or exact external handoff>
- **Evidence status:** <Observed|Declared|Inferred|Unavailable> — <anchor or boundary>

These describe As-Is behavior and are not executable specifications.

## Business journey diagram decisions

Include this entire portfolio section only when a major flow has a recorded decision; otherwise omit it. Summarize child decisions and link to their detailed owners without duplicating diagrams. A flow owned here uses `required — <type/reason>` with one compact owner-local Mermaid `flowchart` or `stateDiagram-v2`, or `not-useful — <reason>` with no diagram. Do not diagram simple linear flows, duplicate parent/child diagrams, or expose low-level call graphs.

| FLOW-* | Decision | Type/reason | Detailed owner |
|---|---|---|---|

## Domain concepts and data requirements

Explain business entities/concepts, inputs, outputs, freshness/persistence-visible effects, and terminology. Link to Architecture for storage implementation.

## External systems and Project relationships

Explain consumer/provider/contract association without inventing direct dependencies.

## Observable quality, privacy, localization, and operational behavior

Include only current evidenced behavior and constraints.

## Failure, recovery, and support view

Map symptoms/outcomes to retry, fallback, cancellation, cleanup, or operator/user action.

## Business-to-architecture-and-test traceability

| Capability/flow/rule | Entry/orchestrator | State/data/integration owner | Representative test/evidence |
|---|---|---|---|

## Assumptions, unknowns, and limitations

## Evidence register

| Claim area | Evidence anchor | Class | What it proves |
|---|---|---|---|
<!-- PROJECTSPEC:GENERATED:END -->
