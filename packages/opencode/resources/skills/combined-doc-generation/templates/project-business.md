<!-- PROJECTSPEC:GENERATED:START -->
# Project Business — <project>

> Scope: `<project path>`  
> Baseline: `<revision>`  
> Architecture: [Project Architecture](architecture.md)

## Purpose and Observable Boundary

Explain what the Project does for users/callers/the surrounding system, what is in scope, and what observable value/outcomes it provides today.

## Actors and Main Journeys

Identify primary actors/callers and describe important end-to-end As-Is journeys. Project Business owns cross-module flows and absorbs meaningful contributions from modules that do not justify their own Business file.

### <Journey name>

**Actor/caller:** <...>  
**Trigger / preconditions:** <...>

1. <user/domain step and owning module>
2. <state/decision/data handoff>
3. <next major stage>
4. <observable result/exact external handoff>

**Material states / alternatives / failures:** <...>

Usually include one main Project journey Mermaid when useful; use additional diagrams only for distinct important journeys. Quote all human-readable labels.

## Module Contributions

| Module | Business contribution | Standalone Business detail |
|---|---|---|

For modules with standalone Business, summarize and link. For `project-grouped` behavior, explain enough here to keep the Project journey complete.

## Business Concepts and Data

| Concept | Meaning / lifecycle | Relevant journey(s) |
|---|---|---|

## Rules, States, Failures, and Outcomes

Capture cross-module/user-visible decisions/states/failures needed to understand Project behavior. Avoid implementation-only guardrails.

## Source Evidence

| Journey/claim | Evidence anchor | What it establishes |
|---|---|---|
<!-- PROJECTSPEC:GENERATED:END -->
