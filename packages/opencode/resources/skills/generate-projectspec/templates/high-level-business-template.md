# High-Level Business Specification

## Purpose
Concise description of value/capability delivered by the repository.

Do not repeat disputed documented behavior as an unqualified fact.

## Actors
Include only genuine human/external actors involved in product interaction.

Do not list internal modules, repositories, services, ViewModels, DAOs, data layers, or UI components.

For a code-first repository where there is no meaningful human actor, rename this section to `Callers` and include only evidence-backed callers.

## Core Capabilities
Business-level capability names and outcomes.

No implementation call chains.

## Core Processes / Operations

For each important UX process:

#### <Process name>

**Trigger:** ...

**Flow:**
1. ...
2. ...
3. ...

**Successful outcome:** ...

**Alternative paths:**
- ...
- ...

Keep the flow focused on value delivery.
Move reusable cache/persistence/validation/fallback mechanics into `Explicit Behavioral Rules`.

### Canonical process diagram

For UX repositories, include one canonical end-to-end process diagram that visualizes business/user progression and value delivery only.

Do NOT show:
- cache checks,
- DB writes,
- API calls,
- repository/data-source branching,
- DTO mapping,
- concurrency.

Every visible node and edge label must be double-quoted.

Do not duplicate this diagram in a module business document.

## Domain Concepts
Only business/data concepts.

Policy-like notions such as freshness, timeout, retry, or retention should normally live under Behavioral Rules unless clearly first-class domain concepts.

## Explicit Behavioral Rules
Include only rules that materially affect:
- what the user/caller can do,
- what result they receive,
- when observable behavior changes,
- product-level domain policy.

Move persistence-internal rules such as upsert/overwrite semantics to the owning module unless they materially affect repository-level behavior.

## Failure and Alternative Behavior
Externally meaningful fallback/offline/empty/retry behavior not already clear in process descriptions.

## Capability to Module Mapping
Map capabilities to physical modules without class-level detail.

Internal modules belong here rather than in Actors.

Do not include findings/issues here.

## Key Evidence
3–8 important evidence anchors, including Homegraph paths corresponding to major processes.
