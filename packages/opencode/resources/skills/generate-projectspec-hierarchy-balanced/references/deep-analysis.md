# Balanced Deep Scan metadata and module packets

The old `document-project` Deep Scan is retained as a conditional analysis phase, not as a
set of output documents. LLM classification is primary; the CSV archetype baseline is a
safety net. OR-merge both while preserving `llm-only` and `csv-baseline-only` provenance.

## Scan matrix

Record conditional findings for API contracts, data/domain models, state management, UI
components, UX/navigation, localization/resources, tests, build/deployment/CI, assets,
security/permissions, and async/event behavior. Also retain source-tree, entry-point,
integration, and reference-pattern findings. Each finding has one of:
`observed`, `declared`, `inferred`, `unavailable`, `not inspected`, `llm-only`,
`csv-baseline-only`.

## Depth

- `deep`: behavior owners, entry/orchestration, state/data/persistence foundations,
  native/platform boundaries, state-heavy modules, and graph hotspots. Requires ownership /
  runtime and distinct enrichment/reference passes.
- `standard`: substantial supporting behavior and meaningful technical modules. One strong
  pass plus targeted gaps/reference search.
- `focused`: thin architecture-only helpers/build units with small blast radius.

Deep enrichment resolves UI/state/navigation, domain/data lifecycle, source of truth,
mutation owner, persistence/cache/invalidation, transformations, loading/empty/error/offline/
permission/cancel/back/retry/recovery branches when evidenced, related implementations,
representative tests, coupled artifacts, and blast radius.

## Packet completion

Write `.projectspec/analysis/<project>.json` before its module docs. A packet includes:

```json
{
  "moduleId": "project/module",
  "responsibility": "observed responsibility",
  "nonResponsibilities": [],
  "businessRole": "behavior-owner | supporting-behavior | architecture-only",
  "businessDetail": "standalone | project-grouped | none",
  "businessRationale": [],
  "analysisDepth": "focused | standard | deep",
  "analysisPasses": [{"kind": "ownership-runtime", "anchors": [], "resolved": []}],
  "entrySurfaces": [], "dependencies": [], "consumers": [], "flows": [],
  "detectedTopics": [], "stateDataOwners": [], "integrations": [],
  "referenceSearchPerformed": true, "referencePatterns": [],
  "scopeMatrix": {"ownership": "", "runtime": "", "stateData": "", "contract": ""},
  "diagramDecision": {"architecture": "not-useful", "business": "not-useful", "reason": ""},
  "arcLimCandidates": [], "evidence": [], "unknowns": [],
  "completeness": {"boundary": "complete", "runtime": "complete", "stateData": "not-applicable", "business": "complete", "extension": "complete", "evidence": "complete"}
}
```

The packet is reusable state, not a prose product. Never store exhaustive file summaries or
raw HomeGraph output.
