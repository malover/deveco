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

Validate inventory/plan agreement, physical-module Architecture coverage, resolved role /
detail gates, grouped Business mentions, required Project and index files, unique ARC/LIM
entries and all self-contained fields, absence of CHK/Change Checks, Architecture governance
separation, concrete evidence anchors, local links, balanced fences, conservative Mermaid,
metadata redaction, packet identity, packet evidence, and changed-module/ancestor coverage.
Run packet validation before `render_documents.py`; build the index last from the same validated
packets. Mechanical checks do not prove semantic truth; review representative UI/no-UI journeys
and terminal outcomes manually.
