# Document Model and Selection

## Selection principle

Optimize for **coverage per document**, not document count. A physical module always receives an inventory entry, but a standalone file must add unique navigational or behavioral value.

## Mandatory outputs

| Scope | Business | Architecture |
|---|---|---|
| Workspace/System | Always | Always |
| Project in multi-project mode | Always; concise if technical-only | Always |
| Logical OpenHarmony subsystem | Normally none | Conditional roll-up |
| Module/build unit | Conditional | Conditional |
| GN target | None by default | Row/group by default |

## Standalone Architecture gate

Create a Module Architecture file when any applies:

- meaningful public/shared surface or multiple consumers;
- owns data/state/persistence or an external integration;
- contains a non-trivial runtime, lifecycle, state, or error flow;
- has distinct layers/responsibilities worth navigating;
- has unusual build/runtime/deployment constraints;
- has a local finding requiring evidence and context;
- is large enough that the parent Project Architecture would become dense.

Otherwise group it under an architectural area in Project/high-level Architecture with name, kind, path, responsibility, dependencies, and consumers.

## Standalone Business gate

Create a Module Business file when it owns a distinct:

- user-facing flow or UX state machine;
- OS/framework-facing behavior with observable outcomes;
- independently consumed API/library contract;
- business rule set or substantial subprocess.

Use `grouped` when it supports a wider capability but has no independently useful narrative. Use `none` only when it has no material observable contribution; still list its technical role in Architecture.

Do not write a fake mini-product description for utilities, build glue, variants, DTO-only modules, generated code, or low-level GN targets.

## Capability coverage

Every major capability must have exactly one detailed Business owner:

1. the owning Module Business file when one module cleanly owns it;
2. the Project Business file when behavior spans modules;
3. the high-level Business file when behavior genuinely spans Projects.

Child documents may describe their contribution and link upward; parent documents summarize and link downward. Do not duplicate the full flow.

## Required navigation

`docs/index.md` must contain:

- scope and selected revision;
- “Start here” links for Business and Architecture;
- Project inventory in multi-project mode;
- links to every generated standalone document;
- a short evidence/limitations note.

Every child document links to its parent and `docs/index.md`. Every parent inventory links to existing children and shows `Grouped` when no child file exists.

## Cross-document traceability

Use stable IDs only where they help:

- `CAP-<slug>` for major capabilities;
- `FLOW-<slug>` for important processes;
- `RULE-<slug>` for observable rules;
- `ARC-<slug>` for important architecture areas/flows.

Business documents map capabilities/flows/rules to owning Projects/modules. Architecture documents map those IDs to entry points, components, data/integration ownership, and validation evidence. Avoid heavyweight requirement matrices when the repository contains no requirements/test evidence.

## Density rules

- Prefer 4-7 architectural areas per Project/module view.
- Use tables only for repeated comparable records.
- Use prose for rationale and behavior.
- Omit empty conditional sections instead of writing “N/A” repeatedly.
- Keep inventories compact; put detailed flows in the owning document.
- Split a diagram when it needs more than about 15 nodes or crosses more than two hierarchy levels.

## Document control

At the top of every generated file include a compact metadata block:

```markdown
> Scope: `<relative path>`  
> Baseline: `<revision or working tree>`  
> Evidence: Observed / Declared / Inferred / Unavailable as noted  
> Parent: [Documentation index](relative-link)
```

Wrap generated content:

```html
<!-- PROJECTSPEC:GENERATED:START -->
...
<!-- PROJECTSPEC:GENERATED:END -->
```

Keep user-owned content outside the markers.
