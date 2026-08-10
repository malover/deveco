# Project SPEC

> Repository-level current-state context. This document describes what exists in the codebase today; it must not describe the requested feature or propose future architecture.

## Project Overview

- **Purpose**: [What the application/project does]
- **Primary platform**: [HarmonyOS/OpenHarmony/other]
- **Primary languages**: [ArkTS/TypeScript/C++/other]
- **Toolchain**: [DevEco/Hvigor/build system and relevant versions when verified]
- **Repository shape**: [single app / multi-module / monorepo]

## Graph Analysis

- **Backend**: [homegraph/codegraph/none]
- **Index action**: [reused/initialized/synced/rebuilt/unavailable]
- **Graph queries**: [successful repository-specific query count]
- **Direct source reads**: [approximate count]
- **Limitations**: [only when applicable]

## Project Structure

```text
<compact tree of architecturally meaningful source/config directories>
```

Include only directories that materially affect implementation. Omit generated output, caches, vendored dependencies, and exhaustive leaf-file listings.

## Module Semantics

| Module Path | Responsibility | Key Dependencies |
|---|---|---|
| `<relative/path>` | <what this module owns> | <important internal/external dependencies> |

## Runtime Entry Points

| Entry Point | Path | Responsibility |
|---|---|---|
| <ability/page/service/native entry> | `<relative/path>` | <how runtime enters this part of the system> |

## Key Runtime Flows

For each high-value flow, describe the observed path through the current implementation.

### <Flow Name>

`<entry>` → `<component/service>` → `<dependency/storage/native boundary>`

- **Trigger**: <what starts the flow>
- **State/data movement**: <important state or payload transitions>
- **Side effects**: <storage/network/system/native actions>

## Architecture and Dependency Boundaries

- <observed layer/module boundary and responsibility>
- <allowed/actual dependency direction where verified>
- <cross-module communication mechanism>
- <important native, IPC, service, or external boundary>

Do not invent an ideal architecture. Record the architecture that exists in source.

## Key Interfaces and Shared Contracts

| Contract / Symbol | Path | Consumers / Role |
|---|---|---|
| `<interface/type/api>` | `<relative/path>` | <why changes here have downstream impact> |

## State and Data

- **State ownership**: <where important application/UI/domain state lives>
- **Persistence**: <preferences/database/files/other storage that is actually configured or used>
- **Data models**: <important shared/domain entities>
- **Synchronization/lifecycle rules**: <only when established by source>

## Feature Change Guidance

Describe a small number of recurring change archetypes that are clearly supported by the existing repository structure. This is not guidance for the user's current requested feature and must not propose new architecture.

For each archetype, provide the likely existing modification path and repository conventions an implementation agent should preserve.

### <Change Archetype>

`<entry/config/UI>` → `<presenter/viewmodel/model>` → `<state/persistence/service>` → `<affected runtime component>`

- **Start here**: <existing file/symbol or module that owns this kind of change>
- **Likely propagation**: <verified current-state path through existing modules>
- **Preserve**: <existing conventions/contracts/state ownership/dependency direction>
- **Avoid**: <existing architectural boundary that should not be bypassed, only when evidence supports it>

Prefer 3-6 high-value archetypes such as adding a setting, changing layout behavior, adding a feature module capability, modifying persistence, or changing an app lifecycle flow when those archetypes are supported by the repository.

## Modification Risk Map

Classify the most change-sensitive current areas by practical implementation risk. Base risk on graph evidence, fan-in/fan-out, shared state ownership, lifecycle position, persistence ownership, and cross-module reach.

| Risk | Area / Symbol | Potential Blast Radius | Evidence | Safer Change Strategy |
|---|---|---|---|---|
| High/Medium/Low | `<path or symbol>` | <modules/flows/state affected> | <callers/callees/dependencies/ownership evidence> | <how to minimize impact using existing repository patterns> |

Keep this distinct from `Change-Sensitive Areas`: the risk map must prioritize and classify areas, while `Change-Sensitive Areas` records detailed evidence about broad-impact symbols.

## Build and Configuration

Record information that code-graph analysis does not reliably capture by directly inspecting repository metadata and executable configuration.

- **Modules/products**: <verified module and product configuration>
- **Build entry points**: <hvigor/build commands/config files>
- **Dependencies**: <important package/module dependencies>
- **SDK/API targets**: <when explicitly configured>
- **Permissions/capabilities**: <when explicitly configured>
- **Generated code/resources**: <locations and generation rules>
- **Important config files**: `<path>` — <why it matters>

## Testing and Verification

- **Test locations**: <paths>
- **Build verification**: <verified command/tool path>
- **Focused test workflows**: <if discoverable>
- **Device/emulator prerequisites**: <if applicable and verified>

## Change-Sensitive Areas

List areas where a small modification can affect a broad portion of the application. Prefer graph-backed evidence such as high fan-in/fan-out symbols, shared contracts, and cross-module call paths.

| Area / Symbol | Why Sensitive | Evidence |
|---|---|---|
| `<path or symbol>` | <impact reason> | <callers/modules/contract usage> |

## Implementation Conventions

Only include recurring, repository-specific patterns that an implementation agent could plausibly get wrong without this context.

- <feature/file placement convention>
- <state-management convention>
- <error-handling / async convention>
- <resource/config convention>
- <testing convention>

## Existing Documentation

| Path | Relevance |
|---|---|
| `<relative/path>` | <what useful project knowledge it contains> |

## Uncertain or Inferred Information

Record uncertainty explicitly rather than turning an inference into a fact.

| Topic | Current Evidence | Confidence / Needed Verification |
|---|---|---|
| <topic> | <what was observed> | <high/medium/low and what would confirm it> |
