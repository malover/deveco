# archbusiness-v3

Third iteration of the compact Homegraph-backed architecture + business documentation skill.

## Output

```text
docs/
├── high-level-architecture.md
├── high-level-business.md
└── modules/
    └── <module>/
        ├── architecture.md
        └── business.md
```

## v3 changes

- Mermaid safety rule: all visible flowchart node labels, edge labels and subgraph labels are double-quoted.
- UX business documentation now requires a flow diagram when a meaningful 3+ step interaction exists.
- Cross-cutting issues/inconsistencies are centralized once in `high-level-architecture.md` → `Repository Findings`.
- Business docs no longer repeat issue sections.
- Removes generator meta such as `UX classification` from output.
- Prevents disputed documentation from being repeated as fact in summaries.
- Prevents technical optimizations such as `Promise.all` from becoming business rules.
- Prevents implementation concepts such as `ViewState` from becoming domain concepts.
- Prevents internal implementation preconditions from being listed as user-facing alternative paths.
- Distinguishes package/public APIs from application entry points and internal shared symbols.
- Tightens internal-structure generation to avoid folder/class inventory dumps.
- Keeps Homegraph-first discovery and 2 repo + 2/module output.
