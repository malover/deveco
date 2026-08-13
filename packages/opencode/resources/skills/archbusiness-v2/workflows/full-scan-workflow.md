# Full Scan Workflow

## Phase 1 — Physical boundaries
1. Locate `module.json5` files.
2. Record physical modules and module types.
3. Do not enumerate all source files.

## Phase 2 — Homegraph discovery
4. Explore repository architecture with Homegraph.
5. Explore every physical module with Homegraph.
6. Identify cross-module dependencies and entry points.
7. Identify representative runtime/data flows.
8. Identify UX entry points and candidate user flows.
9. Trace important flows before broad source reading.

## Phase 3 — Declared documentation + targeted verification
10. Read README and obvious high-level docs.
11. Read only source/config files needed to verify Homegraph/document claims.
12. Track any material doc/graph/source disagreement.

## Phase 4 — Scope classification
13. Classify repository and each module internally as `ux` or `code-first`.
14. Do not emit the classification as generated content.

## Phase 5 — Linked flow reconstruction
15. For UX scopes:
    - Trigger → Flow → Outcome → Alternatives
    - map to Homegraph execution path
    - generate a UX Mermaid flowchart if 3+ meaningful steps exist
16. For code-first scopes:
    - Input → Processing → Output/Effect → Alternatives
    - start from actual public/caller entry points and Homegraph paths

## Phase 6 — Centralize findings
17. Put all cross-cutting findings only in:
    `docs/high-level-architecture.md` → `Repository Findings`
18. Do not repeat those findings elsewhere.
19. Keep module-only findings in the affected module architecture file only.

## Phase 7 — Generate
20. Generate only:
    - `docs/high-level-architecture.md`
    - `docs/high-level-business.md`
    - `docs/modules/<module>/architecture.md`
    - `docs/modules/<module>/business.md`
21. End each document with `Key Evidence`.

## Phase 8 — Validate generated content
22. Validate Mermaid:
    - quoted node labels
    - quoted edge labels
    - quoted subgraph labels
    - simple IDs
    - no multi-target shorthand
23. Validate business purity:
    - no class chains in capabilities
    - no ViewState/classes as domain concepts
    - no Promise.all/concurrency as business rules
    - alternatives are externally meaningful
24. Validate deduplication:
    - repository findings appear once
    - high-level docs do not duplicate module details
25. Validate conflict-aware summaries:
    - disputed documentation is not repeated as fact
26. Stop. Generate no additional artifacts.
