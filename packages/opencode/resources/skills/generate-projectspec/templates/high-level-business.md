> Atomic direct-write rule: this is the only active document template. Once evidence is sufficient, write the file directly; do not create a near-final prose draft elsewhere first.

> Deduplication: summarize module-owned detail; include it here only when required for cross-module/system-wide understanding. Prefer pointing to the responsible module over replaying implementation detail.

# High-Level Business Specification

## Purpose
Concise description of the As-Is value/capability delivered by the repository.
Do not repeat disputed documented behavior as an unqualified fact.

## Actors
Only genuine human/external actors participating in product interaction.
For code-first repositories rename to `Callers` when appropriate.

## Core Capabilities
Observed business-level capabilities and outcomes.
Names must not overstate guarantees.

## As-Is Processes / Use Cases
For each important UX process/use case:

#### <Process / Use Case>
**Trigger:** ...

**Flow:**
1. ...
2. ...
3. ...

**Successful observable outcome:** ...

**Alternative paths:**
- ...

Follow the actual transition/call chain through to the terminal observable state.
Do not infer an outcome merely because an isolated component contains a matching rendering branch.

### Canonical process diagram
For UX repositories, include one canonical value-delivery diagram when useful.
No implementation mechanics.

## Domain Concepts / Business Glossary
Important business/data concepts, concise meanings, and relationships where useful.
Do not list implementation classes as domain concepts.

## Explicit Behavioral Rules
Only rules materially affecting what users/callers can do, results received, observable behavior, or product/domain policy.

## Failure and Alternative Behavior
Externally meaningful fallback/offline/empty/retry/error behavior not already clear above.

## Capability Traceability
Compact mapping:

| Capability / Use Case | Supporting Module(s) | Architecture Responsibility / Flow | Important Data | External Integration |
|---|---|---|---|---|

Keep this lightweight. It represents observed implementation traceability, not original business requirements.

## Key Evidence
3–8 important evidence anchors, including Homegraph paths corresponding to major processes when relevant.