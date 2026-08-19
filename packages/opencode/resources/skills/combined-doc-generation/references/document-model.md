# Document Model and Selection

## Fixed V1 structure

Every verified Project owns:

```text
architecture.md
business.md
constraints-and-limitations.md
modules/<module>/architecture.md
```

A module owns `business.md` only when semantic analysis justifies it.

Repository root always owns `index.md`, synthesized from `.projectspec` analysis metadata and links to generated docs.

No repository-wide Business/Architecture layer is generated for multi-Project repositories. Do not create standalone source-tree, UX-flow, data-model, localization, test-strategy, integration, or deployment docs; useful material from those analyses belongs inside Architecture/Business/Governance at the correct scope.

## Project Business is always the fallback owner

Project Business is both:

- high-level product/system synthesis for the Project;
- owner for meaningful behavior from modules too small/technical to justify standalone Business.

This prevents both document explosion and lost behavior.

## Module Business classification

Every module gets one role after its just-in-time deep analysis.

### `behavior-owner`

Use when the module owns substantial independently understandable behavior, especially:

- a user-facing UX/navigation/state journey;
- a domain workflow with observable outcome;
- meaningful service/business decisions associated with an externally visible operation;
- a domain/data lifecycle that is more than storage mechanics.

Standalone module Business is expected.

### `supporting-behavior`

Use when the module contributes meaningful behavior to a larger Project journey but does not cleanly own the overall capability.

Create standalone Business only when the contribution is substantial and independently understandable. Otherwise use `businessDetail=project-grouped` and cover it in Project Business.

### `architecture-only`

Use for technical behavior without useful standalone Business narrative:

- data/repository/storage plumbing by itself;
- DTO/entity/model-only code;
- cache/logger/router/helper utilities;
- resources/build glue/generated code;
- low-level adapters/build targets without independent domain behavior.

No module Business file.

## V1 Business signals

Stay close to the older deep/full-scan discovery model rather than inventing a complex business ontology.

Primary signals:

1. **UX evidence** — pages/components/abilities/navigation/state/interaction journey.
2. **Domain/data-model evidence** — meaningful domain entities plus lifecycle/workflow/decisions and observable outcome.
3. **Service/business-logic evidence** — meaningful operation/decision logic traced to a user/system result.

Names, file count, a `feature/` folder, or model definitions alone are not enough.

The enriched plan stores:

- `businessRole`;
- `businessDetail`: `standalone | project-grouped | none`;
- `businessRationale`;
- `businessOwnerDocument` only for standalone Business;
- `analysisDepth`: `focused | standard | deep`.

## Analysis packet is part of the document contract

Each Project has a compact `.projectspec/analysis/<project>.json`. This is not published prose; it is the reusable semantic state from which module/Project docs and `index.md` are produced.

A module packet contains responsibility, role/detail, entries, dependencies/consumers, flows, state/data owners, integrations, reference patterns, conditional-section decisions, diagram decision, governance candidates, evidence, and completion status.

Do not write module docs before this packet is complete.

## Module Architecture

Every physical module/build unit gets Architecture in V1.

The document can remain short for a focused helper, but deep modules should contain the implementation-relevant detail discovered by analysis rather than collapsing everything into the five core headings.

Conditional sections are **positive choices**, not exceptional escapes. If state/data/persistence/UI/native/concurrency/testing behavior affects implementation decisions, include the corresponding section.

## Rare capability file gate

A dedicated `capabilities/<id>/business.md` is an escape hatch only when all are true:

- the process genuinely spans modules with no sensible detailed module owner;
- it contains enough state/rule/failure detail to stand alone;
- putting full detail in Project Business would make that file materially harder to use or force duplication.

Otherwise keep the journey in Project Business.

## Repository index

`docs/index.md` is navigation plus compact semantic metadata, not another high-level Architecture/Business doc.

It should surface:

- repository summary/workspace mode/revision;
- each Project's type, short purpose, technology, and Project doc links;
- each module's responsibility, Business role, key entry surfaces, and Architecture/Business links;
- cross-Project relationships when present.

The index is built from `repository-intelligence.json`, Project analysis JSON, and `documentation-plan.json`. Do not ask the model to rediscover this data.

## Slim-document rule

Useful documentation is not judged by word count or section count.

- Mandatory core headings stay.
- Conditional headings are included when they carry implementation-impacting information.
- Remove true filler, not useful state/data/lifecycle detail.
- Tables are for comparable facts, prose for implications, steps for flows, Mermaid for non-obvious structure/state/branching.
- Avoid exhaustive class/export/file inventories.

## Detail placement

Put detail once at the lowest useful scope:

- module Architecture — local implementation/ownership/state/extension detail;
- module Business — substantial locally owned UX/domain journey;
- Project Architecture — composition and cross-module direction;
- Project Business — Project journeys and grouped module contributions;
- Project governance — durable rules/checks/limitations;
- repository index — concise analysis-derived map/links.

Parents synthesize implications rather than copying children.

## Generated markers

Generated Markdown contains exactly one region:

```html
<!-- PROJECTSPEC:GENERATED:START -->
...
<!-- PROJECTSPEC:GENERATED:END -->
```

Future iterative updates replace only this region and preserve developer content outside it.
