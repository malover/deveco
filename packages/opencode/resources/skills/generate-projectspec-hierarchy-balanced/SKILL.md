---
name: generate-projectspec-hierarchy-balanced
description: Generate module-first As-Is ProjectSpec documents with incremental schema-v3 validation.
---

# Generate ProjectSpec Hierarchy Balanced

This independent skill produces Project Business, Architecture, and ARC/LIM governance
documents without changing sibling skills. Every physical module receives Architecture;
Business is evidence-gated and grouped behavior belongs in Project Business.
Every physical module/build unit receives Architecture. `deep` is the default. The
old `document-project` Deep Scan remains compatibility metadata only; it does not create legacy
outputs. This skill does not modify or replace `generate-projectspec-hierarchy-v7`,
`document-project`, or `combined-doc-generation`.

## Streaming contract

1. Run `bootstrap_projectspec.mjs`, then `projectspec.py start docs`.
2. Perform exactly one readiness chain: `homegraph_status` → bounded `homegraph_files` →
   anchored `homegraph_explore`, then record it with `projectspec.py graph-ready`.
3. Call `projectspec.py next`, discover and write that one module, and immediately run
   `projectspec.py check --scope module:<id>`.
4. After all child modules pass, write Project documents and check `project:<id>`.
5. Run `projectspec.py finish` for one deterministic index build and strict final validation.

Completed Markdown and the tiny derived `project-scan-report.json` ledger are the upward
handoff. Fresh runs do not require project-wide packets, a full CSV read, `render_documents.py`,
or a second discovery pass. Legacy packet/render scripts remain available for schema-v2 migration.

Preserve generated markers and preserve developer content outside them. Governance uses only self-contained
`ARC-*` and `LIM-*` entries; no `CHK-*` namespace or Change Checks table. Do not inspect scripts,
persisted metadata internals, or HomeGraph storage during routine generation.

Manual invocation may ask unresolved root/revision/output questions. Goal-step0 consumes approved
facts. HomeGraph remains mandatory; failures require bounded recovery and an explicit decision.
