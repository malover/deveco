# Update and validation

Generated documents contain exactly one:

```text
<!-- PROJECTSPEC:GENERATED:START -->
...
<!-- PROJECTSPEC:GENERATED:END -->
```

Replace only the generated region. Preserve all text outside it, including developer rules,
manual corrections, and unrelated documentation. If another documentation contract owns the
existing generated region, ask before replacing it; never silently delete legacy artifacts.

Validate each module immediately for markers, canonical headings, role/detail gates, and concrete
evidence anchors. Validate each Project after its children for governance IDs and self-contained
ARC/LIM fields, its canonical metadata line, and reconciliation with mandatory discovery. Before
index generation, fail on pending HomeGraph readiness, stale `status` keys, incomplete discovery,
unverified boundaries, incomplete scopes, fallback type/pattern/summary values, or empty technologies.
The final workspace gate checks inventory/plan agreement, all required documents,
unique governance IDs, absence of CHK/Change Checks, Architecture governance separation, local
links, balanced fences, conservative Mermaid, placeholders, and changed-module/ancestor coverage.
`index.md` is finish-owned. Build it once, last, from reconciled Project facts, deterministic profiles,
and validated Markdown, then reject fallback repository metadata in the rendered result. Mechanical checks do
not prove semantic truth; review representative UI/no-UI journeys and terminal outcomes manually.
