# Document Model and Selection

## Fixed V1 Project structure

Every verified Project always owns:

```text
architecture.md
business.md
constraints-and-limitations.md
modules/<module>/architecture.md
```

A module owns `business.md` only when semantic analysis justifies it.

No repository-wide Business/Architecture layer is generated for multi-Project repositories. No standalone source-tree, UX-flow, data-model, localization, test-strategy, integration, or deployment document is generated; useful content from those analyses is folded into Business/Architecture/Governance at the correct scope.

## Project Business is always the fallback owner

Project Business is both:

- the high-level product/system synthesis for the Project;
- the owner for meaningful behavior from modules too small/technical to justify a standalone Business document.

This prevents both business-document explosion and loss of relevant behavior.

## Module Business classification

Every module gets exactly one semantic role after deep analysis:

### `behavior-owner`

Use when the module owns substantial independently understandable behavior, especially:

- a user-facing UX/navigation/state journey;
- a domain workflow with observable outcome;
- meaningful service/business decisions associated with an externally visible operation;
- a domain/data lifecycle that is more than storage mechanics.

A standalone module Business document is expected.

### `supporting-behavior`

Use when the module contributes meaningful behavior to a larger Project journey but does not cleanly own the overall capability.

Create standalone module Business **only** when its contribution is substantial and independently understandable. Otherwise Project Business explains the contribution in the parent journey.

Examples that may remain grouped:

- synchronization step used only as part of one Project flow;
- repository transformation important to outcome but not a useful product capability by itself;
- small validation/state transition helper with meaningful effect.

### `architecture-only`

Use for technical behavior without a useful standalone business narrative, including:

- data/repository/storage plumbing;
- DTO/entity/model-only code;
- cache/logger/router/helper utilities;
- resources/build glue/generated code;
- low-level build targets without independent domain behavior.

No module Business file.

## V1 classification signals

Stay deliberately close to the older deep/full scan rather than inventing a complex business ontology.

Primary signals:

1. **UX evidence** — pages/components/abilities/navigation/state/interaction journey.
2. **Domain/data-model evidence** — meaningful domain entities plus lifecycle/workflow/decisions and observable outcome.
3. **Service/business-logic evidence** — meaningful operation/decision logic traced to a user/system result.

Weak evidence such as names, file count, folder `feature`, or model definitions alone is insufficient.

The enriched plan must store:

- `businessRole`;
- `businessDetail`: `standalone | project-grouped | none`;
- `businessRationale` with evidence anchors;
- `businessOwnerDocument` only for `standalone`.

## Module Architecture

Every physical module/build unit gets Architecture in V1. This includes ArkTS HAP/HAR/HSP modules and discovered OpenHarmony GN build units.

The document can be short, but must contain unique implementation value. Omit conditional sections; never omit the core responsibility/dependency/flow/extension/evidence contract.

## Rare capability file gate

A dedicated `capabilities/<id>/business.md` is an escape hatch, not a normal output.

Create one only when all are true:

- the flow spans multiple modules and no module is a sensible detailed owner;
- it contains enough state/rules/failure detail to be independently useful;
- Project Business would become materially harder to use or duplicate child detail if it owned the full flow.

Otherwise keep the end-to-end journey in Project Business.

## Slim-document rule

A useful document is not judged by section count.

- Mandatory core headings stay.
- Conditional headings are omitted entirely when not useful.
- A heading that would contain one generic sentence should normally be removed or folded into a neighboring section.
- Tables are for comparable facts, prose for why/how, numbered steps for flows, Mermaid for structure/state/branching.
- Avoid class/export/file inventories except a small evidence/ownership table.

## Detail placement

Put detail once at the lowest scope where it is useful:

- module Architecture — local implementation/ownership/extension detail;
- module Business — substantial locally owned UX/domain journey;
- Project Architecture — composition and cross-module direction;
- Project Business — Project journeys and grouped module contributions;
- constraints registry — durable architectural rules/checks/limitations.

Parents synthesize implications; they do not repeat child documents.

## Generated markers

Generated files contain exactly one region:

```html
<!-- PROJECTSPEC:GENERATED:START -->
...
<!-- PROJECTSPEC:GENERATED:END -->
```

Future iterative updates replace only this region. Developer-maintained content outside markers is preserved.
