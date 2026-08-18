# Document Model and Selection

## Structural baseline versus semantic plan

`bootstrap_projectspec.mjs` deterministically creates the initial inventory and plan from manifests, descriptors, declared surfaces, local dependency references, source counts, and file signals. This eliminates repeated LLM hierarchy/path planning.

The baseline cannot prove business ownership, runtime complexity, terminal outcomes, or architectural constraints. Enrich it once after representative semantic tracing. Every changed standalone decision must keep its evidence-based reason.

## Mandatory outputs

| Scope | Business | Architecture |
|---|---|---|
| Workspace/System or the sole Project | Always, substantive | Always, substantive |
| Independent Project in multi-project mode | Always; technical-only Projects may be concise but useful | Always |
| Logical OpenHarmony subsystem | Normally none | Conditional roll-up |
| Module/build unit | Conditional | Conditional |
| GN target | None by default | Inventory row by default |

Every physical unit appears in an Architecture inventory. This does not imply one file per unit.

## Standalone Architecture gate

Keep/create a Module Architecture document only when evidence shows one or more:

- public/shared API, inner kit, native bridge, or multiple consumers;
- ownership of state, persistence, cache, schema, or external integration;
- non-trivial lifecycle/runtime/state/error behavior;
- distinct internal layers/responsibilities and modification seams;
- unusual build/device/product/native/security/resource constraints;
- change blast radius or local architectural finding needing detail;
- enough unique substance that the parent’s constraints/flows would become dense.

A large file count is only a candidate signal. Descriptor metadata and directory listings alone do not justify a standalone document.

## Standalone Business gate

Keep/create a Module Business document only when the module cleanly owns:

- a distinct user-facing UX/state journey;
- OS/framework/system behavior with observable outcomes;
- an independently consumed API/library contract;
- a substantial subprocess or coherent rule set.

Distributed capabilities belong in the narrowest parent or a capability document. Utilities, DTO-only modules, build glue, variants, generated code, and low-level targets remain Architecture inventory/group content unless behavior proves otherwise.

## Capability document gate

Create a dedicated capability Business file only when:

- the capability spans multiple modules/Projects;
- it has a complete independent journey and substantial rules/state/failure detail;
- embedding it with several other major flows would make the parent hard to use.

Semantic documents never become physical Projects/modules.

## Substance gate

A standalone file must contain more than metadata/navigation. Before retaining it, confirm it can materially fill:

- Business: value, actor/caller, UX/system journey, complete flow, states, rules, data/systems, failures/recovery, terminal outcome, traceability, evidence/limitations.
- Architecture: boundary/responsibility, source ownership map, entry/public surfaces, consumers/dependencies, runtime/data flows, build/test posture, architectural constraints/invariants, extension points, limitations, and change guardrails.

If not, consolidate into the parent and mark the unit `Grouped`.

## Capability ownership and traceability

Every major `CAP-*` has exactly one detailed Business owner. Every flow/rule maps to Architecture owners and representative evidence/tests when present. Child documents explain local contribution; parents synthesize cross-boundary behavior.

The final plan must account for all deterministic capability candidates as major, sub-capability, technical-support, or excluded with reason. This gives coverage without creating files per route/test/module.

## Required navigation

`docs/index.md` includes scope/revision, Business/Architecture start links, Project/module inventory, and links to every standalone document. It remains concise.

Every child links to parent and index. Every parent inventory links to children and labels grouped units. Navigation must never replace substantive content in Business/Architecture documents.

## Density and duplication

- Prefer 4-7 architectural areas per view.
- Use tables for comparable records, prose for behavior/implications, numbered steps for flows, and diagrams for relationships/state.
- Put detail once at the lowest useful owner; parent summaries must explain implications, not repeat the child.
- Consolidate documents with repeated template language or fewer than two unique behavioral/architectural findings.
- Split diagrams above roughly 15 nodes or two hierarchy levels.

## Document control

Each generated file starts with scope, baseline, evidence policy, parent links, and coverage notes. Wrap one generated region in:

```html
<!-- PROJECTSPEC:GENERATED:START -->
...
<!-- PROJECTSPEC:GENERATED:END -->
```

Preserve all user-owned content outside markers.
