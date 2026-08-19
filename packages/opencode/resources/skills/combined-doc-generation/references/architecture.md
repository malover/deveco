# Architecture Documentation

## Primary purpose: prevent architecture drift

Architecture should let an implementation agent answer:

- Which module owns this concern?
- Which direction may dependencies point?
- Where is the source of truth/state/persistence owner?
- What existing path/pattern should a new feature extend?
- Which public/integration boundary must remain stable?
- Which Project `ARC-*`/`CHK-*` entries apply?

Do this without turning every module file into a giant governance manual.

## Module Architecture core

Every module Architecture contains a compact mandatory core:

1. **Purpose and Responsibilities** — what the module owns and deliberately does not own.
2. **Architecture and Dependencies** — internal shape, direct dependencies, known consumers, dependency direction.
3. **Runtime and Data Flow** — 1-3 representative flows sufficient to explain how the module actually works.
4. **Extension Guidance** — roughly 1-3 highly relevant implementation seams/reference patterns.
5. **Source Evidence** — small high-value anchor set.

Conditional sections may be added when substantial:

- State and Data Ownership
- Persistence and Consistency
- UI / Navigation Architecture
- External / Platform / Native Integrations
- Concurrency / Background Processing
- Testing / Build Patterns

Omit a conditional section if it would contain one generic sentence.

## Dependency direction

Every meaningful module Architecture should make direction explicit, for example:

```text
Depends on:
- media-data — repository/query contract
- common-ui — reusable visual primitives

Used by:
- entry — gallery/browse flow

Must not depend on:
- editor — would reverse the observed feature dependency
```

Only write `Must not depend on` when governance evidence supports it. Promote durable prohibition to `constraints-and-limitations.md`; module Architecture can link the relevant `ARC-*`.

## Runtime/data flow

Trace representative paths from real entry to effect:

```text
Ability/Page/Export
  -> ViewModel/Controller
  -> Domain/Repository/Service
  -> Persistence/Platform/External boundary
  -> State/callback/result
```

Explain important decisions, ownership changes, and error/recovery behavior. Do not enumerate internal helper calls unless they explain the architecture.

## State and data ownership

When applicable, identify:

- source of truth;
- mutation owner;
- transient versus persisted state;
- consumers/subscribers;
- transformation/mapping boundary;
- cache/invalidation/version behavior;
- transaction/order/concurrency semantics when evidenced.

Durable cross-module ownership rules belong as `ARC-*` entries in Project governance.

## Project Architecture

Project Architecture is compositional. It should answer:

- what the Project is at runtime/build level;
- which modules exist and why;
- responsibility/dependency direction among modules;
- major cross-module runtime/data/state flows;
- external/platform/native boundaries;
- where an agent should begin for common change areas.

Do not retell each module's internals.

Usually include one module/dependency Mermaid view. Add more only for a different architectural question that prose cannot explain compactly.

## Extension Guidance

This is a first-class drift-prevention mechanism, but keep it short.

For a module, choose only the highest-value items, typically 1-3:

- correct owner/seam for a common new behavior;
- existing reference implementation/pattern elsewhere;
- coupled artifacts that normally change together;
- local public/state/data boundary to preserve.

Example:

> New media filtering should enter through `MediaRepository` and follow the existing album-query path used by `<reference>`, rather than issuing persistence queries from ArkUI pages.

Do not add generic “use clean architecture” advice.

## Constraints stay separate

Architecture links Project `constraints-and-limitations.md`. Do not duplicate full:

- `ARC-*` invariants;
- `CHK-*` pre/post-change checks;
- `LIM-*` limitations.

A short local implication/link is fine when it is necessary to understand the module.

## Evidence

Prefer path + symbol/descriptor anchors. Examples:

- `entry/src/main/ets/pages/GalleryPage.ets#build`
- `data/src/main/ets/repository/MediaRepository.ets#query`
- `entry/src/main/module.json5`

Use exact source reads for claims HomeGraph does not establish precisely.
