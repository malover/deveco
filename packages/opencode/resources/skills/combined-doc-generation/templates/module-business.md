<!-- PROJECTSPEC:GENERATED:START -->
# Module Business — <module>

> Scope: `<project/module path>`  
> Baseline: `<revision>`  
> Business role: `behavior-owner | supporting-behavior`  
> Project: [Business](<relative-project-business-link>) · [Architecture](<relative-project-architecture-link>)

Use this template only when just-in-time semantic analysis justifies standalone module Business.

## Role in the Product

Explain the independently understandable UX/domain behavior owned here and its boundary. For `supporting-behavior`, identify the larger Project journey it supports rather than inventing a new capability.

## User / Domain Flows

Describe the important journey(s) from trigger to observable result. Do not force exactly one happy path: include the distinct flows/states needed by the analyzed UX/domain behavior.

### <Flow name>

**Trigger / preconditions:** <...>

1. <user/domain state/action>
2. <decision/state/data effect>
3. <handoff/transition>
4. <observable result>

**Material states / alternatives / failures:** <loading/empty/selection/permission/cancel/back/error/retry/etc. only when evidenced>

<!-- If analysis marked business diagram required, include a compact Mermaid flow/state diagram with quoted labels. -->

## Business Concepts and Data

| Concept | Business meaning / lifecycle | Produced, changed, or consumed here |
|---|---|---|

## Rules, States, and Outcomes

Capture observable decisions/states that materially explain behavior. Use a compact table when several states/rules are comparable.

<!-- Optional when the journey is cross-module and the interaction itself matters.
## Interaction with Other Modules
-->

## Source Evidence

| Behavior/claim | Evidence anchor | What it establishes |
|---|---|---|
<!-- PROJECTSPEC:GENERATED:END -->
