# HomeGraph readiness and fallback

HomeGraph is the only semantic graph provider for this skill. The index is repository-wide
so module packets can account for shared consumers and cross-Project contracts. Run one
readiness chain per run; do not repeat status checks or overlap broad explores.

## Lifecycle

1. Check whether `<repository-root>/.homegraph/` exists.
2. If absent, run the installed `homegraph init -i <repository-root>` command.
3. If present, compare indexed revision/scope with the selected revision and synchronize
   with the installed HomeGraph update/index command. Never guess a provider-specific API.
4. Prove readiness serially: `homegraph_status`, then `homegraph_files`, then one bounded
   anchored `homegraph_explore` using a real descriptor, module path, ability, page, route,
   or entry symbol.
5. If any readiness step fails, make one bounded recovery/reindex attempt and probe again.
6. If it still fails, ask the user to **retry**, **approve reduced-confidence direct scanning**,
   or **stop**. Continue only after explicit approval and record the decision.

No silent fallback and no CodeToGraph fallback are permitted. A failed query is narrowed by
path/symbol/question, reduced in depth/limit, or split serially before recovery is attempted.

## Coverage ledger

Store only compact facts in `project-scan-report.json`: readiness, index/repository revision,
anchors, Project/module coverage, representative trigger-to-outcome flows, state/data/
persistence/integration coverage, unresolved questions, recovery attempts, and fallback
approval. Do not store raw graph responses, source dumps, secrets, tokens, or personal data.

## Query progression

Use `homegraph_explore` once first for each significant named module or flow. Use exact
`homegraph_node` for a specific symbol/file, callers/callees for directional packet gaps, and
`homegraph_impact` only when blast radius changes documentation. Keep calls serial, bounded,
and scoped to the current Project/module after repository readiness is proven. Record compact
claims and release detailed response context after each packet.
