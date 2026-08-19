# Deep Analysis Policy

This reference carries forward the useful parts of the older deep/full-scan approach without its exhaustive file-by-file documentation.

## Principle

**Discover deeply; publish selectively.**

The older approach was valuable because it did not stop at filenames. It traced relationships, data flow, UI/state behavior, integrations, and similar implementations. Preserve that depth. Drop the requirement to read and describe every file.

## 1. Establish the module boundary

Use deterministic inventory + `homegraph_files` scoped to the verified module path to understand what is physically owned.

Capture only a compact internal inventory:

- descriptors/build target;
- entry/public/lifecycle surfaces;
- controllers/view models/state owners;
- domain/data models;
- persistence/repository/data-source owners;
- external/native/platform integration owners;
- representative tests;
- resources/config only when behaviorally relevant.

Do not emit this inventory verbatim into Markdown.

## 2. Analyze relationships and data flow

Use HomeGraph first to reconstruct the module's meaningful execution paths.

For each representative flow, identify:

1. real trigger/caller;
2. entry symbol/ability/page/service;
3. orchestration steps;
4. state reads/writes and transformations;
5. persistence/cache access;
6. events/callbacks/IPC/platform/external calls;
7. local terminal effect or exact handoff;
8. material error/cancel/retry/recovery behavior.

Record integration points when relevant:

- external/platform APIs;
- sibling module APIs;
- shared state;
- events published/subscribed;
- database/persistence ownership;
- native bridge calls.

Prefer one or a few representative flows over a call graph for every function.

## 3. UX-first discovery when UI exists

This is a primary V1 Business signal.

Identify:

- ArkUI pages/components/abilities or equivalent user-facing entry surfaces;
- navigation operations and back/dismiss/cancel paths;
- state owners (`@State`, observed models, ViewModels, storage-backed state, etc.);
- conditional rendering and loading/empty/error/permission/success states;
- user actions -> state/business operation mapping;
- data displayed/edited/selected;
- observable result after each important journey.

Trace important journeys end to end:

```text
screen/state
  -> user action
  -> controller/view model/service
  -> data/integration effect
  -> state/result
  -> visible/caller outcome
```

Do not document every widget. A UI-heavy module normally needs only its important journeys initially; deepen only where product behavior would otherwise be ambiguous.

## 4. Domain/data-model discovery

This is the second primary V1 Business signal.

Find models/entities/state objects that carry domain meaning, then determine:

- who creates/loads them;
- who mutates them;
- who consumes/displays them;
- important relationships/lifecycles;
- persistence-visible effects;
- decisions/rules based on them.

Business docs use **domain concepts** (`Photo`, `Album`, `EditSession`), not implementation dumps (`PhotoEntity`, DTO fields, decorator syntax).

Architecture docs may name concrete entities/view models/repositories when needed to explain ownership and flow.

A module containing only DTO/entity/schema definitions or repository plumbing does not automatically deserve a Business document.

## 5. State management

When applicable, identify:

- source of truth;
- mutation owner;
- reactive propagation/subscribers;
- lifecycle/reset/invalidation behavior;
- persisted versus transient state;
- concurrency/order assumptions visible in code.

State ownership is often a high-value architecture-drift constraint. Promote durable cross-module ownership rules to the Project governance registry rather than repeating them in every Architecture file.

## 6. Related code and reference implementations

Actively search **outside the current module** for similar or shared patterns.

Use:

- domain/symbol search from the current flow;
- callers/callees that cross module boundaries;
- shared base classes/facades/repositories/state patterns;
- similar features/pages/services elsewhere;
- representative tests that demonstrate the established approach.

Select only 1-3 high-value references for module Extension Guidance, for example:

> New media filtering should follow the existing `AlbumQuery -> MediaRepository -> DataSource` path used by `<reference>` rather than querying persistence from the UI.

Do not generate speculative “reuse opportunities” or generic design advice.

## 7. Tests and verification patterns

Find representative tests when they help establish:

- observable outcomes;
- state transitions;
- error branches;
- public contract behavior;
- how a change in this area is normally verified.

Do not create a standalone test-strategy document. Put only the locally useful testing pattern in Architecture/Change Checks.

## 8. Evidence verification

Use precise source/config reads for claims HomeGraph cannot prove exactly, especially:

- constants/thresholds;
- permission/security enforcement;
- schema/serialization details;
- exact return/callback behavior;
- error handling/recovery;
- build flags/product variants;
- platform/native boundaries.

Every direct read should answer a named unresolved question.

## 9. Internal analysis packet

Keep a compact reusable packet per module in `.projectspec/analysis/<project>.json`:

```json
{
  "moduleId": "...",
  "responsibility": "...",
  "businessRole": "behavior-owner | supporting-behavior | architecture-only",
  "businessRationale": ["UX flow ...", "domain lifecycle ..."],
  "entrySurfaces": [],
  "dependencies": [],
  "consumers": [],
  "flows": [],
  "stateDataOwners": [],
  "integrations": [],
  "referencePatterns": [],
  "constraintCandidates": [],
  "evidence": []
}
```

Do not store full source text, exhaustive per-file summaries, or raw HomeGraph response dumps.
