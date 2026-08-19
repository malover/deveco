# Evidence and Performance

## Evidence classes

Use four classes internally and where useful in evidence tables:

| Class | Meaning | Typical source |
|---|---|---|
| Observed | Current executable/configured behavior | source, config, HomeGraph relationship |
| Declared | Human-authored intent/description | README, design doc, comments |
| Inferred | Reasoned synthesis not directly proven | combined structural/runtime evidence |
| Unavailable | Needed evidence exists outside repository/tool boundary | external platform/repo/contract |

Prefer Observed for implementation claims. Do not call something Unavailable merely because it was not inspected yet.

## Evidence anchors

Prefer repository-relative path + symbol/descriptor key rather than unstable line-only citations.

Good:

```text
entry/src/main/ets/pages/GalleryPage.ets#build
entry/src/main/module.json5
media/src/main/ets/MediaRepository.ets#queryAlbums
```

Keep evidence compact in published Markdown. Internal `.projectspec/analysis` may retain a few more anchors.

## Deterministic scan budget

Hierarchy discovery is metadata-first and should remain cheap:

- explicit repo/workspace manifests;
- known build descriptors;
- declared module lists;
- local dependency declarations;
- bounded source counts/signals.

Do not semantically read the repository to decide the initial candidate hierarchy.

## Semantic analysis budget

HomeGraph is primary. Optimize by question, not by arbitrary file count.

For a module:

1. one anchored deep overview;
2. targeted relationship/data/UX follow-ups for concrete gaps;
3. exact source reads only for unresolved details;
4. one related/reference-pattern search;
5. stop when the documents cannot materially improve from another call.

Representative direct-read targets include:

- entry/ability/page/controller/view model;
- state/data owner;
- repository/persistence/integration owner;
- platform/native bridge;
- representative tests;
- exact build/config/permission/schema source.

Do not bulk-read every file as the old exhaustive deep-dive did.

## HomeGraph failure handling

Do not switch away from HomeGraph on one bad query.

For oversized results or memory/context errors, progressively:

- narrow path;
- narrow symbol/flow;
- reduce returned files/limits;
- split the question;
- use node/callers/callees instead of broad explore;
- retry serially.

Only an unrecoverable repository-wide graph failure stops V1.

## Large repositories

Process sequentially by Project, then module. After one Project:

- write all outputs;
- write compact `.projectspec/analysis/<project>.json`;
- keep only Project summary, output paths, cross-Project edges, and repository-level findings in active context;
- continue with the next Project.

Do not launch parallel HomeGraph exploration against the same repository index when it risks memory/deadline contention.

## Internal metadata size

`.projectspec` should support generation, not become another documentation product.

Store:

- verified hierarchy;
- semantic classifications;
- compact flow/dependency summaries;
- evidence anchors;
- constraint candidates;
- validation state.

Do not store:

- full source;
- raw HomeGraph packets;
- exhaustive per-file prose;
- secrets/credentials/personal data;
- large document drafts.

## Selected revision

Document tracked repository behavior at the selected revision/working-tree policy. Do not turn HomeGraph cache state or local tool artifacts into product claims.
