---
agent: general
description: Generate repository-level Project SPEC context for SDD
  planning.
---

# Project SPEC Generation

Generate `{PROJECT_ROOT}/spec/project-spec.md` as a factual description
of the current repository.

The Project SPEC: - describes existing architecture, flows, contracts,
and risks; - improves downstream SDD planning; - is not a feature
specification; - must not design the requested change.

## Exploration Budget

Limits: - CodeGraph queries: max 5 - Direct source reads: max 12 -
Glob/grep operations: max 5 - Exploration rounds: max 3

When limits are reached: 1. Stop exploration. 2. Summarize evidence. 3.
Generate the SPEC.

Prefer high-value evidence over exhaustive traversal.

## Analysis Order

1.  Architecture

- modules
- dependencies
- entry points
- subsystem boundaries

2.  Runtime lifecycle

- startup
- initialization
- lifecycle ownership
- runtime flows

3.  State and data ownership

- persistence
- shared managers
- configuration ownership
- contracts

4.  Change impact

- fan-out symbols
- central services
- risky areas
- propagation paths

Only investigate further when evidence is contradictory or insufficient.

## Evidence Rules

- Current state only.
- Evidence over inference.
- Use CodeGraph first for relationships when available.
- Use direct reads for configuration and verification.
- Do not modify source code.
- Only create/update `{PROJECT_ROOT}/spec/project-spec.md`.
- Preserve valid existing SPEC content.
- Avoid duplicate top-level sections.
- Risk labels require evidence.
- Used documentation must be listed.

## Graph Bootstrap

If CodeGraph is available: - use the DevEco-provided executable; -
initialize/index missing repositories; - sync existing indexes; - verify
with a repository-specific query.

Do not skip CodeGraph because `.codegraph` is missing.

If bootstrap fails, record the limitation and continue with targeted
exploration.

## Investigation

Read first: - README files - AGENTS.md / CLAUDE.md - architecture docs -
manifests - build configuration - package configuration

Then use graph analysis for: - modules - entry points - dependencies -
callers/callees - state ownership - impact analysis

Then perform targeted source reads only.

## Tool Output Compression

Do not send large raw exploration output into final generation.

Keep only: - relevant files - symbols - relationships - evidence -
confidence

Discard: - duplicate output - unrelated files - unnecessary source
blocks

Generate an internal evidence summary before writing.

## Generation

Load: `{CONFIG_ROOT}/specs/templates/project-spec-template.md`

Populate supported sections.

Requirements: - Runtime flows require Evidence and Confidence. - Feature
Change Guidance describes repository patterns, not the current
request. - Modification Risk Map uses evidence-backed classifications. -
Existing Documentation contains all used docs.

## Validation

Before completion verify: - no duplicate sections; - runtime flows have
evidence/confidence; - change guidance has applicability/evidence; -
documentation provenance is complete; - uncertain claims are marked.

## Completion Report

Return: - artifact path; - created/updated status; - graph backend; -
index action; - query count; - direct read count; - validation
results; - evidence sources; - limitations.
