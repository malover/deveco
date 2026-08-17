# Architecture + Business Knowledge Base Instructions

## Objective

Generate a minimal knowledge base for feature work in an existing repository.

This version is descriptive and diagnostic. It does not yet enforce architecture rules or generate ADRs.

## 1. Detect physical boundaries

For HarmonyOS, locate `module.json5` files and record their containing physical modules.

Do not recursively enumerate all source files as the primary discovery strategy.

## 2. Homegraph-first discovery

Before broad source reading:

1. run a repository-level Homegraph exploration,
2. run at least one Homegraph exploration for every physical module,
3. identify important entry points,
4. identify cross-module dependencies,
5. identify representative runtime/data flows,
6. identify candidate UX entry points and user-facing flows.

Use Homegraph to select source files for verification.

## 3. Inspect declared documentation and developer workflow

Read:
- root README,
- obvious architecture/business/design docs,
- build wrapper/task files,
- package/config files exposing build/test commands,
- all `.github/workflows/*.yml` / `.yaml`,
- test configuration/directories.

For HarmonyOS specifically inspect when present:
- `hvigorw`
- `hvigorw.bat`
- `hvigorfile.ts`
- `build-profile.json5`
- root/module `oh-package.json5`

## 4. Build / run / test / CI extraction

Derive practical commands only from repository evidence.

Capture:
- prerequisite/setup steps,
- dependency installation,
- build commands,
- run/launch steps,
- unit/integration/UI test commands,
- module-specific variants when meaningful,
- CI workflow names,
- CI triggers,
- major CI jobs,
- what CI builds/tests/checks,
- what CI does not validate when evident.

Never invent a command.

Before stating a CI gap, inspect the complete discovered workflow set.

## 5. Evidence reconciliation

Track:
- declared/documented behavior,
- graph-observed structure,
- source-observed executable behavior.

For executable behavior, prefer source/config.

All cross-cutting findings go only in:
`docs/high-level-architecture.md` → `Repository Findings`.

Business docs never contain findings sections.

## 6. Finding classification

Inside Repository Findings:

### Observed Inconsistencies

Use for conflicting evidence:
- docs vs code,
- graph vs code,
- configuration vs implementation.

### Architecture Concerns

Use for evidence-backed concerns:
- security,
- coupling,
- robustness,
- maintainability,
- public-surface exposure,
- architectural smells.

Do not mix the two categories.

Promote findings to repository level when they affect:
- user-visible behavior,
- repository-level capability,
- cross-module contract,
- cache/persistence semantics,
- runtime/build/test behavior,
- shared public surface.

Group related findings.

## 7. Internal scope classification

Classify each scope as `ux` or `code-first`.

Do not emit classification headings.

## 8. UX reconstruction methodology

For UX scopes, explicitly perform:

### Step A — State/process skeleton

Identify meaningful states from UI/router/state-machine code.

Translate technical state names into business/user meanings.

### Step B — Transitions

For every important transition identify:
- trigger,
- source state,
- destination state,
- observable meaning.

### Step C — Data dependencies

Identify information required to reach/render each meaningful state.

### Step D — Behavioral rules

Extract conditions changing outcomes:
- validation,
- freshness,
- offline fallback,
- permissions,
- navigation restrictions,
- retry behavior.

### Step E — Architecture cross-reference

Use Homegraph to trace implementation behind each important transition/process.

### Step F — Completeness check

Check:
- happy path,
- errors,
- empty result,
- retry,
- back/navigation,
- offline/cache,
- permissions where relevant.

## 9. Canonical business diagram purity

The repository business diagram must represent value delivery only.

Do not include:
- cache checks,
- DB writes,
- API calls,
- repository/data-source branches,
- mapper steps,
- concurrency.

Prefer:

`User action → system capability → user-visible outcome`

Technical branches belong in architecture or Behavioral Rules.

## 10. Module UX diagrams

Only generate when additive.

Visible labels must use business/user meanings, not raw enum/state identifiers.

Technical state names may appear in Key Evidence.

## 11. Business actor purity

For UX applications:

### Actors

Only include:
- humans,
- genuinely external actors participating in the product interaction.

Do not include:
- internal modules,
- repositories,
- ViewModels,
- services,
- DAOs,
- data layers,
- UI components.

For code-first repositories, use `Callers` when more appropriate.

## 12. Domain concept purity

Domain concepts should represent business/data vocabulary.

Prefer:
- City,
- Weather,
- Forecast,
- Search history.

Avoid:
- screen names,
- ViewState,
- ViewModel,
- repository,
- DAO,
- mapper,
- component names.

Policy-like notions such as freshness/timeout/retry usually belong under Behavioral Rules.

## 13. High-level business flow compression

Keep the happy-path process focused on value delivery.

Move reusable conditions into `Explicit Behavioral Rules`.

## 14. High-level business rule threshold

Only retain rules in `high-level-business.md` if they materially affect:
- what the user/caller can do,
- result received,
- when observable behavior changes,
- product-level domain policy.

Move persistence-internal rules such as upsert/overwrite semantics to the owning module unless they affect repository-level behavior.

## 15. Capability naming precision

Capability names must describe currently observed behavior.

Do not use names implying stronger guarantees than the implementation provides, such as:
- "offline support",
- "secure transport",
- "fault tolerance",
- "automatic recovery",
- "real-time synchronization"

when only partial supporting mechanisms are observed.

Prefer narrower evidence-backed names such as:
- "local weather caching" instead of "offline support",
- "remote API communication" instead of "secure transport" when transport guarantees are not established.

## 16. Alternative-path purity

Alternative path = user/caller experiences a different outcome.

Do not list internal branches unless they produce an externally meaningful result.

## 17. Code-first semantic abstraction

Describe technical operations one abstraction level above implementation.

Prefer:

"Resolve the query using the configured geocoding service."

Avoid:

"Construct the Nominatim URL and issue an HTTP GET."

Exact protocol/class/endpoint details belong in architecture.

## 18. Architectural certainty wording

Do not say:
- strict architecture,
- enforced layering,
- guaranteed boundary,
- impossible to bypass

unless explicitly enforced or comprehensively proven.

Prefer:
- "Observed dependency direction is..."
- "Current implementation routes..."
- "Homegraph shows..."
- "Existing code follows..."

## 19. Direct vs transitive dependencies

Module dependency sections should primarily describe direct dependencies.

Do not list a platform/library dependency under a module merely because another module it depends on uses that dependency.

Mention transitive dependencies only when they impose a meaningful:
- runtime constraint,
- deployment constraint,
- security constraint,
- integration constraint

on the current module.

When a transitive dependency is important enough to mention, identify it explicitly as transitive rather than presenting it as a direct dependency.

## 20. Public surface significance

Distinguish:

### External / Package Surface

Actual exports consumable by other modules/packages.

### Framework / Application Entry Points

Abilities, routes, lifecycle entry points, services.

### Internal Shared Symbols

Shared internal instances/functions used within the module.

If low-level implementation components are publicly exported alongside a facade, explicitly call it out.

## 21. Ownership precision

Distinguish between:
- implementation ownership,
- state/data ownership,
- lifecycle/wiring ownership,
- registration/global-reference ownership.

Do not say a module "owns" an object/reference merely because the object's type or implementation is defined there.

When ownership is split, describe the responsibilities separately.

For example:

- a data module may own the repository implementation,
- an application module may own repository initialization and lifecycle,
- an application entry point may own registration of the instance in a global/application context.

Use the most precise ownership description supported by the code.

## 22. Architecture abstraction

### High-level

Show:
- physical module responsibilities,
- module relationships,
- integrations,
- data/state ownership,
- runtime flows,
- developer workflow,
- CI.

### Module

Group internal code into ~4–7 meaningful architectural responsibilities.

Group by responsibility, not merely folder shape or component size.

## 23. CI coverage gaps

State both:
- what CI validates,
- what CI does not validate when supported by the complete workflow set.

## 24. Agent usability

Generated docs should help a future coding agent answer quickly:
- Where should this feature go?
- Which module owns the relevant capability/data?
- What current patterns are observed?
- What build/test/CI steps should I run?
- What known inconsistencies/concerns affect this feature?
- Which public surface is actually available?

## 25. Deduplication

- one canonical repository UX diagram,
- module UX diagrams only when additive,
- repository findings appear once,
- related findings grouped,
- high-level docs summarize rather than replay module details,
- business docs do not replay architecture call chains,
- build/run/test/CI lives primarily at repo level.

## 26. Final validation

Verify:
- Homegraph used first,
- each module explored,
- UX method followed,
- canonical business diagram contains no implementation mechanisms,
- module diagram labels are business/user-facing,
- actors are genuine actors,
- domain concepts are business/data concepts,
- high-level business rules pass the product-level threshold,
- capability names do not overstate observed behavior,
- code-first business prose is one abstraction level above source,
- architectural certainty wording is evidence-calibrated,
- direct and transitive dependencies are not conflated,
- public surface is classified correctly,
- ownership wording distinguishes implementation/data/lifecycle/wiring/registration ownership where relevant,
- findings are grouped and categorized,
- all workflow files were inspected before CI-gap claims,
- no command was invented.
