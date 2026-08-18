# Diagram Rules

Use Mermaid when relationships, branching, state changes, or execution order are materially clearer than prose or a table. A major UI capability must include one canonical UX journey/state diagram in its detailed Business owner. A non-UI major capability should include an equivalent caller/system flow when it has branching or multiple handoffs.

## Choose the smallest useful view

- Workspace Architecture: cross-project context/dependency view.
- Project Architecture: module/area component view.
- Module Architecture: one important runtime/data sequence or local structure.
- Business: one canonical value-delivery, state, or cross-project handoff flow.
- Logical subsystem: collapsed component dependency view.

Do not repeat equivalent diagrams at multiple levels.

## Density and safety

- Keep one hierarchy level plus immediate external neighbors.
- Aim for at most 15 nodes; split or aggregate beyond that.
- Use top-down layout for wide graphs.
- Give every arrow a meaningful direction; label non-obvious relationships.
- Use simple alphanumeric node IDs and quoted human labels.
- Avoid raw generic type syntax, filesystem noise, punctuation-heavy IDs, HTML labels, and multi-target shorthand.
- Include a short “Reading this diagram” note when direction or grouping could be ambiguous.

## Business diagrams

Show actors, business states/steps, decisions, outcomes, recovery, and Project/capability handoffs. For UX include loading, empty, error, offline/permission when present, cancel/back/dismiss behavior, and the terminal visible/caller result. Hide classes, repositories, and low-level calls; map the same transitions to symbols in traceability tables.

## Architecture diagrams

Show physical or logical boundaries explicitly. Distinguish internal modules, sibling Projects, external packages, and external systems. A diagram should answer one question; do not build a universal map.

## Validation

Check fence balance and inspect labels for unsupported claims. If Mermaid rendering is available, render the diagram; otherwise keep syntax conservative and validate structurally.
