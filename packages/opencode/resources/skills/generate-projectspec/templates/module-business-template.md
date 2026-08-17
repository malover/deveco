# Module Business Specification — <module-name>

## Business Contribution
What repository/product capability this module implements or supports.

Technical modules may be brief.

## Actors / Callers
For UX modules:
- include only genuine user/external actors if the module directly participates in their interaction.

For code-first modules:
- include only evidence-backed callers.

Do not list internal dependencies merely because they call or are called by this module.

## Capabilities / Operations
Meaningful outcomes provided or supported by the module.

No class names/call chains in capability descriptions.

## Processes / Flows

### UX scope

For each important flow:

#### <Flow name>

**Trigger:** ...

**Flow:**
1. ...
2. ...
3. ...

**Successful outcome:** ...

**Alternative paths:**
- ...
- ...

Keep the happy path business-level.
Move reusable technical conditions into `Explicit Behavioral Rules`.

### Module diagram rule

Generate a Mermaid diagram ONLY if it adds detail not already present in the canonical repository-level business diagram.

Good module diagrams:
- state/navigation detail,
- module-local sub-flow,
- distinct error/retry path.

If it would be substantially the same as the repository diagram, omit it.

Visible labels must use business/user meanings, not raw technical state identifiers.

When generated, every visible node and edge label must be double-quoted.

### Code-first scope

For each representative operation:

#### <Operation name>

**Input/trigger:** ...

**Processing:** ...

**Output/effect:** ...

**Alternatives/failures:** ...

Describe the operation one abstraction level above implementation.

Prefer:
- "Resolve the query using the configured geocoding service."

Avoid:
- "Construct a URL and issue an HTTP GET."

Exact protocol/class/endpoint details belong in architecture.

## Domain Concepts
Only business/data concepts.

Do not include screens, ViewState, ViewModel, DAO, repository/data-source classes, or implementation-specific state.

Policy-like notions such as freshness/timeout/retry normally belong under Behavioral Rules.

## Explicit Behavioral Rules
Only externally/domain meaningful rules.

Implementation-owned rules such as upsert/overwrite semantics may live here when they meaningfully define this module's business/data behavior, even if they do not belong at repository level.

Do not include:
- `Promise.all`,
- internal concurrency,
- mapper ordering,
- singleton usage,
- dependency injection details.

## Relationship to Repository Capabilities
Map this module to high-level capabilities.

Do not include issue/inconsistency sections.

## Key Evidence
3–8 important evidence anchors.
