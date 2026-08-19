<!-- PROJECTSPEC:GENERATED:START -->
# Module Architecture — <module>

> Scope: `<project/module path>`  
> Baseline: `<revision>`  
> Project: [Architecture](<relative-project-architecture-link>) · [Business](<relative-project-business-link>)  
> Governance: [Constraints and limitations](<relative-constraints-link>)

## Purpose and Responsibilities

Explain what this module owns, what it deliberately does not own, and why changes belong here rather than in neighboring modules. Name the primary entry/public surfaces when they clarify the boundary.

## Architecture and Dependencies

Describe the smallest useful internal structure and explicit dependency direction. For a deep module, explain important sub-owners (controllers/state managers/repositories/native facade/etc.) instead of flattening them into one generic paragraph.

**Depends on**
- `<module/package/platform>` — <contract/reason>

**Used by**
- `<consumer>` — <how/why>

Include `Must not depend on` only when an evidenced `ARC-*` supports it; link the rule rather than copying governance.

## Runtime and Data Flow

Trace the representative entry-to-effect paths necessary to understand this module. One flow can be enough for a focused helper; a deep module may need several distinct flows/lifecycles.

### <Flow name>

1. `<real entry/trigger>` ...
2. `<orchestrator/state/data owner>` ...
3. `<persistence/platform/native/module handoff>` ...
4. `<observable effect/callback/state>` ...

Include material error/cancel/recovery/lifecycle differences when they affect architecture. Do not enumerate every helper call.

<!-- Insert the exact conditional sections selected in the module analysis packet. Omit only when analysis marked them unnecessary.

## State and Data Ownership
Explain source(s) of truth, mutation ownership, FSM/state-manager responsibility split, transient/persisted state, propagation, lifecycle/reset/invalidation, and relevant ordering.

## Persistence and Consistency
Explain repository/database/cache/schema/version/invalidation/save/refresh boundaries and consistency assumptions.

## UI / Navigation Architecture
Explain page/ability/component composition, navigation/loader/controller ownership, state-to-view relationship, and device/product variants that affect extension.

## External / Platform / Native Integrations
Explain the local facade/bridge, ownership boundary, call/return lifecycle, error contract, and what remains external.

## Concurrency / Background Processing
Explain async/background ownership, ordering/cancellation/lifecycle interactions when evidenced.

## Testing / Build Patterns
Explain the representative verification/build/test pattern useful for changes in this module.
-->

## Extension Guidance

Keep this short but concrete. Prefer a few high-value repository patterns from the explicit reference search.

| Change | Correct seam/owner | Existing reference/pattern | Coupled artifacts / governance |
|---|---|---|---|

<!-- If analysis marked architecture diagram required, add a compact evidence-backed Mermaid block here or near the flow it explains. Quote every human-readable label. -->

## Source Evidence

Use a curated set of anchors that supports the important claims. Deep modules normally need evidence across entry, state/data, runtime/integration, and extension/reference concerns; do not cap this to an arbitrary three rows.

| Area/claim | Evidence anchor | What it establishes |
|---|---|---|
<!-- PROJECTSPEC:GENERATED:END -->
