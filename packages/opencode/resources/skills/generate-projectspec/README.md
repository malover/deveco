# generate-projectspec

Sixth iteration of the compact Homegraph-backed architecture + business documentation skill.

## v6 focus

This is a final cleanup pass before testing on a structurally different repository.

### Business abstraction
- Canonical repository business diagrams now exclude cache/DB/API/concurrency mechanics.
- High-level business rules must pass a product-level observable-behavior threshold.
- Code-first business prose is written one abstraction level above source implementation.
- Policy concepts such as freshness normally live under Behavioral Rules rather than Domain Concepts.
- Module state diagrams use user/business labels rather than raw enum names.

### Findings
- Repository Findings are now split into:
  - Observed Inconsistencies
  - Architecture Concerns
- Related findings are grouped.
- Repository-relevant module findings are promoted.

### Architectural precision
- Internal structure is grouped by responsibility rather than source-tree shape/component size.
- Public surface remains explicitly separated from framework entry points and internal symbols.
- Evidence-strength wording remains calibrated.

### CI precision
- CI coverage-gap claims require inspection of the complete discovered workflow set.

Output remains:
- 2 repository-level documents,
- 2 documents per physical module.
