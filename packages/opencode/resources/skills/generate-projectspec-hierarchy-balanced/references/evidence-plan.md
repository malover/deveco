# Evidence plan and streaming ledger

The bootstrap plan is structural metadata, not a prose handoff. Keep one compact module record
per physical unit with selected depth (`focused`, `standard`, or `deep`), activated topics,
required evidence categories, anchors, and unresolved questions. `deep` remains the global
default; adaptive selection changes only per-module depth from deterministic scale and signal
rules.

Bootstrap also creates a small deterministic Project profile: structural kind, workspace mode,
source languages/platform, module kinds, declared abilities/pages/permissions, dependency direction,
candidate technologies, mapped archetype, evidence anchors, and only the selected archetype CSV
baseline flags/activated topics. The model must not read the complete CSV. After HomeGraph readiness,
one mandatory discovery item per Project records summary, confirmed type, architecture pattern,
technologies, evidence anchors/status, and any classification correction before module work begins.

Schema-v3 has no packet-first handoff. Completed Markdown plus a tiny derived ledger is the
handoff from evidence collection to document writing. A module claim is
`{claim, status, anchor, scope}` and must use an allowed evidence status with a non-empty anchor.
The ledger retains only summaries, evidence anchors, governance IDs, and gaps; ownership,
lifecycle/contracts, flows, state/data, integrations, tests, extension/blast-radius facts, and
diagram decisions remain in completed Markdown. It never contains raw source, graph responses,
secrets, or repeated contract prose.

Run `projectspec.py check <repository-root> --output-root docs --scope module:<id>` immediately after writing Markdown. Release
detailed HomeGraph/source context after each scope and re-query only for an explicit unresolved gap.
