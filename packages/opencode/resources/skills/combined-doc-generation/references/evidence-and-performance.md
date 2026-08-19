# Evidence and Performance

## Evidence classes

Use these classes internally where useful:

| Class | Meaning | Typical source |
|---|---|---|
| Observed | Current executable/configured behavior | source, config, HomeGraph relationship |
| Declared | Human-authored intent/description | README, design doc, comments |
| Inferred | Reasoned synthesis from several facts | structural/runtime evidence |
| Unavailable | Needed evidence is genuinely outside repository/tool boundary | external platform/repo/contract |

Do not label something `Unavailable` because it was simply not inspected.

## Evidence anchors

Prefer repository-relative `path#symbol-or-key` anchors:

```text
entry/src/main/ets/pages/GalleryPage.ets#build
media/src/main/ets/MediaRepository.ets#queryAlbums
entry/src/main/module.json5
```

Important modules should usually expose several connected anchors that support ownership, flow, state/data, and extension claims. Often this is roughly 5-10 for a deep module, but **never pad to a count**. Small focused modules may need only a few.

Do not publish exhaustive inventories.

## Deterministic scan budget

Hierarchy bootstrap remains cheap and metadata-first:

- repo/workspace manifests;
- build/package descriptors;
- declared module lists;
- local dependency declarations;
- bounded source/significance signals.

Do not semantically read the whole repository to form initial Project candidates.

## Semantic analysis budget

Spend semantic budget where it lowers implementation uncertainty.

### Deep module

Typical pattern:

1. ownership/runtime HomeGraph pass;
2. second enrichment/reference pass;
3. targeted callers/callees/state/data follow-ups;
4. exact source/config/test reads for unresolved claims;
5. stop once the analysis-completion contract is satisfied.

### Standard module

One strong overview, concrete gap follow-ups, and a related/reference search when Extension Guidance would otherwise be generic.

### Focused module

One bounded overview plus exact verification when required.

Do not bulk-read every file as the old exhaustive deep mode did.

## Query failure handling

Do not switch away from HomeGraph on one failed query. Narrow, split, reduce, change tool shape, and retry serially. If the repository graph itself becomes unhealthy, recover/reindex and probe again.

## Sequential execution

Process Project by Project and module by module.

After each module:

- persist its compact analysis packet;
- write its docs immediately;
- retain only a short summary in active context.

After each Project:

- synthesize Project docs/governance from the compact Project analysis JSON;
- keep Project summary/output paths/cross-Project relationships;
- release detailed module context.

This avoids the failure mode where one huge discovery pass happens at the beginning and later files are written from stale/shallow context.

## Internal metadata

`.projectspec` supports generation and indexing. Store:

- verified hierarchy and Project intelligence;
- analysis depth/pass records;
- semantic classifications;
- compact flows/dependency/state summaries;
- reference patterns;
- conditional-section/diagram decisions;
- constraint candidates;
- evidence anchors;
- completion/unknown state.

Do not store raw graph responses, full source, huge prose drafts, secrets, credentials, or personal data.

## Selected revision

Document tracked repository behavior at the selected revision/working-tree policy. Do not treat HomeGraph cache/tool artifacts as product behavior.
