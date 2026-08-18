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
