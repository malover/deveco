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

## Phase 3 — Declared documentation and developer workflow
10. Read root README and obvious high-level docs.
11. Inspect build/task wrappers and configuration.
12. Inspect ALL discovered `.github/workflows/*.yml` / `.yaml`.
13. Inspect test directories/configuration.
14. Record setup/build/run/test commands and CI behavior.
15. Record evident CI coverage gaps only after all workflows are inspected.

## Phase 4 — Targeted source verification
16. Read only source/config needed to verify graph/doc claims.
17. Track material documentation/graph/source disagreements.
18. Track evidence-backed architecture concerns separately.

## Phase 5 — Scope classification
19. Classify repository and each module internally as `ux` or `code-first`.
20. Do not emit classification headings.

## Phase 6 — UX methodology
For every UX scope:

21. Identify state/process skeleton.
22. Identify transitions and triggers.
23. Identify data dependencies.
24. Extract observable behavioral rules.
25. Cross-reference major flows to Homegraph/runtime paths.
26. Validate happy/error/empty/retry/back/offline/permission paths.

## Phase 7 — Business abstraction cleanup
27. Separate genuine actors from internal collaborators.
28. Separate domain concepts from UI/implementation concepts.
29. Keep policy concepts such as freshness/timeout under Behavioral Rules unless first-class domain concepts.
30. Compress happy path to value delivery.
31. Move reusable technical conditions to Behavioral Rules.
32. Remove internal branches from alternative paths.
33. Move implementation-owned rules out of high-level business unless product-level observable.
34. For code-first scopes, rewrite implementation details one abstraction level upward.

## Phase 8 — Diagram planning
35. Create one canonical repository business diagram containing only business/user states and outcomes.
36. Remove cache/DB/API/concurrency mechanics from that diagram.
37. Generate module UX diagrams only when additive.
38. Translate technical state identifiers into business/user-facing labels.
39. Do not repeat equivalent diagrams.

## Phase 9 — Architectural precision
40. Calibrate certainty wording to evidence.
41. Distinguish package exports, application entry points, and internal shared symbols.
42. Call out low-level publicly exported implementation components when relevant.
43. Group internal structure by responsibility, not source-tree shape.

## Phase 10 — Findings
44. Group related findings.
45. Categorize as:
    - Observed Inconsistencies
    - Architecture Concerns
46. Promote repository-relevant findings.
47. Put repository findings only in `high-level-architecture.md`.
48. Keep genuinely module-local findings only in module architecture.

## Phase 11 — Generate
49. Generate only:
    - `docs/high-level-architecture.md`
    - `docs/high-level-business.md`
    - `docs/modules/<module>/architecture.md`
    - `docs/modules/<module>/business.md`
50. Ensure `high-level-architecture.md` contains:
    - Build, Run, Test, and CI
    - CI coverage gaps where evidenced
51. End every document with `Key Evidence`.

## Phase 12 — Validate
52. Validate Mermaid syntax and quoting.
53. Validate canonical business diagram purity.
54. Validate diagram non-duplication.
55. Validate state-label abstraction.
56. Validate actor purity.
57. Validate domain-concept purity.
58. Validate high-level business rule threshold.
59. Validate code-first semantic abstraction.
60. Validate certainty wording.
61. Validate public-surface classification.
62. Validate finding categorization/scope.
63. Validate all workflows inspected before CI-gap claims.
64. Validate build/run/test commands are evidence-backed.
65. Stop. Generate no additional artifacts.
