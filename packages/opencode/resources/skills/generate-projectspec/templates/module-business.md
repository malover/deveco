> Atomic direct-write rule: this is the only active document template. Once evidence is sufficient, write the file directly; do not create a near-final prose draft elsewhere first.

> Ownership: keep detailed module-owned behavior/evidence here so repository-level documents can summarize it rather than duplicate it.

# Module Business Specification — <module-name>

## Business Contribution
What repository/product capability this module implements or supports.
Keep technical modules concise.

## Actors / Callers
UX modules: genuine user/external actors only when the module directly participates in their interaction.
Code-first modules: evidence-backed callers.

## Capabilities / Operations
Meaningful outcomes provided or supported by the module.
No class names/call chains in capability descriptions.

## As-Is Processes / Flows

### UX scope
For each module-specific flow that adds detail beyond repository level:

#### <Flow>
**Trigger:** ...

**Flow:**
1. ...
2. ...
3. ...

**Successful observable outcome:** ...

**Alternative paths:**
- ...

Verify terminal observable behavior through the actual transition/call chain.

Generate a module Mermaid diagram only if it adds state/navigation/subflow/error detail not already present in the canonical repository diagram.

### Code-first scope
For each representative operation:

#### <Operation>
**Input/trigger:** ...
**Processing:** ...
**Output/effect:** ...
**Alternatives/failures:** ...

Describe one abstraction level above implementation.

## Domain Concepts
Only module-relevant business/data concepts not already obvious from repository-level glossary.

## Explicit Behavioral Rules
Externally/domain meaningful rules owned or implemented by this module.
Keep formulas/weights/internal heuristics in architecture unless explicitly product-level.

## Relationship to Repository Capabilities
Map this module to high-level capabilities/use cases without reproducing the full high-level traceability table.

## Key Evidence
3–8 important evidence anchors.