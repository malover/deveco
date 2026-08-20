# Business reconstruction

Business is As-Is and evidence-backed. Give each important `FLOW-*` a real trigger and a
local observable terminal outcome or exact external handoff. Include material alternate,
failure, cancellation, permission, retry, and recovery paths only when observed.

## UI-first path

For UI modules trace page/ability state -> user action -> controller/orchestrator -> state /
data effect -> navigation/back/dismiss/cancel -> visible result. Include displayed/edited/
selected domain data, loading/empty/error/offline/permission/success/retry states,
localization/accessibility behavior, and actor/caller boundaries without dumping widgets.

## No-UI path

For services, libraries, workers, and APIs reconstruct caller/system/API/operational journey:
trigger and preconditions -> validation/decisions -> domain/data transformation ->
persistence/integration effect -> callback/result/handoff -> recovery. Meaningful domain
behavior can justify Business; DTO/schema/repository plumbing alone cannot.

Use `RULE-*` decision tables, domain glossary, persistence-visible effects, and concise
As-Is Given/When/Then characterization examples. `Then` must be observable and each example
has evidence status. These are not executable feature files. Use compact Business flow/state
Mermaid only when branching, state transitions, multiple actors, or handoffs make it useful.

Business links Architecture and governance IDs; it does not duplicate implementation or
governance prose.
