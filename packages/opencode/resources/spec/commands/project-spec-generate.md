---
agent: project-spec
subtask: true
description: Generate repository-level Project SPEC context for SDD planning.
---

# Project SPEC Generation

Generate `{PROJECT_ROOT}/spec/project-spec.md` as a factual description of the
current repository. It describes existing architecture, flows, contracts, and
risks for downstream SDD planning. It is not a feature specification and must
not design the requested change.

## Required Isolated Pipeline

The current `project-spec` agent is the writer. It must keep repository tool
history out of its context by using the deterministic `project_spec_collect`
tool:

1. Read this command and
   `{CONFIG_ROOT}/specs/templates/project-spec-template.md`.
2. Read an existing `{PROJECT_ROOT}/spec/project-spec.md` when present.
3. Call `project_spec_collect` once without `gaps`.
4. Validate that the result is JSON with
   `schema = "project-spec-evidence-v1"` and at most 15,000 characters.
5. Write the Project SPEC from that compact bundle.

Do not spawn an explorer Task. Do not call HomeGraph, Bash, Glob,
Grep, List, web tools, or repository source/config reads yourself. The
collector owns graph bootstrap/sync, five focused graph queries, one bounded
metadata scan, at most twelve targeted reads, deduplication, and semantic
compaction.

## Controlled Follow-up

Prefer writing with explicit uncertainty over broadening exploration. Only
when a required template section cannot be supported may you call
`project_spec_collect` one more time with `gaps` containing one or two precise
questions. Merge the returned compact evidence into the initial bundle. Never
make a third collector call and never use another repository-analysis tool.

If either required handoff is malformed or oversized, report
`[TOOL_ERROR] project-spec-evidence: <reason>` so the parent workflow can apply
its normal single retry. Do not ingest malformed output or start manual
exploration.

## Evidence Rules

- Use only current repository evidence from the collector bundle.
- Runtime ordering requires graph/source evidence; do not assemble a sequence
  from unrelated facts.
- Risk labels require evidence.
- Consolidate large consumer lists into a count plus representative examples.
- Treat claims absent from the bundle as unknown.
- Preserve existing content only when supported by the new bundle.
- List documentation that materially influenced the result.
- Keep evidence references compact; never reproduce the bundle or source blocks
  verbatim in the artifact.

## Writer Generation

Populate the template using the evidence bundle as the exclusive source of
repository facts. Create or update exactly
`{PROJECT_ROOT}/spec/project-spec.md`; do not write intermediate evidence files
or modify another project file.

Requirements:

- Runtime flows include Evidence and Confidence.
- Feature Change Guidance describes reusable repository patterns, not the
  current requested feature.
- Modification Risk Map uses evidence-backed classifications.
- Existing Documentation contains all used documentation.
- Uncertain claims remain explicitly marked.

## Validation

Before completion verify:

- exactly one instance of every top-level section;
- runtime flows include evidence and confidence;
- change guidance includes applicability and evidence;
- documentation provenance is complete;
- uncertain claims are marked;
- only `spec/project-spec.md` was created or changed by the writer.

## Completion Report

Return only a concise report containing:

- artifact path and created/updated status;
- pipeline: `project_spec_collect -> project-spec`;
- graph backend and index action;
- graph query, direct read, Glob/Grep, and round counts;
- compact evidence character count and collector timing;
- whether a follow-up was used;
- validation result, evidence sources, and limitations.
