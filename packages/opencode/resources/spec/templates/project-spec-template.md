# Project SPEC

> Repository-level current-state context. This document describes what exists in the codebase today; it must not describe the requested feature or propose future architecture.

## Project Overview

- **Purpose**: [What the application/project does]
- **Primary platform**: [HarmonyOS/OpenHarmony/other]
- **Primary languages**: [ArkTS/TypeScript/C++/other]
- **Toolchain**: [DevEco/Hvigor/build system and relevant versions when verified]
- **Repository shape**: [single app / multi-module / monorepo]

## Graph Analysis

- **Pipeline**: `project_spec_collect` → compact `project-spec-evidence-v1` → `project-spec` writer
- **Backend**: [homegraph/targeted]
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

| Module Path       | Responsibility          | Key Dependencies                           | Evidence                                     |
| ----------------- | ----------------------- | ------------------------------------------ | -------------------------------------------- |
| `<relative/path>` | <what this module owns> | <important internal/external dependencies> | <graph query and/or directly verified files> |

## Runtime Entry Points

| Entry Point                         | Path              | Responsibility                               | Evidence                         |
| ----------------------------------- | ----------------- | -------------------------------------------- | -------------------------------- |
| <ability/page/service/native entry> | `<relative/path>` | <how runtime enters this part of the system> | <manifest/source/graph evidence> |

## Key Runtime Flows

For each high-value flow, describe the observed path through the current implementation. Runtime ordering must be verified, not assembled from independent facts.

### <Flow Name>

`<verified entry>` → `<verified next step>` → `<verified dependency/storage/native boundary>`

- **Trigger**: <what starts the flow>
- **State/data movement**: <important state or payload transitions>
- **Side effects**: <storage/network/system/native actions>
- **Evidence**: <graph path/callers/callees and directly verified source files>
- **Confidence**: <high/medium/low; low/medium must explain what remains unverified>

If call order cannot be established from graph/source evidence, do not invent a sequence. Record the partial flow and move the unresolved ordering to `Uncertain or Inferred Information`.

## Architecture and Dependency Boundaries

- <observed layer/module boundary and responsibility>
- <allowed/actual dependency direction where verified>
- <cross-module communication mechanism>
- <important native, IPC, service, or external boundary>

Do not invent an ideal architecture. Record the architecture that exists in source.

## Key Interfaces and Shared Contracts

| Contract / Symbol      | Path              | Consumers / Role                          | Evidence                                         |
| ---------------------- | ----------------- | ----------------------------------------- | ------------------------------------------------ |
| `<interface/type/api>` | `<relative/path>` | <why changes here have downstream impact> | <callers/callees/modules/direct source evidence> |

## State and Data

- **State ownership**: <where important application/UI/domain state lives>
- **Persistence**: <preferences/database/files/other storage that is actually configured or used>
- **Data models**: <important shared/domain entities>
- **Synchronization/lifecycle rules**: <only when established by source>
- **Evidence**: <graph/source/config files supporting the above claims>

## Feature Change Guidance

Describe a small number of recurring change archetypes that are clearly supported by the existing repository structure. This is not guidance for the user's current requested feature and must not propose new architecture.

For each archetype, derive the route from actual graph paths and then verify the key source files. Do not infer a generic repository pattern from filenames alone.

### <Change Archetype>

`<verified entry/config/UI>` → `<verified presenter/viewmodel/model>` → `<verified state/persistence/service>` → `<verified affected runtime component>`

- **Start here**: <existing file/symbol or module that owns this kind of change>
- **Verified propagation**: <graph-backed current-state path through existing modules>
- **Preserve**: <existing conventions/contracts/state ownership/dependency direction>
- **Avoid**: <existing architectural boundary that should not be bypassed, only when evidence supports it>
- **Evidence**: <graph path/query plus directly verified files>
- **Applicability**: <conditions under which this guidance applies; avoid implying every feature follows the same pattern>

Prefer 3-6 high-value archetypes such as adding a setting, changing layout behavior, modifying persistence, extending an existing feature module, changing lifecycle/startup behavior, or extending a product-specific variant when those archetypes are supported by the repository.

## Modification Risk Map

Classify the most change-sensitive current areas by practical implementation risk. Base risk on graph evidence, fan-in/fan-out, shared state ownership, lifecycle position, persistence ownership, and cross-module reach.

| Risk            | Area / Symbol      | Potential Blast Radius         | Evidence                                          | Safer Change Strategy                                       |
| --------------- | ------------------ | ------------------------------ | ------------------------------------------------- | ----------------------------------------------------------- |
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

| Area / Symbol      | Why Sensitive   | Evidence                         |
| ------------------ | --------------- | -------------------------------- |
| `<path or symbol>` | <impact reason> | <callers/modules/contract usage> |

## Implementation Conventions

Only include recurring, repository-specific patterns that an implementation agent could plausibly get wrong without this context.

- <feature/file placement convention>
- <state-management convention>
- <error-handling / async convention>
- <resource/config convention>
- <testing convention>

## Existing Documentation

List every documentation source that materially influenced the generated Project SPEC, including multilingual README files. Do not omit a used document merely because its content was normalized or translated during reasoning.

| Path              | Relevance                                   |
| ----------------- | ------------------------------------------- |
| `<relative/path>` | <what useful project knowledge it contains> |

## Uncertain or Inferred Information

Record uncertainty explicitly rather than turning an inference into a fact. Runtime ordering, cross-module propagation, or persistence behavior that was not directly verified belongs here.

| Topic   | Current Evidence    | Confidence / Needed Verification            |
| ------- | ------------------- | ------------------------------------------- |
| <topic> | <what was observed> | <high/medium/low and what would confirm it> |

## Generation Metadata
Analysis Metrics:

- Evidence handoff: project-spec-evidence-v1
- Collector calls:
- HomeGraph queries:
- Direct source reads:
- Glob/Grep operations:
- Collection rounds:
- Generation duration:
- Evidence size:
