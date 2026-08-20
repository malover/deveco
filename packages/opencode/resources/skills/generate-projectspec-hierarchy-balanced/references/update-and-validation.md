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
ARC/LIM fields. The final workspace gate checks inventory/plan agreement, all required documents,
unique governance IDs, absence of CHK/Change Checks, Architecture governance separation, local
links, balanced fences, conservative Mermaid, placeholders, and changed-module/ancestor coverage.
Build the index once, last, from validated Markdown and deterministic metadata. Mechanical checks do
not prove semantic truth; review representative UI/no-UI journeys and terminal outcomes manually.
