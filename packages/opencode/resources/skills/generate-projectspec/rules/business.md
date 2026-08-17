# Business Documentation Rules

## As-Is scope

Business documentation describes the current As-Is system unless repository evidence explicitly declares intended behavior.

Do not infer future To-Be processes, strategic objectives, KPIs, stakeholders/RACI, prioritization, organizational impact, rollout strategy, regulatory obligations, or acceptance criteria as original requirements.

Capture such material only when explicitly declared by repository/project evidence, and identify it as declared.

## Internal scope classification

Classify repository and modules internally as:
- `ux`,
- `code-first`.

Do not emit classification headings.

## UX reconstruction method

For every UX scope:

1. **State/process skeleton** — recover meaningful states from routes/pages, state machines, conditional rendering, navigation, lifecycle, loading/error/empty behavior.
2. **Transitions** — identify trigger, source state, destination state, and observable meaning.
3. **Data dependencies** — identify information required to reach/render each meaningful outcome.
4. **Behavioral rules** — extract explicit conditions changing observable/domain outcomes.
5. **Architecture cross-reference** — use Homegraph and targeted source reads to trace important transitions to implementation.
6. **Terminal outcome verification** — follow the actual state transition/call chain through to its final observable UI/business outcome. Do not infer a runtime result merely because an isolated component contains a matching render branch.
7. **Completeness check** — verify happy path, errors, empty results, retry, back/navigation, offline/cache behavior, and permissions where relevant.

Do not invent missing flows.

## Process representation

For important UX processes use:

```text
Trigger
→ meaningful user/business steps
→ successful observable outcome

Alternative paths:
- externally meaningful errors
- retry
- back/navigation
- empty results
- offline/cache fallback
- permissions
```

Translate technical state names into business/user meanings.
Do not replace a user flow with a call chain.
Do not collapse distinct observed UI states when that changes what the user sees or what actions are available.

## Canonical business diagram

Repository-level business diagrams represent value delivery only.

Do not include:
- cache checks,
- DB writes,
- API calls,
- repository/data-source branches,
- DTO mapping,
- concurrency,
- implementation class names.

Prefer:
`User action → system/business capability → observable outcome`.

For independent operations, branch from the relevant user state/capability instead of inventing a mandatory sequential journey.

## Actors and callers

For UX apps, Actors contain only genuine human or external actors participating in product interaction.

Do not list internal modules, repositories, ViewModels, services, DAOs, data layers, or UI components as actors.

For code-first scopes, use `Callers` when more appropriate and include only evidence-backed callers.

## Capabilities

Capability names must describe observed behavior and must not imply stronger guarantees than implementation provides.

Avoid names such as "offline support", "fault tolerance", "secure transport", "automatic recovery", or "real-time synchronization" unless those guarantees are actually evidenced.

Prefer narrower names such as "local weather caching" or "remote API communication".

## Domain concepts and business glossary

Use business/data vocabulary, not implementation vocabulary.

Prefer domain concepts such as City, Weather, Forecast, Search history.
Avoid ViewState, ViewModel, Repository, DAO, Mapper, Component, screen class names, or raw implementation states.

For important concepts, capture concise business meaning and relationships when evidenced.
Policy notions such as freshness, timeout, retry, and retention normally belong under Behavioral Rules unless they are clearly first-class domain concepts.

## Behavioral rules

At repository level include rules only when they materially affect:
- what a user/caller can do,
- what result they receive,
- when observable behavior changes,
- product/domain policy.

Move persistence-internal rules to the owning module unless they materially affect repository-level behavior.

For ranking/scoring/selection algorithms:
- business docs describe outcome-driving factors and clearly observable/product-level thresholds,
- architecture docs hold formulas, weights, implementation heuristics, and internal ranking mechanics unless those values are explicitly declared product requirements.

## Alternative paths

An alternative path is an externally meaningful different outcome.
Do not list internal implementation branches unless they change observable behavior.

## Code-first abstraction

Describe technical operations one abstraction level above source implementation.

Prefer:
"Resolve the query using the configured geocoding service."

Avoid:
"Construct the URL and issue an HTTP GET."

Exact protocol/class/endpoint details belong in architecture.

## Lightweight traceability

High-level business docs should map major As-Is capabilities/use cases to implementation at a compact level:

`Capability / Use Case → supporting physical module(s) → relevant architecture responsibility/flow → important data → external integration (when applicable)`

Do not create a large formal requirements matrix.
Do not imply that inferred behavior is an original business requirement.

## Single-module deduplication

When one physical module implements nearly the whole product:
- `high-level-business.md` owns the complete end-to-end product/business view,
- the module business doc contains only module-specific behavior, rules, detailed subflows, or code-first contribution not already obvious at repository level,
- do not restate the same capabilities, actors, flows, and rules in near-identical form.

## Direct-to-file generation

Once the current business document has sufficient evidence, write it directly.

Do not pre-compose the entire business document in reasoning before writing the file. Keep only concise unresolved questions and traceability facts in working context.

## Cross-level deduplication

Use a **lowest useful level, summarize upward** rule.

Module business documents own:
- detailed As-Is module capabilities/use cases,
- module-specific user/caller flows,
- module-specific business rules,
- module-owned domain concepts,
- terminal observable outcomes relevant to that module.

High-level business owns:
- repository-wide capabilities,
- cross-module end-to-end processes,
- shared/domain-level concepts,
- repository-wide business implications,
- lightweight capability-to-module traceability.

Do not repeat a module-level behavioral detail in high-level business unless it materially affects the repository-wide process or user outcome.

Examples:
- "empty search results return to IDLE" belongs in the responsible module business doc; high-level business should mention it only if needed to describe the end-to-end search outcome.
- exact cache TTL implementation belongs in module architecture; high-level business may summarize the user-visible freshness implication when relevant.

Keep evidence references precise but avoid duplicating identical file/line anchors across every document.
