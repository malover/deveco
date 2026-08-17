# Findings Rules

Cross-cutting findings appear exactly once in:
`docs/high-level-architecture.md` → `Repository Findings`.

Business docs never contain findings/issues sections.
A module architecture doc may contain a truly module-local finding only when it does not meet repository-promotion criteria.

## Categories

### Observed Inconsistencies
Use for conflicting evidence:
- documentation vs source,
- Homegraph vs source,
- configuration vs implementation,
- stale declared behavior.

### Architecture Concerns
Use for structural concerns such as:
- coupling,
- ownership/boundary ambiguity,
- overly broad public surface,
- dependency shape,
- security architecture,
- maintainability smells.

### Implementation Risks
Use for evidence-backed runtime defects or fragile behavior such as:
- uncaught async failures,
- incorrect state persistence,
- invalid default parsing,
- success feedback before operation completion,
- unsafe casts or local robustness defects.

Do not classify a local runtime bug as an architecture concern unless it reflects a broader structural issue.

## Promotion

Promote a finding to repository level when it affects:
- user-visible behavior,
- repository-level capability,
- cross-module contract,
- persistence/cache semantics,
- runtime/build/test behavior,
- shared public surface,
- security/quality posture across scopes.

Group related findings.

## Evidence format

For inconsistencies capture:
- Declared/documented
- Observed implementation
- Why it matters
- Affected scope

For concerns/risks capture:
- Observed condition
- Why it matters
- Affected scope

Never use uncommitted working-tree-only state as a repository finding unless the user explicitly requested working-tree analysis.

## Incremental promoted-findings staging

Maintain a compact transient **Promoted Findings List** during module analysis.

As soon as a candidate finding meets repository-level promotion criteria:
- record its category,
- concise claim,
- originating module,
- evidence anchor,
- repository-wide implication.

Then:
- keep detailed evidence at the originating module level when useful,
- summarize/promote the finding once at repository level,
- do not rediscover or restate the same finding during later synthesis.

If a module has no local findings after promotion, omit an empty "None" paragraph unless the template explicitly requires the section.
