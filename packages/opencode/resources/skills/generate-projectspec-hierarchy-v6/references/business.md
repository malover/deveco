# Business Documentation

## Purpose and language

Explain what value the observed system delivers, to whom, through which process, under which observable rules and failure conditions. Write for product, business, operations, support, and engineering readers. Translate implementation names into domain language; retain symbols only in traceability/evidence.

## Evidence order

Use a hybrid method:

1. UX/state/navigation evidence for the user narrative and visible outcomes.
2. Public API/system contracts for caller-facing behavior.
3. Architecture/graph flows for sequencing and boundaries.
4. Source/config for exact rules, thresholds, validation, persistence, and failures.
5. README/design prose for declared purpose, clearly distinguished from observed behavior.

## Minimum complete capability

For each major capability answer:

1. What value/outcome does it provide?
2. Who or what triggers it?
3. What are the main steps from trigger to outcome?
4. What states, alternatives, and failures are observable?
5. What domain data and external systems are involved?
6. What exact rules constrain behavior?
7. Which Project/modules implement or support it?

Before choosing Business documents, create a Business Coverage Matrix with one row per candidate capability:

| ID | Value | Actors/consumers | Trigger | Preconditions | Main flow | Alternatives/failures | States | Rules | Data/external systems | Participating units | Terminal outcomes | Evidence | Unknowns | Detailed owner |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

Do not collapse distinct user goals into one row merely because they share a screen or module. Typical separate capabilities include browse/search, select/share, edit/save, service-card launch, cleanup, privacy/permission handling, and API consumption when each has a distinct trigger and outcome.

The matrix is planning state stored in `documentation-plan.json`, not user-facing prose. A capability is major when it is a primary entry surface, independently triggered user/system operation, externally consumed contract, or cross-module process with a distinct terminal outcome.

## UX-first analysis

For direct UX or UX-participating modules, inspect:

- pages, dialogs, cards, abilities, and shared visual surfaces;
- routes, ViewState/state enums, reactive state, and conditional rendering;
- tap/select/scroll/swipe/confirm/cancel/back/dismiss/retry interactions;
- loading, empty, error, offline, permission, progress, success, and return-to-caller states;
- terminal observable outcomes.

Map UI state to business meaning. Do not equate a screen component tree with a business process. Shared UI modules can participate materially without owning a route.

## Code/API/system-first analysis

For libraries, services, extensions, and technical modules, identify:

- caller/consumer;
- trigger/input and preconditions;
- operation at one abstraction level above implementation;
- output, effect, or contract;
- state/data lifecycle effects;
- validation, failure, and fallback;
- user/system capability depending on it.

Do not fabricate a human actor for an internal API. “Requesting application”, “OS service”, or “consumer module” may be the truthful actor.

## Process format

Use concise sections:

```markdown
### FLOW-<slug> — <name>

**Trigger:** ...  
**Preconditions:** ...

1. ...
2. ...

**Outcome:** ...  
**Alternatives/failures:** ...
```

For every major capability, include at least one complete main flow and the material observable branch/failure set. If exact persistence, delivery, callback, or return semantics cannot be observed, write `Outcome evidence: Unavailable — <missing source/runtime/external contract>` instead of stating the expected product result as fact.

Include a Mermaid flow/state diagram only when it communicates branching or cross-project handoffs better than the numbered flow.

## Rules and data

Write rules as testable statements, for example:

- `RULE-cache-freshness`: Data older than 15 minutes triggers refresh.
- `RULE-selection-limit`: A caller may select at most N items.

Verify exact values from source/config. Keep internal optimizations in Architecture unless they affect observable timing, consistency, availability, or returned results.

Describe domain concepts and data needs, not DTO/class/table inventories. Link to Architecture for storage, cache, schema, and mapper detail.

## Prohibited content

Do not invent:

- stakeholders, owners, roadmap, release cadence, priorities, KPIs, future To-Be flows;
- pain points or gap analysis without evidence;
- compliance obligations from a permission/API name alone;
- benefits or business rationale not stated or observable;
- separate “business domains” for every physical module.

If an important business fact is unavailable, say what evidence would be needed instead of guessing.

## Claim evidence gate

Before writing an observed business claim, require one of:

- UX/state evidence that reaches the visible state;
- public contract evidence that defines the returned result;
- runtime/graph plus defining source/config evidence that reaches the terminal effect.

Names, comments, README purpose, the start of a flow, or a call into an unavailable native/external boundary do not prove the terminal outcome. Describe the verified handoff and mark the downstream result unavailable.
