# Evidence plan and packet boundary

The bootstrap plan is structural metadata, not a prose handoff. Keep one compact module record
per physical unit with selected depth (`focused`, `standard`, or `deep`), activated topics,
required evidence categories, anchors, and unresolved questions. `deep` remains the global
default; adaptive selection changes only per-module depth from deterministic scale and signal
rules.

The packet is the only handoff from evidence collection to document writing. A module claim is
`{claim, status, anchor, scope}` and must use an allowed evidence status with a non-empty anchor.
Packets retain ownership, lifecycle/contracts, dependencies, representative flows, state/data,
integrations, tests, extension/blast-radius facts, ARC/LIM candidates, unknowns, and diagram
decisions. They never contain raw source, graph responses, secrets, or repeated contract prose.

Run `scripts/validate_packet.py` before writing Markdown. Release detailed HomeGraph/source
context after each validated packet and re-query only for an explicit unresolved packet gap.
