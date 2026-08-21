---
name: generate-projectspec-hierarchy-balanced
description: Generate module-first As-Is ProjectSpec documents from the canonical workspace inventory with bounded HomeGraph evidence and structural validation.
---

# Generate ProjectSpec Hierarchy Balanced

This independent skill produces Project Business, Architecture, and ARC/LIM governance
documents without changing sibling skills. Every physical module receives Architecture;
Business is generated only for semantically confirmed behavior-owner modules and grouped
behavior remains in Project Business.

## v2 streaming contract

The repository root is the directory in which DevEco Code was invoked. Keep every project discovery,
source read, HomeGraph `projectPath`, and generated artifact inside that root. Never inspect a parent,
sibling, drive root, or unrelated checkout, and never search the machine for missing executables.

1. Run `project_spec_analyze` once with `root: "."`, revision, statistics, dependency resolution, and `docs/.projectspec/workspace-inventory.json`, then run `python scripts/projectspec.py start <repository-root> --output-root docs --revision HEAD`.
2. Perform exactly one `homegraph_status`. If it fails, ask whether to stop/retry or explicitly permit reduced-confidence source evidence. Never silently fall back.
3. Prefer HomeGraph to identify semantic structure: use one bounded Project `homegraph_explore`, then one bounded anchored explore per module, always with the invocation root as `projectPath`. Each scope permits at most one focused fallback for an exact missing symbol or relationship; do not run `homegraph_files`.
4. Call `projectspec.py next` and complete the returned Project semantic item with `projectspec.py discover`.
5. Continue `next` one module at a time and immediately run `projectspec.py check --scope module:<id>`.
6. After all child modules pass, write Project documents and check `project:<id>`.
7. Run `projectspec.py finish` for shared structural validation, one deterministic index build, and final ledger completion.

The canonical inventory supplies Project/module identities, types, technologies, permissions,
entry surfaces, dependencies, resources, and test locations. Do not rediscover those facts by
walking the repository, reading a CSV baseline, or running a discovery pass. This is a clean
break: v1 metadata and packet contracts cannot resume.

If `project_spec_analyze` fails, report its exact error and stop. Do not probe `PATH`, recursively
search a drive for `rg` or another executable, install dependencies, or substitute a broad shell
filesystem scan.

Preserve generated markers and developer content outside them. Governance uses self-contained
`ARC-*` and `LIM-*` entries; zero entries is valid when evidence supports no concrete constraint.

Every scope must complete the evidence self-review in `references/document-writing.md` before
writing. Multi-module Project Architecture requires ownership and runtime Mermaid diagrams;
behavior-owner module Architecture requires one relevant Mermaid diagram. Supporting and
architecture-only module Business documents are not generated.
