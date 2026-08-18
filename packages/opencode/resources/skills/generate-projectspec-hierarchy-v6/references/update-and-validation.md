# Updating and Validating Documentation

## Preserve manual content

For existing documents:

1. Locate exactly one `PROJECTSPEC:GENERATED:START` and matching `END` marker.
2. Replace only the generated region.
3. Preserve all content outside the markers byte-for-byte when practical.
4. If markers are absent, do not destructively rewrite a clearly human-authored file. Create the requested generated file at the planned path or ask when the path would collide.
5. Never nest generated markers.

## Minimize churn

- Keep heading order, stable IDs, and table column order consistent.
- Use selected revision, not a volatile generation timestamp, as freshness metadata.
- Preserve stable slugs and relative paths.
- Regenerate ancestors only when their summary, inventory, links, findings, or cross-boundary relationships changed.
- Remove an obsolete generated file only when its former unit is conclusively absent or regrouped and the deletion is within the user's requested update scope.

## Content gates

### Hierarchy

- Every frozen Project appears in high-level Architecture.
- Every physical module/build unit appears in its owning Project/high-level Architecture inventory.
- No module is promoted to Project solely from `module.json5` or a directory name.
- Logical subsystems are not presented as repositories.

### Business

- Every major capability has one detailed owner.
- Main flow reaches an observable outcome.
- Important alternative/error states are covered.
- Exact rules are verified.
- Technical-only units do not receive invented business narratives.
- Every planned major capability has a Detailed Business owner, not only a portfolio row.
- Every detailed owner covers trigger, preconditions, terminal outcome or explicit unavailable-outcome marker, alternatives/failures, participating units, evidence, and unknowns.
- Observed terminal outcomes have evidence reaching that outcome; handoffs across unavailable native/external boundaries are not promoted to certainty.

### Architecture

- Every standalone unit states responsibility, boundaries, entry/public surface, dependencies/consumers, important flows, and evidence as applicable.
- Direct and transitive dependencies are distinguished.
- Cross-project delegation does not claim foreign internals.
- Build/test/CI commands are evidenced.

### Cross-level quality

- Detail exists once at the lowest useful level.
- Parents summarize and link; children explain.
- Business flow/capability IDs map to architectural owners when IDs are used.
- Findings appear once at the highest impacted scope.
- Inferences and unavailable evidence are explicit.

## Mechanical validation

Run `scripts/validate_docs.py` against the output root. Fix:

- missing high-level files/index;
- broken local Markdown links;
- unmatched/nested ProjectSpec markers;
- unbalanced Mermaid fences;
- unresolved template tokens/TODOs;
- duplicate generated document titles.

Pass `--inventory` and `--plan` so the validator can check physical-unit coverage, planned documents, capability owners, traceability IDs, outcome/unknown markers, and evidence classes. Manually review narrative truthfulness and abstraction level.
