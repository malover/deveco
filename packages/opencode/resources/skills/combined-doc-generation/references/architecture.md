# Architecture Documentation

## Primary purpose: enable safe implementation and prevent drift

Architecture should let an implementation agent answer:

- Which module owns this concern?
- Which way may dependencies point?
- Where is state/data/persistence owned?
- How does a representative request/UX action move through this module?
- Which existing repository pattern should a new feature follow?
- Which public/native/platform boundary must remain stable?
- Which Project `ARC-*`/`CHK-*` rules apply?

Do this without turning each file into a giant governance manual.

## Module Architecture core

Every module Architecture has:

1. **Purpose and Responsibilities** — ownership and deliberate non-ownership.
2. **Architecture and Dependencies** — internal shape, direct dependencies, known consumers, direction.
3. **Runtime and Data Flow** — representative entry-to-effect paths; use more than one where complexity warrants it.
4. **Extension Guidance** — a few concrete seams/reference patterns/coupled artifacts.
5. **Source Evidence** — connected high-value anchors.

## Conditional sections: include when implementation-impacting

Use the module analysis packet's `conditionalSections`.

Supported headings:

- `State and Data Ownership`
- `Persistence and Consistency`
- `UI / Navigation Architecture`
- `External / Platform / Native Integrations`
- `Concurrency / Background Processing`
- `Testing / Build Patterns`

Do not suppress a section merely because it could be summarized in a sentence elsewhere. If a feature agent must understand the topic to choose the right owner/path, the section is useful.

Examples:

- several FSM/state managers -> explain responsibility split and transitions in `State and Data Ownership`;
- editor native bridge + save lifecycle -> `External / Platform / Native Integrations` and/or `Persistence and Consistency`;
- ability/page loaders/navigation -> `UI / Navigation Architecture`;
- shared data source/cache/invalidation -> `State and Data Ownership`/`Persistence and Consistency`.

## Dependency direction

Make direction explicit:

```text
Depends on:
- media-data — repository/query contract

Used by:
- entry — gallery flow
```

Use `Must not depend on` only when an evidenced governance rule supports it; link the `ARC-*` instead of copying the full rule.

## Runtime/data flow

Trace real paths:

```text
Ability/Page/Export
  -> Controller/ViewModel
  -> State/Domain/Repository/Service
  -> Persistence/Platform/Native boundary
  -> State/callback/result
```

For important modules, cover the distinct flows needed to explain architecture, including lifecycle/save/refresh/error handoffs where they materially differ. Do not stop at one happy path just to remain short.

## State/data ownership

When applicable explain:

- source of truth;
- mutation owner;
- state-machine responsibilities/transitions;
- transient vs persisted data;
- subscribers/reactive propagation;
- cache/invalidation/version behavior;
- lifecycle reset/resume/reload;
- ordering/concurrency assumptions.

Promote durable cross-module ownership rules to Project governance.

## Project Architecture

Project Architecture is compositional. It should answer:

- Project runtime/build boundary and main entry points;
- which modules exist and why;
- dependency/ownership direction;
- major cross-module runtime/data/state flows;
- important platform/native/external boundaries;
- where an agent should start for common change areas.

Do not retell module internals.

Usually include one module/dependency Mermaid diagram. Add another only when it explains a distinct architectural question.

## Extension Guidance

Keep it short but concrete. Prefer a few high-value items:

- correct owner/seam for a common change;
- analogous implementation/shared base/repository path found in the explicit reference search;
- coupled artifacts or registrations that normally change together;
- local public/state/data/native boundary to preserve.

Example:

> Add media filtering through `MediaRepository` and follow the existing album-query path used by `<reference>`, rather than querying persistence from an ArkUI page.

Never use generic advice such as “follow clean architecture.”

## Architecture Mermaid

When `diagramDecision.architecture=required`, include a compact Mermaid diagram for the non-obvious module relationship/runtime/state question. Quote all human-readable labels using `references/diagrams.md`.

Complex/deep modules with multiple state owners or native/module handoffs usually benefit from one.

## Constraints stay separate

Architecture links Project `constraints-and-limitations.md`. Do not duplicate the full `ARC-*`, `CHK-*`, or `LIM-*` registry.

## Evidence

Evidence should support the important claims discovered by analysis, not merely list three files.

Prefer path + symbol/descriptor anchors and explain what each establishes. Deep modules often require several connected anchors covering entries, state/data, flow, integration, and extension patterns; keep the published set curated.
