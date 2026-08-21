# Streaming document writing

Load one matching template at a time. Write the current module or Project document directly from
the bounded evidence just collected, preserving generated markers and developer text outside the
region. Run `projectspec.py check <repository-root> --output-root docs --scope ...` immediately; do not run a workspace renderer or
repeat discovery to fill scaffolding.

Project Business owns grouped observable behavior. Project and module Architecture own
responsibility, dependency direction, lifecycle, state/data, contracts, integrations, extension
seams, and blast radius. Emit a diagram only when the current evidence records a useful architectural
question and verified relationships. Governance is self-contained ARC/LIM entries and never a
copied Architecture section or a CHK/Change Checks table.
# Evidence self-review

Before completing each scope, verify numeric expressions against names/comments, implemented
branches against merely declared state, lifecycle and initialization order, failure ownership,
cache fallback and offline outcomes, state owner versus child-local state, platform API and
navigation names, and every external claim. Omit unsupported claims or record a bounded unknown.

Use Mermaid for required ownership and runtime diagrams. Keep labels quoted and syntax limited to
`flowchart`, `sequenceDiagram`, and `stateDiagram-v2`.
