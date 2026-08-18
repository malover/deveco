# Hierarchy and Ownership

## Normalized model

```text
Workspace/System
  -> optional logical Subsystem
  -> Project (physical build/ownership boundary)
      -> Module/Build unit
```

- **Workspace/System**: analyzed root containing one or more Projects.
- **Project**: independently buildable/versioned/owned application, library, or OpenHarmony component root.
- **Subsystem**: logical OpenHarmony grouping; normally not a repository.
- **Module/Build unit**: unit owned by one Project, such as HAP/HAR/HSP or a GN target.

## Discovery order

1. Parse `.repo/manifest.xml`, `.gitmodules`, workspace/package manifests, or equivalent explicit topology.
2. Decide whether the analyzed root is itself a Project from coherent build-root evidence.
3. Search shallowly for nested/sibling build roots.
4. Before promoting a nested candidate, check whether an enclosing Project declares it as a module/source path.
5. Freeze Projects; then enumerate each Project's modules.

## ArkTS / DevEco

Use project-level `build-profile.json5` as canonical module ownership when present. Confirm with:

- `AppScope/app.json5` for application metadata;
- module `module.json5` for HAP/HAR/HSP type, abilities, extensions, permissions, device types;
- root/module `oh-package.json5` and lockfiles for local/external dependencies;
- `hvigorfile.ts` and wrappers for build behavior.

A directory with only `module.json5` is not automatically a Project. A nested build root declared as an enclosing Project's `srcPath` remains a Module.

## OpenHarmony component repositories

Use:

- `bundle.json` for component/part identity, subsystem, inner kits, component/external dependencies, SysCaps, and build roots;
- `BUILD.gn` for targets and dependencies;
- `subsystem_config.json` for logical subsystem membership when available;
- `OAT.xml`, README, and LICENSE only for declared/compliance context.

Treat a component repository as a Project. Treat its GN targets as Project-internal build units by default. Do not assume one repository per subsystem.

## Mixed and generic repositories

Recognize other independent build roots only from coherent evidence such as an isolated package/workspace manifest, build entry point, source root, and independent build/test lifecycle. Do not create Projects from directory names like `demo`, `feature`, `shared`, or `service` alone.

## Cross-project edges

Create an edge only from resolvable evidence:

- local `file:`/workspace/package reference;
- manifest or package dependency;
- component dependency in `bundle.json`/GN metadata;
- public contract plus verified consumer call;
- build orchestration dependency.

Record provider, consumer, direction, contract/package/module, and evidence. Co-location is not dependency.

## Stable identities

- Use normalized relative paths as Project IDs.
- Use descriptor names plus source paths as Module IDs.
- Keep display names separate from stable IDs.
- Resolve name collisions with relative path, never an arbitrary numeric suffix.

## Boundary correction

After freezing, change a Project boundary only when direct ownership/build evidence contradicts it. Record the correction, rebuild affected worklists, and reconsider single- vs multi-project mode deliberately.
