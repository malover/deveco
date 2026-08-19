# Deep Analysis Policy

The older deep/full-scan approach was valuable because it traced behavior rather than stopping at directory structure. Keep that semantic depth while avoiding exhaustive file-by-file documentation.

## Core principle

**Discover deeply just before writing; publish selectively.**

Repository intelligence gives structural orientation. It is not enough to write every module from memory. Each module receives its own bounded HomeGraph analysis immediately before its docs are produced.

## 1. Analysis depth

Choose one depth after combining deterministic signals with the first HomeGraph neighborhood.

### `deep`

Use for modules that are architecturally or behaviorally important, including:

- `behavior-owner` modules;
- Project entry/HAP/orchestration/ability composition;
- shared state/data/persistence foundations;
- native/platform/external integration boundaries;
- state-machine-heavy modules;
- high fan-in/fan-out shared modules;
- large modules where many consumers or extension seams converge.

A deep module requires **two or more distinct HomeGraph passes** before writing.

### `standard`

Use for substantial supporting behavior or technical modules with meaningful runtime/data relationships. Perform one strong overview plus targeted gap/reference searches.

### `focused`

Use only for narrow architecture-only helpers/adapters/build units with small blast radius. One bounded pass plus exact verification is usually enough.

Do not equate file count with importance. A small public adapter may still be deep if it is an architectural seam.

## 2. Pass 1 — ownership and runtime

Use deterministic inventory + `homegraph_files`/anchored exploration to establish:

- descriptors/build target and real public/entry/lifecycle surfaces;
- responsibility and explicit non-responsibilities;
- direct dependencies and consumers;
- controllers/view models/state owners;
- domain/data models;
- persistence/repository/data-source ownership;
- external/native/platform integration owners;
- representative tests when useful;
- one or more entry-to-effect runtime/UX paths.

Do not publish a full file inventory.

## 3. Pass 2 — enrichment for deep modules

A deep module must receive a second bounded pass that targets questions the first pass cannot answer richly enough.

### 3.1 Reference implementations and related paths

Search outside the current module for:

- analogous pages/features/services;
- shared base classes/facades;
- established repository/state/data access paths;
- registration/extension patterns;
- representative tests demonstrating the expected shape.

Record a few useful patterns, not every similar symbol. If no useful reference exists, record that the search was performed and why no pattern was selected.

### 3.2 State, data, lifecycle, and state machines

When detected, resolve:

- source of truth;
- mutation owner;
- subscribers/reactive propagation;
- persisted vs transient state;
- cache/invalidation/version semantics;
- lifecycle reset/resume/reload behavior;
- concurrency/order assumptions;
- state-machine responsibility split and important transitions.

A module with multiple state managers/FSMs should explain how their responsibilities divide rather than merely listing their names.

### 3.3 Flow richness

For representative behavior, go beyond nominal success when evidence exposes material variants:

- loading/empty states;
- selection/multi-select modes;
- permission denied/granted;
- cancel/back/dismiss;
- invalid/unsupported input;
- retry/recovery;
- external/native handoff and return path;
- save/persist/refresh lifecycle.

Do not manufacture branches that are not evidenced.

### 3.4 Blast radius and extension seams

Use callers/impact/related symbols as needed to identify:

- stable public contracts;
- consumers affected by a change;
- coupled artifacts that usually change together;
- dependency directions that must remain intact;
- module/project `ARC-*` and `CHK-*` candidates.

## 4. UX-first discovery

UX is a primary V1 Business signal.

Identify:

- ArkUI pages/components/abilities or equivalent entry surfaces;
- navigation and back/dismiss/cancel behavior;
- state owners and visible states;
- user action -> controller/view model/service mapping;
- displayed/edited/selected domain data;
- loading/empty/error/permission/success states;
- observable result of each important journey.

Trace important journeys:

```text
screen/state
  -> user action
  -> controller/view model/service
  -> data/integration effect
  -> state transition
  -> visible/caller outcome
```

Do not document every widget. Deep UI modules may need several meaningful flows/states rather than one happy-path flow.

## 5. Domain/data-model discovery

This is the second primary V1 Business signal.

Find domain-significant models/entities/state objects and determine:

- who creates/loads them;
- who mutates them;
- who consumes/displays them;
- meaningful relationships/lifecycles;
- persistence-visible effects;
- decisions/rules based on them.

Business uses domain concepts (`Photo`, `Album`, `EditSession`). Architecture may name implementation types (`PhotoEntity`, `MediaViewModel`, repositories, schemas) where they explain ownership.

Models/storage alone do not justify module Business.

## 6. Relationships and data flow

For each representative technical flow identify:

1. trigger/caller;
2. entry symbol/ability/page/service;
3. orchestration owner;
4. state reads/writes/transformations;
5. persistence/cache access;
6. events/callbacks/IPC/platform/native calls;
7. local terminal effect or exact handoff;
8. material failure/cancel/retry/recovery behavior.

Prefer a few explanatory paths over an exhaustive call graph.

## 7. Conditional Architecture topics

During analysis explicitly record implementation-impacting topics using the exact Architecture headings that should be included:

- `State and Data Ownership`
- `Persistence and Consistency`
- `UI / Navigation Architecture`
- `External / Platform / Native Integrations`
- `Concurrency / Background Processing`
- `Testing / Build Patterns`

If a topic materially changes where/how an agent should implement a feature, include it. Do not omit it simply because a sentence could be folded into `Runtime and Data Flow`.

If the topic is genuinely irrelevant or trivial, leave it out.

## 8. Diagram decision

For each module record:

```json
{
  "diagramDecision": {
    "architecture": "required | not-useful",
    "business": "required | not-useful",
    "reason": "..."
  }
}
```

Architecture Mermaid is usually useful for deep modules with multiple state owners, module/platform/native handoffs, or non-obvious runtime paths. Business Mermaid is useful for branching/stateful UX/domain flows.

Use conservative quoted Mermaid syntax from `references/diagrams.md`.

## 9. Tests and exact verification

Find representative tests when they establish outcomes, transitions, contract behavior, or the normal verification path.

Use exact source/config reads only for named unresolved questions such as:

- constants/thresholds;
- permission/security enforcement;
- schema/serialization details;
- exact callbacks/returns;
- error handling/recovery;
- product/device/build variants;
- native/platform boundaries.

Every direct read should answer a named question.

## 10. Analysis-completion gate

A module is ready to write only when its packet resolves:

- **boundary** — responsibility/non-responsibility and entry/public surfaces;
- **runtime** — representative entry-to-effect flow(s), or explicitly not applicable for a passive build unit;
- **stateData** — state/data/lifecycle ownership where detected, otherwise not applicable;
- **business** — Business role/detail and rationale;
- **extension** — concrete seam/reference search outcome where meaningful;
- **evidence** — enough anchors to substantiate important claims.

A deep module also requires at least two distinct analysis passes.

## 11. Compact analysis packet

Store one record per module in `.projectspec/analysis/<project>.json`:

```json
{
  "moduleId": "...",
  "responsibility": "...",
  "nonResponsibilities": [],
  "businessRole": "behavior-owner | supporting-behavior | architecture-only",
  "businessDetail": "standalone | project-grouped | none",
  "businessRationale": [],
  "analysisDepth": "focused | standard | deep",
  "analysisPasses": [
    {"kind": "ownership-runtime", "anchors": [], "resolved": []}
  ],
  "entrySurfaces": [],
  "dependencies": [],
  "consumers": [],
  "flows": [],
  "detectedTopics": [],
  "stateDataOwners": [],
  "integrations": [],
  "referenceSearchPerformed": true,
  "referencePatterns": [],
  "conditionalSections": [],
  "diagramDecision": {"architecture": "not-useful", "business": "not-useful", "reason": "..."},
  "constraintCandidates": [],
  "evidence": [],
  "completeness": {
    "boundary": "complete",
    "runtime": "complete",
    "stateData": "not-applicable",
    "business": "complete",
    "extension": "complete",
    "evidence": "complete"
  },
  "unknowns": []
}
```

The packet is reusable generation state, not another prose product. Do not store full source, exhaustive per-file summaries, or raw graph packets.
