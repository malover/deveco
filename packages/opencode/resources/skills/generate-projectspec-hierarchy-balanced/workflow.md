# Balanced streaming workflow

## Startup

Run `node scripts/bootstrap_projectspec.mjs <root> --output-root docs --revision HEAD --scan-level deep`,
then `python scripts/projectspec.py start docs`. Use the compact next item; do not perform a
repository-wide pre-writing scan.

## HomeGraph gate

Run one serial `homegraph_status`, bounded `homegraph_files`, and anchored `homegraph_explore`.
Record all three with `projectspec.py graph-ready`; use `not-exposed` when revision identity is
not returned. Recover once when needed, then explicitly retry, reduce confidence, or stop.

## 3. Module-first documents

For each deterministic provider-before-consumer item from `next`, read its one matching template,
run one bounded anchored explore, write Architecture and any evidence-gated Business, and run
`projectspec.py check --scope module:<id>`. Deferred links are permitted only when their exact
target is in the deterministic plan. The check extracts summaries, anchors, governance IDs, and gaps.

## 4. Synthesize Projects

After every child module is complete, synthesize Project Business, Architecture, and governance,
then check `project:<id>`. No second repository-wide discovery pass is allowed. After all Projects
pass, `projectspec.py finish` builds the router from validated documents, inventory, and ledger,
then runs one strict workspace gate. Resume reconstructs schema-v3 state by checking existing docs;
changed modules reset their impacted ancestors.

## 5. Index and validate last

`finish` builds the index last and preserves the developer-maintained region.
