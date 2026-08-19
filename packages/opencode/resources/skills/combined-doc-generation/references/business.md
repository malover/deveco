# Business Documentation

## Purpose

Business documentation explains the **As-Is product/domain behavior**: what the Project/module does, who/what triggers it, how important journeys proceed, what domain data matters, and what observable result or failure occurs.

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

Project `business.md` should cover:

- what the Project does and its observable boundary;
- primary users/actors/callers;
- main end-to-end journeys;
- major domain concepts/data;
- meaningful decisions/states/failure/recovery;
- how modules participate;
- grouped Business contributions from modules without standalone Business files;
- a small evidence section.

It should not repeat module Business docs. Summarize the child-owned step and link to it.

## Module Business — only when justified

A module Business document should normally contain this compact core:

1. role in the product/domain and boundary;
2. important user/domain flows;
3. business concepts/data;
4. rules/states/outcomes that materially affect behavior;
5. interaction with other modules only when needed to understand the journey;
6. source evidence.

Omit conditional sections instead of generating filler.

## UX-first reconstruction

When UI participates, trace only important journeys initially.

For each journey answer:

- where the user enters;
- visible starting state/data;
- action/interaction;
- navigation/state transition;
- business/service/data effect;
- loading/empty/error/permission/retry/cancel/back behavior when material;
- observable end state.

A useful representation is:

```text
Page/State
  -> User action
  -> Business operation
  -> Data/platform effect
  -> New state
  -> Visible outcome
```

Do not inventory every component/widget.

## Reconstruction without UX

For a non-UI module/Project, use a caller/domain journey:

```text
Trigger/caller
  -> validation/decision
  -> state/data operation
  -> integration/persistence effect
  -> result/callback/handoff
```

A storage or utility call by itself is not automatically Business. There should be a meaningful domain operation/outcome.

## Domain concepts versus technical models

Business uses domain language:

- `Photo`
- `Album`
- `EditSession`
- `ShareTarget`

Architecture may name implementation types:

- `PhotoEntity`
- `MediaViewModel`
- `MediaRepository`
- relational schema/DTO mapping.

Do not dump class fields/decorators into Business.

## Flows

Use a short heading and numbered steps. Include material alternatives inline or in a compact table.

A flow should reach either:

- an observed local user/caller/state/persistence outcome; or
- an exact platform/native/external handoff whose local contract is observed.

Do not claim the downstream external result if it is outside repository evidence.

## Rules and states

Document only decisions that explain observable behavior. Avoid creating a `RULE-*` ID system for every condition in V1.

Examples:

- selection is disabled while media is loading;
- edit confirmation persists a new revision;
- a permission denial returns the user to an explanatory state.

Keep implementation-only guards in Architecture/Governance unless they affect product behavior.

## Business diagrams

Use Mermaid when a journey has meaningful branching, state transitions, several actors, or module/platform handoffs. Project Business usually benefits from one primary end-to-end flow. Module Business gets a diagram only when the local journey is easier to understand visually.

Do not generate call graphs as Business diagrams.

## Evidence

Use a compact table or bullets with important anchors:

```text
entry/src/.../GalleryPage.ets#build
entry/src/.../GalleryViewModel.ets#loadAlbums
data/src/.../MediaRepository.ets#queryAlbums
```

Important claims should be traceable, but the prose should not look like a citation report.

## Prohibited content

Do not add:

- future requirements/roadmaps;
- speculative user value;
- exhaustive file/class inventories;
- DTO/schema dumps;
- generic best-practice advice;
- fake KPIs/SLAs;
- one-sentence sections created only to satisfy a template;
- a module Business document solely because the module exists.
