<!-- PROJECTSPEC:GENERATED:START -->
# Subsystem Architecture — <subsystem>

> Scope: logical OpenHarmony subsystem  
> Baseline: `<revision>`  
> Evidence: Observed / Declared / Inferred / Unavailable as noted  
> Parent: [High-Level Architecture](<relative link>) · [Documentation index](<relative link>)  
> Change-safety scope: <cross-component constraints>

## Subsystem role and logical boundary

Explain the aggregated role without presenting the subsystem as a repository.

## Component inventory and ownership

| Component Project | Path | Responsibility | Public/shared surface | Dependencies/consumers | Detail |
|---|---|---|---|---|---|

## Dependency and contract map

Show component dependencies and collapsed external-subsystem relationships. Declare edge semantics.

## Shared runtime, lifecycle, data, and integration behavior

Describe only cross-component behavior; link to component detail.

## Architectural Constraints and Invariants

| ID | Cross-component constraint/invariant | Why it matters | Blast radius | Evidence |
|---|---|---|---|---|

## Extension and Modification Points

Explain where new component-level responsibility/contracts belong and how subsystem mapping remains authoritative.

## Known Limitations and Evidence Gaps

## Change Guardrails

- Verify component ownership and subsystem mapping.
- Inspect downstream/upstream consumers before changing inner kits/contracts.
- Preserve cross-component dependency direction and compatibility.
- Update component and system-level documentation/tests/build metadata.

## Findings and evidence register

| Claim area | Evidence anchor | Class | What it proves |
|---|---|---|---|
<!-- PROJECTSPEC:GENERATED:END -->
