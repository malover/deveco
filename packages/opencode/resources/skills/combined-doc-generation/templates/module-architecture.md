<!-- PROJECTSPEC:GENERATED:START -->
# Module Architecture — <module>

> Scope: `<project/module path>`  
> Baseline: `<revision>`  
> Project: [Architecture](<relative-project-architecture-link>) · [Business](<relative-project-business-link>)  
> Governance: [Constraints and limitations](<relative-constraints-link>)

## Purpose and Responsibilities

Explain what this module owns, what it deliberately does not own, and why changes belong here rather than in neighboring modules.

## Architecture and Dependencies

Describe the smallest useful internal structure and explicit dependency direction.

**Depends on**
- `<module/package/platform>` — <why/contract>

**Used by**
- `<consumer>` — <how>

Include `Must not depend on` only when an evidenced `ARC-*` rule supports it; link the rule instead of copying the full governance entry.

## Runtime and Data Flow

Trace 1-3 representative entry-to-effect paths. Explain state/data/integration ownership and material error/recovery behavior, not every helper call.

```text
<real entry> -> <orchestrator> -> <owner/boundary> -> <observable effect or handoff>
```

## Extension Guidance

Keep this short and repository-specific. Prefer 1-3 high-value items.

| Change | Correct seam/owner | Existing reference/pattern | Coupled artifacts / governance |
|---|---|---|---|

<!-- Optional: include only when substantial
## State and Data Ownership

## Persistence and Consistency

## UI / Navigation Architecture

## External / Platform / Native Integrations

## Concurrency / Background Processing

## Testing / Build Patterns
-->

## Source Evidence

| Area/claim | Evidence anchor | What it establishes |
|---|---|---|
<!-- PROJECTSPEC:GENERATED:END -->
