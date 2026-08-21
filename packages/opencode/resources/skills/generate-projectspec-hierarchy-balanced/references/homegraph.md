# HomeGraph readiness and fallback

HomeGraph supplies bounded semantic evidence after the canonical workspace inventory. Run one
status check per run and one anchored explore per Project or module; never overlap broad explores.
The `projectPath` is always the directory in which DevEco Code was invoked. Queries and fallback
source evidence must remain inside it.

1. Run `homegraph_status` once.
2. If unavailable, call `question` before fallback. Stop/retry is recommended; reduced-confidence
   direct source evidence requires explicit approval and must be recorded.
3. Use exact inventory-provided Project/module paths and entry surfaces in bounded
   `homegraph_explore` calls with the invocation root as `projectPath`.
4. Allow at most one focused fallback per scope for an exact missing symbol or relationship.
5. Record only compact readiness, anchors, claims, flows, unknowns, and the explicit fallback
   decision. Never store raw graph responses, source dumps, secrets, tokens, or personal data.

The v2 readiness object is `{readiness, statusSummary, filesSummary, exploreAnchor, revision}`.
`readiness` is `pending`, `ready`, or `reduced-confidence`; there is no legacy migration.
