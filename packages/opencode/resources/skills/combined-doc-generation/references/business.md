# Business Documentation

## Purpose

Business documentation explains **As-Is product/domain behavior**: what the Project/module does, who/what triggers it, how important journeys proceed, what data/states/decisions matter, and what observable result or failure occurs.

It should be understandable without reading ArkTS implementation details.

## Evidence order

Prefer:

1. UX/navigation/state behavior for user-facing journeys;
2. meaningful domain/data-model lifecycle for non-UI behavior;
3. public/system/service contract for caller-facing operations;
4. HomeGraph runtime paths for sequence/ownership;
5. exact source/config for decisions, persistence effects, permissions, and failure semantics;
6. representative tests for outcomes/branches;
7. README/design prose for declared purpose only.

## Project Business — always

Project `business.md` covers:

- what the Project does and its observable boundary;
- primary users/actors/callers;
- main end-to-end journeys;
- major domain concepts/data;
- meaningful decisions/states/failure/recovery;
- module participation;
- grouped Business contributions from modules without standalone Business;
- compact evidence.

It should not repeat module Business. Summarize a child-owned step and link to the child.

## Module Business — only when justified

A standalone module Business normally contains:

1. role in product/domain and boundary;
2. important user/domain flows;
3. domain concepts/data;
4. observable rules/states/outcomes;
5. cross-module interaction only when needed for the journey;
6. source evidence.

Use UX + meaningful domain/data-model discovery as the primary V1 decision signal, following the older deep approach.

## UX-first reconstruction

For each important journey answer:

- entry screen/state;
- visible starting data/state;
- user action;
- navigation/state transition;
- business/service/data effect;
- observable end state.

For deep UI modules, inspect meaningful variants and states discovered in analysis. Examples may include loading/empty, selection modes, permissions, back/cancel/dismiss, unsupported input, error/retry, save/refresh. Include only evidenced branches.

A useful shape:

```text
Page/State
  -> User action
  -> Business operation
  -> Data/platform effect
  -> State transition
  -> Visible outcome
```

Do not inventory every component/widget.

## Reconstruction without UX

Use a domain/caller journey:

```text
Trigger/caller
  -> validation/decision
  -> state/data operation
  -> integration/persistence effect
  -> result/callback/handoff
```

Storage or utility calls alone do not create Business behavior.

## Domain concepts vs technical models

Business uses domain language (`Photo`, `Album`, `EditSession`, `ShareTarget`). Architecture may name `PhotoEntity`, `MediaViewModel`, repositories, DTO/schema mappings.

Do not dump decorators/fields/technical schema into Business.

## Flows and outcomes

A flow reaches either:

- an observed local user/caller/state/persistence outcome; or
- an exact external/platform/native handoff whose local contract is observed.

Do not claim unobserved downstream behavior.

Do not force every journey into exactly three steps. Use enough steps to explain the meaningful behavior without reproducing implementation call graphs.

## Business diagrams

When `diagramDecision.business=required`, include a compact Mermaid flow/state diagram. Project Business usually benefits from one main end-to-end flow; module Business uses Mermaid when branching/state/handoffs are easier to understand visually.

Quote all labels conservatively.

## Evidence

Use a compact table/bullets with high-value anchors. Important claims should be traceable, but prose should remain a product/domain explanation rather than a citation report.

## Prohibited content

Do not add:

- future requirements/roadmaps;
- speculative user value;
- exhaustive file/class inventories;
- DTO/schema dumps;
- generic best practices;
- fake KPIs/SLAs;
- filler headings;
- module Business solely because a module exists.
