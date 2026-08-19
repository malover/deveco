# Hierarchy and Ownership

## Normalized model

```text
Workspace/System
  -> optional logical Subsystem
  -> Project (physical product/component/build ownership boundary)
      -> Module/Build unit
```

### ArkTS / DevEco

```text
Application (Project)
  -> HAP/HAR/HSP Module
      -> pages / abilities / classes / resources
```

Use these as primary evidence:

- project `build-profile.json5` for module ownership;
- `AppScope/app.json5` for application identity;
- module `module.json5` for HAP/HAR/HSP type, abilities, extensions, permissions, device types;
- `oh-package.json5` / lockfiles for local/external dependencies;
- `hvigorfile.ts` and related build files for build behavior.

A nested `module.json5` is a **Module signal**, not a Project signal. Multiple module descriptors never create multi-Project mode by themselves.

### OpenHarmony system/component repositories

```text
System
  -> Subsystem                  # logical grouping; no repository required
      -> Component / Part       # Project; normally physical repo/sub-repo, bundle.json
          -> GN target          # Module/build unit
```

Use:

- `.repo/manifest.xml` / `.gitmodules` for physical checkout topology;
- `subsystem_config.json` for logical subsystem -> component mapping;
- `bundle.json` for component/part identity, subsystem, dependencies, inner kits, SysCaps, build roots;
- `BUILD.gn` for target/module dependencies.

Do not create a Project for a subsystem unless independent physical build/ownership evidence separately proves one.

## Deterministic candidate discovery

`bootstrap_projectspec.mjs` should do the cheap work:

1. parse explicit checkout/workspace topology;
2. find coherent ArkTS/application/component/package roots;
3. parse declared modules/build units;
4. suppress candidate Project roots already owned as declared modules;
5. collect local dependency hints;
6. assign stable IDs and candidate output paths.

The model must not rebuild this list from scratch.

## HomeGraph verification

After deterministic discovery, verify only for mistakes/ambiguity.

A candidate Project is likely valid when it has a coherent combination of:

- independent application/component/package/build root;
- independent packaging/version/public contract;
- meaningful runtime/lifecycle/entry boundary;
- explicit repo/sub-repo/workspace ownership;
- service/IPC/package boundary to siblings rather than ordinary internal imports.

A candidate should usually be merged into its enclosing Project when it is:

- declared by the parent's build profile as a module/source path;
- an internal UI/data/common layer;
- built/launched/versioned only as part of the same application;
- separated only by folder naming or an extra module manifest.

Use HomeGraph to corroborate ownership/consumer relationships and detect suspicious boundaries. Build descriptors remain authoritative for declared physical ownership.

## Stable identities and output paths

- Project ID: normalized repository-relative Project path (`_root` for repository root internally).
- Module ID: descriptor name plus normalized source path.
- Module output slug: readable module name, path-disambiguated when necessary.
- Single Project: output directly under `docs/`.
- Multiple Projects: output under `docs/<project-relative-path>/`; if a root Project coexists with nested Projects, use its stable display slug to avoid collision.

Never use arbitrary numeric suffixes when a path can disambiguate.

## Cross-Project edges

Record an edge only from resolvable evidence such as:

- local `file:`/`link:`/workspace package reference;
- `bundle.json`/GN dependency;
- public contract plus verified consumer call;
- build orchestration dependency;
- explicit IPC/service boundary.

Record direction as **consumer -> provider** and preserve the contract/evidence anchor. Co-location is not a dependency.

## Boundary correction rule

Once verified, freeze the hierarchy. Change it only when direct ownership/build/runtime evidence demonstrates a mistake. Record:

- original candidate;
- corrected owner/boundary;
- evidence;
- affected output paths/worklists.

Do not reopen boundary classification because a later semantic query merely discovers a cross-module call.
