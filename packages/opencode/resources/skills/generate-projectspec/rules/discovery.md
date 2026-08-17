# Discovery and Evidence Rules

## Repository baseline

Document tracked repository content at the selected revision by default.

Do not treat these as repository architecture/findings unless explicitly requested:
- uncommitted working-tree changes,
- `git status`,
- local deletions/modifications,
- temporary/generated benchmark files,
- editor/tool artifacts,
- files outside the selected revision.

If the user explicitly asks to document the current working tree, clearly distinguish working-tree observations from revision-backed repository facts.

## Homegraph-first discovery

`rules/homegraph.md` is the authoritative source for Homegraph lifecycle, readiness, mandatory exploration, flow tracing, and source-read gating.

Use Homegraph relationship evidence together with targeted source/config verification. Do not infer architecture by broadly enumerating implementation files and then use Homegraph only as confirmation.


### Discovery anti-pattern: exhaustive verification

After Homegraph identifies a module's layers and call paths, do not read every implementation file in those layers. Architecture documentation may rely directly on graph evidence for topology and relationships. Source verification is reserved for unresolved semantics under `rules/homegraph.md`.

## HarmonyOS physical module detection

Detect modules using the repository's project model rather than relying on one file shape.

Use this order:

### Stage model
- directories containing `module.json5`.

### Legacy FA model
- root `build-profile.json5` module entries,
- module `config.json`,
- module-level build configuration when needed to confirm the boundary.

### Fallback
If neither form exists, infer physical modules only from explicit build/package configuration with supporting evidence.

Do not classify AppScope, source folders, feature folders, or ordinary top-level directories as physical modules merely because they are structurally prominent.

## Repository boundary classification

Keep these categories distinct:

### Physical repository modules
Source/build units owned by the analyzed repository. Only these receive `docs/modules/<name>/...`.

### Git submodules / linked repositories
Repositories referenced through `.gitmodules` or equivalent linked-source configuration. They are dependencies, not physical modules of the current repository.

If linked source is unavailable, describe only the evidenced contract/role; do not infer its internals.

### Workspace/local packages
Classify according to whether their source belongs to the analyzed repository boundary. Do not automatically treat package references as modules.

### External packages/platform libraries
Dependencies consumed through package/system configuration. Place them under dependencies/integrations, not the physical module map.

### External systems
Remote services, APIs, databases, platform services, devices, or actors outside the repository.

## Evidence reconciliation

Track three evidence classes:
- declared/documented behavior,
- graph-observed structure/relationships,
- source/config-observed executable behavior.

For current executable behavior, source/configuration is authoritative.
Homegraph is authoritative for relationships it actually reports.
README/docs/comments represent declared behavior, not automatic executable truth.

When evidence materially disagrees, do not silently merge it. Record a finding according to `findings.md`.

## Analysis-boundary precision

When behavior crosses into unavailable external/linked source:
- describe the capability visible from the current repository,
- identify the boundary/delegation,
- do not imply implementation ownership here,
- do not describe unavailable internals as observed facts.

Prefer:
"`entry` delegates protocol operations to the SDK dependency."

Avoid:
"`entry` implements the protocol" when the implementation is outside the analyzed boundary.

## Minimal discovery commands

Prefer direct reads of known root/module metadata over directory enumeration.

Do not:
- list the skill directory to discover its own files;
- run recursive implementation-tree listings;
- run `git status` as part of normal architecture discovery.

Use Git revision identity when useful, but working-tree cleanliness is not required evidence for generated project documentation.

## Shallow global discovery

Repository discovery must stop once physical modules and the coarse cross-module skeleton are known.

Do not use discovery to fully understand:
- each module's internals,
- all runtime flows,
- all integrations,
- all persistence paths,
- all findings.

Those belong to just-in-time module analysis in `workflow.md`.

The output of discovery is a compact Module Worklist, not a repository-wide architecture model.

## Selected-revision repository truth

For a Git repository, generated project documentation represents the selected Git revision (normally `HEAD`) unless the user explicitly asks to document the current working tree.

Rules:

- Resolve and record the selected revision once at the start.
- Treat tracked content at that revision as repository truth.
- Do not treat uncommitted additions, modifications, or deletions as repository facts.
- When a tracked file is missing or modified in the working tree but is needed as evidence, read the selected revision's version (for example via `git show <revision>:<path>` or an equivalent revision-backed read).
- Before claiming that a tracked artifact such as CI configuration is absent, check the selected revision's tracked tree rather than relying on working-tree filesystem absence.
- Untracked files are ignored unless explicitly requested or required to understand the current working tree.

This rule applies especially to:
- `.github/workflows/*`,
- build/deployment configuration,
- tracked documentation,
- package/module metadata,
- test configuration.

Do not surface Git cleanliness or local deletion status in architecture/business findings.

## Targeted repository-document reading

Do not read a large README or repository document in full by default.

Prefer:
1. headings/search for relevant sections,
2. targeted ranges around matched sections,
3. full read only when the document is short or its overall context is necessary.

Typical targeted topics:
- project purpose,
- architecture/module descriptions,
- build/run instructions,
- declared requirements/constraints,
- API/integration notes.

Repository documentation is declared evidence, not a substitute for source/graph verification of executable behavior.
