# Combined Documentation Workflow

## 0. Deterministic bootstrap

1. Resolve repository root, selected revision/working-tree policy, and `docs/` output root.
2. Run `scripts/bootstrap_projectspec.mjs` immediately.
3. Confirm both deterministic artifacts parse:
   - `.projectspec/workspace-inventory.json`
   - `.projectspec/documentation-plan.json`
4. Do not semantically crawl the repository during this phase.

The bootstrap produces **candidates and significance hints**, not final semantic knowledge.

## 1. Establish repository-wide HomeGraph and verify hierarchy

Read `references/homegraph.md` and `references/hierarchy.md`.

1. Use repository root for one HomeGraph index.
2. Initialize if absent; synchronize/update if present and stale.
3. Prove readiness with `homegraph_status`, `homegraph_files`, and one anchored `homegraph_explore`.
4. If a query overflows/times out/truncates, narrow/split/reduce and retry. Do not abandon HomeGraph because one read failed.
5. Verify deterministic Project/module candidates using build ownership plus graph relationships. Correct only evidenced mistakes.
6. Freeze boundaries after this correction pass.
7. Write `.projectspec/repository-intelligence.json` with:
   - repository/workspace type and concise summary;
   - verified Project identities/types/technology/build systems;
   - Project entry/key anchors;
   - verified module list/kinds;
   - boundary corrections;
   - cross-Project relationships/contracts.
8. Update plan Project `boundaryStatus` to `verified` or `corrected-and-verified` and clear `requiresHomeGraphVerification`.

Repository intelligence is intentionally shallow. **Do not use it as a substitute for the per-module deep pass.**

## 2. Process one Project at a time

Create the Project analysis JSON at the deterministic `analysisDocument` path from the plan. Keep it compact and update it as each module finishes.

Before module docs, make only a small Project-level semantic pass sufficient to understand:

- main runtime/product boundary;
- major entry surfaces;
- rough module composition/dependency direction;
- likely cross-module journeys;
- initial governance candidates.

Do not pre-analyze every module in one giant repository discovery prompt.

## 3. Analyze and write modules sequentially

Read `references/deep-analysis.md` before the first module. For each module:

### 3.1 Choose analysis depth

Start from deterministic `analysisPriorityHint`, then adjust with HomeGraph evidence.

Use:

- `deep` — behavior owner; Project entry/orchestrator; state/data/persistence foundation; native/platform/integration boundary; high fan-in/fan-out/shared hotspot; or otherwise architecture-critical.
- `standard` — supporting behavior or a non-trivial technical module with meaningful flows/dependencies.
- `focused` — small architecture-only helper/adapter with narrow responsibility and little architectural blast radius.

A module may be promoted after the first graph pass. Do not demote merely to save tokens when its ownership/state/consumer impact is broad.

### 3.2 Pass 1 — ownership/runtime discovery

Use anchored HomeGraph exploration inside the module path and record:

- responsibility and deliberate non-responsibilities;
- real entry/public/lifecycle surfaces;
- dependencies and known consumers;
- representative runtime/data/UX paths;
- detected state/data/persistence/UI/native/integration/background/testing topics;
- preliminary Business role/detail;
- unresolved questions.

For GUI modules, trace pages/abilities/components -> actions -> state/controller/service -> effect -> visible result. For non-GUI modules, trace caller -> decisions -> state/data/integration effect -> result/handoff.

### 3.3 Pass 2 — targeted enrichment for important modules

For every `deep` module, perform a **second bounded HomeGraph pass** after Pass 1. It must not simply repeat the overview.

Target at least these concerns as applicable:

1. **Reference implementations / related paths** outside the module: shared bases, analogous feature/page/service, established repository/repository-state pattern, representative tests.
2. **State/data/lifecycle ownership**: source of truth, mutation owner, persistence/cache/invalidation, reset/lifecycle, state-machine division of responsibility.
3. **Flow richness**: meaningful branches such as loading/empty/error/permission/cancel/retry/back or external/native handoff.
4. **Extension blast radius**: callers/consumers/coupled artifacts and candidate `ARC-*`/`CHK-*` rules.

If a HomeGraph call fails, narrow/split/reduce and retry. Only an unrecoverable repository graph failure ends V1.

`standard` modules receive targeted follow-ups for concrete gaps and a related/reference search when extension guidance would otherwise be generic. `focused` modules may stop after one strong pass plus exact verification.

### 3.4 Exact verification

Use bounded source/config/test reads only for named unresolved claims:

- exact branch/return/callback behavior;
- permission/security checks;
- schema/persistence semantics;
- native/platform boundary;
- product/device variants;
- representative test expectations.

### 3.5 Complete the module analysis packet before writing

Update `.projectspec/analysis/<project>.json`. A module packet should include:

```json
{
  "moduleId": "...",
  "responsibility": "...",
  "nonResponsibilities": ["..."],
  "businessRole": "behavior-owner | supporting-behavior | architecture-only",
  "businessDetail": "standalone | project-grouped | none",
  "businessRationale": ["..."],
  "analysisDepth": "focused | standard | deep",
  "analysisPasses": [
    {"kind": "ownership-runtime", "anchors": ["..."], "resolved": ["..."]},
    {"kind": "enrichment", "anchors": ["..."], "resolved": ["..."]}
  ],
  "entrySurfaces": [],
  "dependencies": [],
  "consumers": [],
  "flows": [],
  "detectedTopics": [],
  "stateDataOwners": [],
  "integrations": [],
  "referenceSearchPerformed": true,
  "referencePatterns": [],
  "conditionalSections": [],
  "diagramDecision": {
    "architecture": "required | not-useful",
    "business": "required | not-useful",
    "reason": "..."
  },
  "constraintCandidates": [],
  "evidence": [],
  "completeness": {
    "boundary": "complete",
    "runtime": "complete | not-applicable",
    "stateData": "complete | not-applicable",
    "business": "complete | not-applicable",
    "extension": "complete | not-applicable",
    "evidence": "complete"
  },
  "unknowns": []
}
```

Do not write raw source/HomeGraph dumps.

**Writing gate:** every completeness field must be resolved; a `deep` module must have at least two analysis passes; behavioral modules need at least one traced flow; `conditionalSections` records implementation-impacting topics that deserve their own Architecture section.

### 3.6 Write module Architecture

Load `templates/module-architecture.md`.

- Keep the core compact but substantive.
- Use `conditionalSections` from analysis. If state/data/persistence/UI/native/etc. was found to materially affect implementation decisions, include the corresponding section rather than squeezing it into one sentence elsewhere.
- Explain 1-3+ representative flows as needed for complexity; important modules may need more than one flow.
- Extension Guidance should be short but concrete, normally using repository reference patterns found during analysis.
- Deep/complex modules should normally include a small Mermaid architecture/runtime/state diagram when `diagramDecision.architecture=required`.
- Evidence should connect claims/symbols. Deep modules commonly need several high-value anchors (often ~5-10) but never pad to a count.

### 3.7 Write module Business when justified

Use UX + meaningful domain/data-model discovery as the primary V1 signal, following the older deep approach.

- `behavior-owner` -> standalone Business.
- `supporting-behavior` -> standalone only if independently useful; otherwise `project-grouped`.
- `architecture-only` -> no Business.

Load `templates/module-business.md` only for standalone Business.

Trace important journeys beyond the happy path when the UI/domain model shows meaningful loading/empty/selection/state/permission/cancel/error/retry/back variants. Do not inventory every widget.

Write docs immediately after this module's analysis is complete. Then proceed to the next module.

## 4. Synthesize the Project after all modules

Only after every module packet/doc is complete:

1. Re-read the compact Project analysis JSON, not all source.
2. Write Project `architecture.md` as compositional synthesis:
   - module responsibilities/direction;
   - major cross-module flows;
   - external/platform/native boundaries;
   - change-ownership map.
3. Write Project `business.md` always:
   - product/system purpose;
   - main end-to-end journeys;
   - domain concepts;
   - meaningful states/failures;
   - contributions from `project-grouped` modules.
4. Derive Project governance candidates from all module packets plus Project composition and write `constraints-and-limitations.md`:
   - high-value Project/module-scoped `ARC-*` invariants;
   - actionable `CHK-*` change checks;
   - evidence-only `LIM-*` gaps with implementation impact.
5. Cross-check Project docs against governance and child docs. Do not duplicate module internals upward.
6. Save a compact Project summary in its analysis JSON and release detailed active context.

## 5. Build repository index after every Project

Write `docs/index.md` **last** using the bundled deterministic builder:

```bash
python <skill-dir>/scripts/build_index.py <docs-root> \
  --plan <docs-root>/.projectspec/documentation-plan.json \
  --intelligence <docs-root>/.projectspec/repository-intelligence.json
```

The index intentionally surfaces useful metadata already gathered in JSON rather than asking an LLM to rediscover it:

- repository/workspace summary and selected revision;
- Project type/summary/technology and links to Architecture, Business, and governance;
- each module's responsibility, Business role, key entry surfaces, and Architecture/Business links;
- cross-Project relationships when present.

Keep it concise: no raw flow packets, evidence dumps, or governance duplication.

## 6. Validate, repair once, validate again

Read `references/update-and-validation.md`.

Run the mechanical validator. Then perform the semantic audit, emphasizing richness/implementation usefulness:

- Is a complex module still just “purpose + one flow + three files” despite analysis evidence? If so, repair the named missing state/data/lifecycle/reference/branch detail.
- Are conditional sections missing even though module analysis marked them for inclusion?
- Did a deep module actually perform a separate enrichment/reference pass?
- Are Business journeys limited to happy path when material states/branches were observed?
- Does Extension Guidance identify concrete existing patterns/seams?
- Are module-scoped drift risks represented in Project governance?
- Are diagrams present where analysis marked them required and do they validate?
- Does `index.md` link every Project and standalone module document and reflect analysis metadata?

Patch only concrete misses, rebuilding index if paths/classifications changed. Run validator once more and stop.

## V1 update note

Future update mode will reanalyze changed/impacted modules and preserve valid docs iteratively. For now keep stable paths, generated markers, analysis JSON, and manual governance content so that future update work can build on this baseline.
