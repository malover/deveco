# Developer Workflow Rules

Developer workflow extraction is mandatory when repository evidence exists.

Inspect, as applicable:
- README setup/build/run/test instructions,
- `hvigorw`, `hvigorw.bat`, `hvigorfile.ts`,
- `build-profile.json5`,
- root/module `oh-package.json5`,
- package scripts/task definitions,
- test directories/configuration,
- the complete discovered CI workflow set such as `.github/workflows/*.yml` / `.yaml`,
- other repository CI configuration.

Document only evidenced commands/procedures:
- prerequisites/setup,
- dependency installation,
- build,
- launch/run,
- unit/integration/UI tests,
- module-specific variants when meaningful,
- CI workflow names/triggers/jobs,
- what CI validates,
- what CI does not validate when supported by the complete workflow set.

Never invent commands.

For HarmonyOS, prefer actual repository wrappers such as `./hvigorw ...` or `hvigorw.bat ...` when present.
If execution requires DevEco Studio and no reliable CLI launch command exists, say so.

Do not treat a locally deleted or modified CI file shown only by working-tree state as the repository's CI architecture. Base normal documentation on tracked content at the selected revision.

## Lazy CI/test inspection

Inspect build/test/CI artifacts only while producing the architecture section that needs them.

Prefer metadata/presence checks first:
- locate workflow files narrowly,
- locate test files narrowly,
- read only the minimum files needed to characterize what CI/tests actually validate.

Do not inspect tests during general module analysis merely because test files exist.

## Defer repository-wide test/CI work

Do not search repository-wide test files or CI workflows during module discovery unless a module-specific architectural claim requires it.

Prefer inspecting these once during high-level architecture synthesis.

## Revision-backed CI/test evidence

For Git repositories, characterize CI/test configuration from the selected revision.

Before claiming CI or tracked test configuration is absent:
- inspect the selected revision's tracked paths,
- if a tracked file is missing/modified locally, use the revision-backed content,
- do not substitute working-tree filesystem absence for repository absence.

Use working-tree-only files only when the user explicitly requested current working-tree documentation.
