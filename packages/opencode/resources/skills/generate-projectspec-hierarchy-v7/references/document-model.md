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

Governance output is separate: one `constraints-and-limitations.md` per Project, plus one root cross-Project registry in multi-project mode. Module rules are scoped entries in their Project registry, not standalone files.

## Standalone Architecture gate

Keep/create a Module Architecture document only when evidence shows one or more:

- public/shared API, inner kit, native bridge, or multiple consumers;
- ownership of state, persistence, cache, schema, or external integration;
- non-trivial lifecycle/runtime/state/error behavior;
- distinct internal layers/responsibilities and modification seams;
- unusual build/device/product/native/security/resource constraints;
- change blast radius or local architectural finding needing detail;
- enough unique substance that the parent’s ownership/runtime explanation would become dense.

A large file count is only a candidate signal. Descriptor metadata and directory listings alone do not justify a standalone document.

## Standalone Business gate

Keep/create a Module Business document only when the module cleanly owns:

- a distinct user-facing UX/state journey;
- OS/framework/system behavior with observable outcomes;
- an independently consumed API/library contract;
- a substantial subprocess or coherent rule set.

Distributed capabilities belong in the narrowest parent or a capability document. Utilities, DTO-only modules, build glue, variants, generated code, and low-level targets remain Architecture inventory/group content unless behavior proves otherwise.

### Module Business classification

Every module with standalone Architecture must receive exactly one semantic Business role during enrichment:

- `behavior-owner`: owns a distinct observable capability, operation, UX/system journey, or independently consumed contract.
- `supporting-behavior`: owns an observable subprocess, rule set, validation/data transformation, persistence effect, platform handoff, or recovery behavior within a parent capability.
- `architecture-only`: architecturally significant but without an independent Business narrative, including utilities, DTO/model-only units, resources, generated code, variants, build glue, and low-level targets.

The bootstrap may mark the role `pending` but must not infer the final role from filenames, file counts, or declared UI surfaces. `behavior-owner` and `supporting-behavior` require a module Business document; `architecture-only` must remain in Architecture inventories and may link to its parent Business owner. Supporting behavior must link to its parent `CAP-*` or `FLOW-*` and must not invent an independent actor or value proposition.

The enriched plan records `businessOwnerDocument` and, for supporting behavior, `parentBehavior`. Every module Business owner must be a unique path in `plan.documents`, exist, and identify itself with separate `> Module ID:`, `> Business role:`, and `> Parent behavior:` lines. The ID and role must exactly match the module plan record. Supporting owners use one `CAP-*`/`FLOW-*` parent in both places; behavior owners use `None — owns ...`. Pending or invalid roles and `architecture-only` cannot have a Business owner.

## Capability document gate

Create a dedicated capability Business file only when:

- the capability spans multiple modules/Projects;
- it has a complete independent journey and substantial rules/state/failure detail;
- embedding it with several other major flows would make the parent hard to use.

Semantic documents never become physical Projects/modules.

## Substance gate

A standalone file must contain more than metadata/navigation. Before retaining it, confirm it can materially fill:

- Business: value, actor/caller, UX/system journey, complete flow, states, rules, data/systems, failures/recovery, terminal outcome, traceability, evidence/limitations.
- Architecture: boundary/responsibility, source ownership map, entry/public surfaces, consumers/dependencies, runtime/data flows, build/test posture, extension points, governance link, and evidence.
- Constraints/limitations: applicability, scoped `ARC-*` rules with basis/evidence/verification, scoped `LIM-*` entries with impact/exact unknown, `CHK-*` checks, and Architecture/capability traceability.

If not, consolidate into the parent and mark the unit `Grouped`.

## Capability ownership and traceability

Every major `CAP-*` has exactly one detailed Business owner. Detailed ownership is declared only by a heading beginning with `CAP-*`, `FLOW-*`, or `RULE-*`; portfolio rows, links, examples, and prose mentions are references, not ownership. Each explicit `FLOW-*` and `RULE-*` detailed heading occurs in only one Business document. Every flow/rule maps to Architecture owners and representative evidence/tests when present. Child documents explain local contribution; parents synthesize cross-boundary behavior.

The enriched plan records major journeys in `flows` with `id`, `major`, `owner_document`, `diagram_decision`, and `diagram_reason`. `required` identifies the detailed owner containing the flow-local Mermaid block; `not-useful` supplies the reason and requires no diagram. Unknown decisions and empty reasons are invalid.

The final plan must account for all deterministic capability candidates as major, sub-capability, technical-support, or excluded with reason. This gives coverage without creating files per route/test/module.

## Required navigation

`docs/index.md` includes scope/revision, Business/Architecture/governance start links, Project/module inventory, and links to every standalone document. It remains concise.

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
