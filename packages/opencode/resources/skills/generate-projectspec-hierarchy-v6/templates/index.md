<!-- PROJECTSPEC:GENERATED:START -->
# <System or Project> Documentation

> Scope: `<relative root>`  
> Baseline: `<full revision or working tree>`  
> Evidence: Observed / Declared / Inferred / Unavailable as noted

## Start here

- [Business specification](high-level-business.md) — value, actors, UX/system journeys, processes, states, rules, data, failures, and outcomes.
- [Architecture specification](high-level-architecture.md) — ownership, entry points, runtime/data flows, constraints, limitations, and change guardrails.

## Find the right owner for a change

| Goal/change area | Business capability/process | Architecture owner/guardrails | Tests/evidence |
|---|---|---|---|

Keep this compact and link to substantive sections.

## Project or module inventory

| Unit | Role | Kind | Business role | Business | Architecture | Status |
|---|---|---|---|---|---|

Use Projects in multi-project mode and modules in single-project mode. Show `Grouped in parent` rather than dead links.

## Capability map

| Capability | Primary actor/caller | Outcome | Detailed Business owner | Architecture owner |
|---|---|---|---|---|

## Detailed documentation

List every generated standalone document grouped by Project, capability, and module.

## How to use these specifications

- Before feature work: start from the capability, then read the owning Architecture constraints/guardrails.
- Before changing a shared contract/data owner: inspect listed consumers and blast radius.
- During review: verify affected flows/rules, constraints, limitations, tests, and documentation links.

## Evidence and limitations

State selected-revision policy, unavailable Projects/indexes/external contracts, and material inference limits. Do not turn this page into the substantive specification.
<!-- PROJECTSPEC:GENERATED:END -->
