---
agent: project-spec
subtask: true
description: Generate repository-level Project SPEC context for SDD planning.
---

# Project SPEC Generation

Generate `{PROJECT_ROOT}/spec/project-spec.md` as a factual description of the
current repository. The document describes existing architecture, flows,
contracts, and risks for downstream SDD planning. It is not a feature
specification and must not design the requested change.

## Required Two-Session Pipeline

Use this exact context boundary:

1. The current `project-spec` agent is the writer/coordinator.
2. It spawns one foreground `project-spec-explorer` Task.
3. The explorer performs all repository and graph investigation in its own
   session and returns only `project-spec-evidence-v1` JSON.
4. The writer generates the artifact from that JSON without receiving the
   explorer's tool history, raw source output, or intermediate reasoning.

The writer MUST NOT call graph tools, Bash, Glob, Grep, List, web tools, or read
repository source/config/docs directly. It may read only:

- this command;
- `{CONFIG_ROOT}/specs/templates/project-spec-template.md`;
- an existing `{PROJECT_ROOT}/spec/project-spec.md`, when present.

## Explorer Task

Call the Task tool once with:

- `subagent_type`: `project-spec-explorer`
- `description`: `Collect Project SPEC evidence`
- foreground execution (the default)

The Task prompt MUST include `PROJECT_ROOT`, `CONFIG_ROOT`, the exploration
budget, graph bootstrap rules, analysis order, evidence rules, and the exact
handoff contract below.

### Exploration Budget

- CodeGraph/HomeGraph queries: max 5
- Direct source reads: max 12
- Glob/Grep operations: max 5
- Exploration rounds: max 3

When a limit is reached, stop exploration and synthesize the available
evidence. Prefer high-value evidence over exhaustive traversal.

### Graph Bootstrap

Prefer HomeGraph when its MCP tools and a usable repository index are available.
Otherwise use CodeGraph when available. For CodeGraph:

- run the DevEco-provided executable from `PROJECT_ROOT` using
  `DEVECO_CODEGRAPH_EXECUTABLE`;
- if `.codegraph` is absent, initialize/index it;
- otherwise run status/sync and rebuild only when invalid;
- require a non-empty repository-specific query before claiming CodeGraph is
  usable;
- never use `bunx`, npm downloads, or system Node for graph bootstrap.

If graph bootstrap fails, record the limitation and continue with targeted
repository exploration.

### Analysis Order

1. Architecture: modules, dependencies, entry points, subsystem boundaries.
2. Runtime lifecycle: startup, initialization, lifecycle ownership, verified
   runtime flows.
3. State and data ownership: persistence, shared managers, configuration,
   contracts.
4. Change impact: fan-out symbols, central services, propagation paths, risky
   areas.
5. Direct-only facts: manifests, build configuration, package configuration,
   testing, and used documentation.

Investigate further only when evidence is contradictory or insufficient.

### Evidence Rules

- Current repository state only; evidence over inference.
- Use graph analysis for relationships and targeted reads for verification.
- Runtime ordering must be established by graph/source evidence, not assembled
  from independent facts.
- Risk labels require evidence.
- List every documentation file that materially influenced the evidence.
- Do not modify source, configuration, or spec artifacts. Graph tooling may
  create or update only its own repository index.
- Do not include raw tool output, source blocks, whole-file content, duplicate
  results, or unrelated files in the final response.
- Consolidate large consumer lists into a count plus representative examples.

### Compact Evidence Handoff

The explorer's final response MUST be only one valid JSON object, without a
Markdown fence or surrounding prose, and MUST be at most 24,000 characters.
It must follow this contract:

```json
{
  "schema": "project-spec-evidence-v1",
  "backend": {
    "name": "homegraph|codegraph|targeted",
    "indexAction": "reused|initialized|synced|rebuilt|unavailable",
    "queries": 0,
    "limitations": []
  },
  "repository": {
    "purpose": "",
    "platform": "",
    "languages": [],
    "toolchain": [],
    "shape": "",
    "evidence": []
  },
  "modules": [
    {
      "path": "",
      "responsibility": "",
      "dependencies": [],
      "evidence": [],
      "confidence": "high|medium|low"
    }
  ],
  "entryPoints": [
    {
      "symbol": "",
      "path": "",
      "responsibility": "",
      "evidence": []
    }
  ],
  "flows": [
    {
      "name": "",
      "path": [],
      "trigger": "",
      "stateMovement": "",
      "sideEffects": [],
      "evidence": [],
      "confidence": "high|medium|low",
      "uncertainty": ""
    }
  ],
  "boundaries": [],
  "contracts": [
    {
      "symbol": "",
      "path": "",
      "role": "",
      "consumers": { "count": 0, "examples": [] },
      "evidence": []
    }
  ],
  "state": {
    "ownership": [],
    "persistence": [],
    "models": [],
    "lifecycleRules": [],
    "evidence": []
  },
  "changeArchetypes": [
    {
      "name": "",
      "path": [],
      "start": "",
      "preserve": [],
      "avoid": [],
      "applicability": "",
      "evidence": []
    }
  ],
  "risks": [
    {
      "level": "high|medium|low",
      "area": "",
      "blastRadius": "",
      "strategy": "",
      "evidence": []
    }
  ],
  "build": {
    "modules": [],
    "entryPoints": [],
    "dependencies": [],
    "targets": [],
    "permissions": [],
    "generated": [],
    "importantFiles": []
  },
  "testing": {
    "locations": [],
    "commands": [],
    "prerequisites": []
  },
  "conventions": [],
  "documentation": [],
  "uncertainties": [],
  "metrics": {
    "directReads": 0,
    "globGreps": 0,
    "rounds": 0,
    "evidenceCharacters": 0
  }
}
```

Omit unsupported optional entries from arrays rather than filling them with
guesses. Keep a maximum of 12 modules, 8 runtime flows, 12 contracts, 6 change
archetypes, 12 risks, and 20 uncertainty entries. Evidence references should be
compact repository-relative `path:symbol` or `path:line-range` strings.

If investigation is partial, return the same contract with partial arrays and
precise limitations. Never replace the JSON handoff with a prose report.

## Writer Generation

After the Task returns:

1. Verify that its response is a JSON object with
   `schema = "project-spec-evidence-v1"` and is within the size bound.
2. If the handoff is malformed, missing, or oversized, do not ingest or quote
   it and do not start repository exploration. Report `[TOOL_ERROR]
   project-spec-evidence: <reason>` so the parent workflow can apply its normal
   single retry.
3. Load `{CONFIG_ROOT}/specs/templates/project-spec-template.md`.
4. Read the existing Project SPEC when present. Preserve still-valid content
   only when supported by the new bundle; avoid duplicate top-level sections.
5. Populate the template using the evidence bundle as the exclusive source of
   repository facts. Treat absent claims as unknown.
6. Create or update exactly `{PROJECT_ROOT}/spec/project-spec.md`. Do not write
   any intermediate evidence file or modify another project file.

Requirements:

- Runtime flows require Evidence and Confidence.
- Feature Change Guidance describes reusable repository patterns, not the
  current requested feature.
- Modification Risk Map uses evidence-backed classifications.
- Existing Documentation contains all used documentation.
- Uncertain claims remain explicitly marked.
- Evidence remains compact; never reproduce the explorer JSON verbatim in the
  artifact.

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
- pipeline: `project-spec-explorer -> project-spec`;
- graph backend and index action;
- graph query, direct read, Glob/Grep, and exploration-round counts;
- compact evidence bundle character count;
- validation result, evidence sources, and limitations.
