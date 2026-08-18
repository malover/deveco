# Diagram Rules

Use Mermaid only when relationships, branching, state changes, or execution order are materially clearer than prose or a table.

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

Show actors, business states/steps, decisions, outcomes, and Project/capability handoffs. Hide classes, repositories, and low-level calls.

## Architecture diagrams

Show physical or logical boundaries explicitly. Distinguish internal modules, sibling Projects, external packages, and external systems. A diagram should answer one question; do not build a universal map.

## Validation

Check fence balance and inspect labels for unsupported claims. If Mermaid rendering is available, render the diagram; otherwise keep syntax conservative and validate structurally.
