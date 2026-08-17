# Generation Workflow

This workflow is optimized for large repositories. Keep global discovery shallow, analyze one module only when it is about to be documented, and write each document directly once evidence is sufficient.

## Startup — minimal load only

1. Read this `workflow.md`.
2. Do not enumerate the skill directory.
3. Do not preload rules, templates, or `README.md`.
4. Never load more than one document template at a time.
5. Do not inspect Git working-tree state unless explicitly requested.

## Phase 0 — Homegraph readiness

Load only:
- `rules/homegraph.md`

Then:
1. Resolve the absolute repository root.
2. Initialize or incrementally synchronize Homegraph.
3. Prove readiness with an actual Homegraph MCP query.
4. Stop if Homegraph remains unusable after recovery.

## Phase 1 — Minimal repository discovery

Load only:
- `rules/discovery.md`

Goal: learn just enough to schedule module work. Do not comprehensively analyze the repository yet.

Maintain two compact transient records from this point onward:
- **Graph Analysis Plan** — module worklist, candidate flows, cross-module relationships, and unresolved graph questions.
- **Promoted Findings List** — repository-level discrepancies/risks promoted from module analysis, with the originating module and evidence anchor.

Update these records incrementally; do not reconstruct them from scratch later.

Establish only:
- repository boundary,
- physical modules,
- linked repositories/packages,
- root build/package model,
- high-level cross-module dependency skeleton,
- obvious application/framework entry points,
- coarse major capability areas.

Use:
- root/module metadata and configuration,
- one repository-level Homegraph exploration,
- one lightweight per-module Homegraph exploration only if required to identify responsibility/scope.

Do not:
- trace every major flow yet,
- inspect implementation source yet,
- inspect tests/CI yet,
- enumerate module source trees,
- build a repository-wide findings inventory,
- produce prose document drafts.

Create a compact **Module Worklist**:
- module name/type,
- coarse responsibility,
- known inbound/outbound module relations,
- candidate flows/integrations that should be analyzed when this module is processed.

Then move immediately to module generation.

Do not emit user-facing narration for ordinary internal steps. Keep execution silent except for meaningful milestone summaries, blocking errors, or final completion.

## Phase 2 — Just-in-time module analysis and writing

Process one physical module at a time.

For each module:

### 2A. Load only the evidence needed for this module

Using the Module Worklist:

1. Perform focused Homegraph exploration for this module.
2. Trace only the module's major flows that are candidates for documentation.
3. Create a small Verification Queue for unresolved semantic claims.
4. Before every implementation source read, state internally:
   - exact unresolved question,
   - graph/config evidence that raised it,
   - smallest symbol/file expected to resolve it.
5. Read source only to resolve those questions.
6. Build a compact normalized module summary.

Do not analyze future modules in advance.

### Correctness overrides read budgets

Source-read budgets are optimization ceilings, not correctness constraints.

If documentation depends on an exact:
- constant,
- threshold,
- condition,
- state transition,
- error/fallback outcome,
- contract,
- persistence rule,
- externally observable behavior,

and Homegraph/config evidence does not establish it precisely, **read the defining source**.

Never substitute confidence, README wording, naming, comments, or inference merely to avoid a source read.

### 2B. Write module architecture directly

Load semantic rules first:
- `rules/architecture.md`
- `rules/findings.md` only if candidate findings exist
- `rules/diagrams.md` only if needed

Only after those rules are loaded, load exactly one template:
- `templates/module-architecture.md`

Rules:
- `module-architecture.md` is the only loaded template.
- Once evidence is sufficient, write `docs/modules/<module>/architecture.md` directly.
- Do not first compose a full prose draft, section-by-section near-final outline, or exhaustive evidence-anchor list in reasoning.
- A short checklist of unresolved items is allowed; final prose belongs in the file.
- Do not load the business template until the architecture file exists.

### 2C. Write module business directly

Only after the architecture file exists.

Load semantic rules first:
- `rules/business.md`
- `rules/diagrams.md` only if needed

Only after those rules are loaded, load exactly one template:
- `templates/module-business.md`

Rules:
- `module-business.md` is the only loaded template.
- Write `docs/modules/<module>/business.md` directly from the normalized summary plus completed module architecture where useful.
- Do not pre-draft future modules or high-level docs.

### 2D. Collapse context before next module

Retain only:
- compact normalized module summary,
- completed module docs,
- promoted repository-level findings,
- compact traceability facts.

Discard unnecessary source-level detail from active reasoning before processing the next module.

## Phase 3 — Repository synthesis

Only after all module docs exist.

### 3A. High-level architecture

Load semantic rules first:
- `rules/architecture.md`
- `rules/findings.md` if promoted findings exist
- `rules/developer-workflow.md` only if build/run/test/CI content is required
- `rules/diagrams.md` only if needed

Only after those rules are loaded, load exactly one template:
- `templates/high-level-architecture.md`

Now inspect repository-level evidence that was intentionally deferred:
- CI workflows,
- test presence/scope,
- root developer commands,
- deployment/infrastructure config when present.

For Git repositories, repository-level evidence must be grounded in the selected revision according to `rules/discovery.md`, not inferred from raw working-tree presence/absence.

Use:
- completed module architecture docs,
- compact module summaries,
- cross-module Homegraph evidence,
- repository-level config/docs.

Re-query Homegraph/source only for a concrete unresolved repository-level claim.

Write `docs/high-level-architecture.md` directly. Do not pre-draft high-level business.

### 3B. High-level business

Only after high-level architecture exists.

Load semantic rules first:
- `rules/business.md`
- `rules/diagrams.md` only if needed

Only after those rules are loaded, load exactly one template:
- `templates/high-level-business.md`

Use primarily:
- completed module business docs,
- high-level architecture,
- compact traceability facts,
- declared repository business/document evidence.

Do not replay implementation-source analysis.

Write `docs/high-level-business.md` directly.

## Phase 4 — Cross-level review

Review generated docs first.

Load only the specific rule needed to resolve an actual issue. Reopen Homegraph/source only for a concrete contradiction or unsupported claim.

Verify:
- major claims have sufficient graph/source/config evidence,
- exact behavioral values were not inferred without verification,
- module and repository-level docs are consistent,
- findings are centralized/deduplicated,
- business flows reach terminal observable outcomes,
- capabilities map to correct modules,
- data/integration ownership is clear,
- business docs do not leak call-chain implementation detail,
- architecture docs do not invent normative constraints,
- working-tree/Homegraph operational state did not leak into product docs,
- CI/test claims are evidence-backed,
- single-module repos avoid near-duplicate high-level/module business docs.

Patch only affected documents. Do not regenerate all documents by default.
