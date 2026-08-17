# Diagram Rules

Use Mermaid only when it materially improves understanding.

## Safety

- Use simple alphanumeric node IDs.
- Double-quote every visible node label.
- Double-quote every edge label.
- Quote subgraph labels.
- Avoid compact multi-target syntax such as `A --> B & C`.
- Avoid raw source syntax or punctuation-heavy identifiers in visible labels.

## Hierarchy

### Repository business diagram
One canonical business/value-delivery diagram for UX repositories when useful.
No implementation mechanics.

### Module business diagram
Generate only when it adds detail not already present at repository level, such as navigation/state detail, a module-local subflow, or distinct retry/error path.
Visible state labels must use business/user meanings, not raw technical enum names.

### Architecture diagrams
May show modules, external boundaries, dependencies, data/runtime relationships, and implementation mechanisms.
Make repository boundaries visually explicit when linked repositories/packages are involved.

Avoid duplicate diagrams across levels.
