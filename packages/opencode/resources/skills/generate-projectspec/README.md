# generate-projectspec_atomic_v4

Evidence-backed As-Is architecture and business documentation for an existing repository.

The skill uses a **hard Homegraph-first execution gate**:
- initialize once when no index exists,
- incrementally `sync` an existing index,
- prove graph readiness with an MCP query,
- explore repository/modules and trace major flows,
- only then perform targeted source verification.

Generation is module-first and repository-level documents are synthesized afterward.

See:
- `SKILL.md` — purpose and contract
- `workflow.md` — execution order
- `rules/homegraph.md` — Homegraph lifecycle, graph coverage, and source-read gate
- `rules/` — semantic rules
- `templates/` — output structure

## Sparse verification

Homegraph is the primary implementation evidence. Source reading is intentionally bounded:
- only unresolved semantic questions enter a Verification Queue,
- normally <=2 implementation files per major flow,
- normally <=6 implementation files per module,
- normally <=20 implementation files repository-wide on the first pass,
- no layer-by-layer reading after Homegraph already established the path.

These are ceilings, not quotas.

## Atomic execution variant

This variant is intended for A/B comparison against the non-atomic skill.

Differences:
- only `workflow.md` is loaded at startup;
- rules/templates are loaded lazily at the phase/document where they are needed;
- one module is analyzed and written before moving to the next;
- architecture and business documents are written sequentially, not batch-drafted;
- high-level architecture is written before high-level business;
- completed docs and compact summaries replace raw evidence as downstream synthesis inputs;
- review patches specific documents instead of regenerating everything.

### v2 performance tightening

This variant additionally:
- bans recursive implementation-tree enumeration during normal Homegraph-backed analysis;
- requires a concrete unresolved question before every implementation source read;
- tightens first-pass source-read ceilings to ~1/flow, 4/module, 12/repository;
- forbids loading multiple document templates together;
- removes skill self-enumeration and normal `git status` inspection;
- delays test/CI inspection until the high-level architecture workflow actually needs it.

### v3 changes

- shallow global discovery instead of full-repository exploration up front;
- detailed Homegraph analysis moved to just-in-time per-module execution;
- exact constants/state/error outcomes must be source-verified when graph/config cannot prove them;
- direct-to-file generation avoids composing the same document in reasoning first;
- CI/test inspection deferred to repository-level architecture synthesis.

### v4 changes

- repository truth is the selected tracked Git revision, avoiding both working-tree leakage and false "missing CI" claims;
- high-level docs summarize module-owned detail instead of repeating it;
- Graph Analysis Plan and promoted findings are maintained incrementally;
- large README/docs are searched/read selectively;
- routine execution narration is suppressed;
- semantic rules are loaded before exactly one document template.
