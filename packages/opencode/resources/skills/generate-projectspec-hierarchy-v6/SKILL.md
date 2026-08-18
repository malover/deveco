---
name: generate-projectspec-hierarchy-v6
description: Generate or update substantial, evidence-backed As-Is Business and drift-prevention Architecture documentation for ArkTS, DevEco, OpenHarmony, and mixed software workspaces. Use for one repository, monorepos, Git-submodule or Repo-tool multi-repository checkouts, including HAP/HAR/HSP modules, OpenHarmony components/parts, GN targets, UX applications, services, libraries, native bridges, and large incremental runs.
---

# Generate ProjectSpec Hierarchy v6

Produce a durable specification, not a repository tour.

- **Business** must let a person understand value, actors, complete UX/system journeys, states, decisions, rules, data, failures, and observable outcomes.
- **Architecture** must let an agent safely implement a feature without violating ownership, dependency direction, lifecycle, public contracts, data consistency, or platform/build constraints.

Generate **As-Is** documentation. Do not invent future requirements, owners, roadmaps, KPIs, SLAs, ADR rationale, target architecture, rollout plans, or compliance obligations. State an observed limitation or evidence gap instead.

## Non-negotiable invariants

1. Run the deterministic bootstrap immediately after resolving root/revision/output. This single command creates `docs/.projectspec/` and atomically writes both `workspace-inventory.json` and `documentation-plan.json` before semantic analysis.
2. Discover physical ownership before semantic grouping. Freeze Workspace -> Project -> Module/Build-unit boundaries from manifests/descriptors.
3. Keep every physical unit visible in an Architecture inventory, even when grouped.
4. Make Business capability-complete and behavior-rich, not module-count-complete.
5. Classify every standalone Architecture module as `behavior-owner`, `supporting-behavior`, or `architecture-only`; generate Business docs only for the first two.
6. Add concise As-Is Given/When/Then characterization examples for important `RULE-*`/`FLOW-*` behavior, with observable Then outcomes and evidence status; never add Cucumber dependencies or `.feature` files.
7. Add compact business-oriented Mermaid flow/state diagrams only for major journeys with meaningful branching, state transitions, multiple actors, or module/platform handoffs.
5. Trace every major capability from a real trigger to an observed local terminal outcome or exact external handoff. “Not inspected” is not `Unavailable`.
6. Do not derive runtime behavior, ownership, lifecycle status, or terminal outcomes from names/directories alone.
7. Make every Architecture level a drift-prevention contract: state invariants, permitted dependency direction, forbidden shortcuts, extension points, constraints, limitations, and pre-change checks.
8. Put full detail once at the lowest useful owner; parents synthesize implications and link downward.
9. Process one Project and one documentation unit at a time; checkpoint and collapse large runs.
10. Preserve manual content outside ProjectSpec markers during updates.
11. Validate structure and semantics before completion. Mechanical validation never proves factual correctness.

## Deterministic startup

As the first repository action, run:

```bash
node <skill-dir>/scripts/bootstrap_projectspec.mjs <repository-root> --output-root docs --revision <revision>
```

Use `bun` instead of `node` when Node is unavailable. The script is dependency-free and performs one bounded descriptor/file pass; it does not use `rg`, Homegraph, or an LLM. It atomically creates:

- `docs/.projectspec/workspace-inventory.json`: Projects, modules/build units, descriptors, declared surfaces, source counts, topology, and resolvable dependency edges.
- `docs/.projectspec/documentation-plan.json`: mandatory structural documents, significance candidates, capability anchors, and one semantic-enrichment contract.

Do not ask the model to reconstruct these files from scratch. If the script cannot execute, use `project_spec_analyze` only if it creates both artifacts; otherwise use one equivalent descriptor-first fallback and write both artifacts before continuing. Never install tools during the run.

The generated plan is a **structural baseline**, not permission to publish shallow files. After representative semantic tracing, enrich it once: classify every capability candidate, add source-discovered capabilities, consolidate unjustified standalone candidates, and assign exactly one detailed Business owner to every major capability.

## Output layouts

For one Project, omit a redundant `projects/` wrapper:

```text
docs/
├── index.md
├── high-level-business.md
├── high-level-architecture.md
├── capabilities/<capability-id>/business.md       # when a distributed flow needs room
└── modules/<module-id>/{business,architecture}.md # significance-based
```

For multiple Projects:

```text
docs/
├── index.md
├── high-level-business.md
├── high-level-architecture.md
├── projects/<project-relative-path>/
│   ├── business.md
│   ├── architecture.md
│   ├── capabilities/<capability-id>/business.md
│   └── modules/<module-id>/{business,architecture}.md
└── subsystems/<subsystem>/architecture.md         # optional OpenHarmony roll-up
```

Use recognizable project-relative paths to prevent collisions. Do not create standalone files that only repeat descriptor facts.

## Load progressively

1. Read [workflow.md](workflow.md).
2. During startup/hierarchy review, read [references/hierarchy.md](references/hierarchy.md).
3. Before a large run, read [references/evidence-and-performance.md](references/evidence-and-performance.md).
4. Before semantic graph use, read [references/homegraph.md](references/homegraph.md).
5. Before enriching the plan, read [references/document-model.md](references/document-model.md).
6. Before Business analysis/writing, read [references/business.md](references/business.md).
7. Before Architecture analysis/writing, read [references/architecture.md](references/architecture.md).
8. Read [references/diagrams.md](references/diagrams.md) only when a diagram is useful.
9. Load exactly one matching template immediately before writing its document.
10. Before updating or finishing, read [references/update-and-validation.md](references/update-and-validation.md).

Never preload all references or templates.

## Evidence and tool policy

- Establish a queryable HomeGraph for each frozen Project before implementation-source semantic analysis. If `<Project-root>/.homegraph/` is missing, first run `homegraph init -i <Project-root>`; if it exists, synchronize it incrementally. Then prove readiness through the MCP status/files/anchored-explore sequence. If one bounded recovery attempt fails, require explicit user approval before bounded fallback.

- Use manifests/build/package descriptors for hierarchy and declared topology; use semantic evidence for behavior.
- Use the built-in Goal HomeGraph MCP sequence (`homegraph_status` -> `homegraph_files` -> anchored `homegraph_explore`) before semantic analysis, then use focused graph calls repeatedly for owners and major flows. Do not assume `trace_calls` exists.
- If initialization, synchronization, and one bounded recovery attempt cannot produce a queryable graph, ask the user whether to retry, approve bounded fallback, or stop. Never silently choose fallback.
- Stop Homegraph after the first memory-budget failure and use bounded symbol/source inspection; do not launch parallel explorations into one index.
- Inspect representative controllers/state owners/callbacks/persistence/native bridges/tests, not only package indexes.
- Verify exact constants, branches, permissions, security behavior, returned results, persistence effects, and failure recovery from defining source/config/contracts.
- Classify local `file:`/workspace/native source as repository-owned, never external.
- Treat tracked content at the selected revision as default truth. Never copy secrets, tokens, signing material, personal data, or credential values into docs.

## Completion contract

Finish only when:

- both deterministic metadata artifacts exist, parse, and match the selected scope;
- all physical Projects/modules appear in Architecture inventories;
- every capability candidate is classified as major, sub-capability, technical support, or excluded with reason;
- every major capability has one substantive owner with UX/system journey, states, rules, data, alternatives/failures, and a terminal outcome/handoff backed by evidence;
- every Architecture document contains `Architectural Constraints and Invariants`, `Known Limitations and Evidence Gaps`, and `Change Guardrails` with scope-appropriate substance;
- architecture describes ownership, entry/public surfaces, consumers, runtime/data flows, state/persistence, integrations, build/test posture, extension points, and blast radius where evidenced;
- every planned document adds unique value and is linked from its parent and `docs/index.md`;
- no document contains unsupported certainty, empty boilerplate, unresolved placeholders, or ambiguous dependency arrows;
- `scripts/validate_docs.py <docs-root> --inventory <inventory> --plan <plan>` passes, followed by a manual semantic review against representative source evidence.
