# Balanced v2 streaming workflow

## Startup

Freeze `<repository-root>` as the directory in which DevEco Code was invoked. All project
exploration, source reads, HomeGraph queries, and output paths must remain below this boundary.
Do not inspect parent or sibling directories, enumerate a drive root, or discover other checkouts.

Run `project_spec_analyze` once with `root: "."` before this workflow. It writes the canonical
inventory to `docs/.projectspec/workspace-inventory.json`. Then run:

`python <skill>/scripts/projectspec.py start <repository-root> --output-root docs --revision HEAD`

`start` consumes that artifact without walking, hashing, globbing, or rescanning the repository.
Missing or stale v2 inventory metadata is an actionable error.

If `project_spec_analyze` fails, stop and report the exact error. Do not look for `rg` or other
executables with shell commands, recursively search a drive, install tools, or retry through an
equivalent broad filesystem scan.

## HomeGraph gate

Run one `homegraph_status` and one bounded anchored `homegraph_explore` for the Project, using
`<repository-root>` as `projectPath`. Prefer this explore for semantic structure instead of shell
directory enumeration. If the status is unavailable, call `question` before any fallback and
record the explicit decision.
Record readiness with:

`python <skill>/scripts/projectspec.py graph-ready <repository-root> --output-root docs --status ready --status-summary <summary> --explore <anchor> --homegraph-revision <identity-or-not-exposed>`

The Project explore is bounded to inventory-provided paths below `<repository-root>`. Each module
gets one anchored explore and at most one focused fallback for an exact missing symbol or
relationship. Do not run `homegraph_files`.

## Project discovery

`next` returns the exact template path, source anchors, suggested query, query limits, diagram
requirement, business-role criteria, and the next command shape. Record only semantic facts that
the inventory cannot establish with `projectspec.py discover`.

## Module-first documents

Process modules provider-before-consumer. Write Architecture for every module and Business only
for `behavior-owner`; supporting behavior is covered by Project Business and architecture-only
modules have no Business document. Complete the evidence self-review before each write, preserve
content outside generated markers, and run `projectspec.py check --scope module:<id>` immediately.

## Project synthesis and finish

After all child modules are complete, synthesize Project Business, Architecture, governance, and
the required Mermaid diagrams, then check `project:<id>`. `finish` uses the same shared structural
contract as scoped checks, builds `index.md` once from completed scope facts, and atomically clears
missing outputs and changed scopes before marking the ledger complete.
