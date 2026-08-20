# Architecture and drift-prevention views

Project Architecture composes module maps; module Architecture is the detailed
implementation-facing map. Include only descriptive architecture and links to governance.

Required at the appropriate zoom: physical module/build inventory, ownership and
non-responsibility, entry/lifecycle/public contracts and consumers, dependency direction,
cross-boundary contract types, runtime/control and data flows, lifecycle/state/data scopes,
source of truth/mutation owner/persistence/cache/invalidation/transforms, consistency/order /
concurrency/schema behavior, platform/native/external boundaries, permissions/callbacks /
events/error mapping, conditional UI/localization/testing/build sections, extension points,
reference implementations, coupled artifacts, and blast radius.

## Scope matrix

Every Project and substantial module uses a compact matrix with rows for:

| Dimension | Owning scope | Boundary / source of truth | Change implication |
|---|---|---|---|
| Ownership | ... | ... | ... |
| Runtime/lifecycle | ... | ... | ... |
| State/data | ... | ... | ... |
| Public/dependency contract | ... | ... | ... |

Generate diagrams only from verified evidence: module/dependency map, data/runtime/sequence /
state flow, or a small selective `classDiagram` that answers an ownership/contract/state
question. Never emit a complete class inventory. Quote human-readable labels conservatively.
