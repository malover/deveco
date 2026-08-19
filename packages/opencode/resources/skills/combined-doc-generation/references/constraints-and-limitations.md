# Constraints and Limitations Documentation

## Purpose

`constraints-and-limitations.md` is the Project's compact, developer-maintained architectural contract. It is intentionally different from normal explanatory documentation.

It owns durable rules/checks/limitations that help prevent architecture drift during feature work.

## ARC constraints

Use stable `ARC-*` IDs for evidence-backed architectural invariants/constraints.

Each entry should contain:

- **Scope** — `project`, `module:<id>`, `modules:<a,b>`, contract/data/native boundary;
- **Constraint** — concise rule/invariant;
- **Basis** — `Enforced`, `Declared policy`, `Observed pattern`, or `Inferred guardrail`;
- **Why / implementation impact** — why a feature agent must care;
- **Evidence** — descriptor/path/symbol/graph anchor;
- **Verification** — concrete inspection/build/test check.

High-value categories:

- dependency direction;
- module/source-of-truth ownership;
- public/shared contract boundaries;
- persistence/schema/migration ownership;
- lifecycle/state-machine/concurrency ordering;
- extension/ability/handler registration patterns that must stay centralized;
- platform/native handoff ownership and compatibility;
- permissions/security/data handling;
- build/product/device/resource constraints.

Deep module analysis should actively contribute candidates here. In particular, compare state/data owners, reference patterns, callers/consumers, registration points, and native/platform boundaries rather than deriving governance only from the initial repository discovery pass.

Use universal wording (`must`, `never`) only when evidence supports it. If the rule is only an observed dominant convention, calibrate language/basis accordingly.

## CHK change checks

Use stable `CHK-*` IDs for actionable change checks.

A good check is triggered by a recognizable feature/change type and tells an agent what to verify.

Example:

```text
CHK-004 — Adding persistent media state
Scope: project
Applies when: a feature adds or changes persistent media data

Check:
1. confirm the owning repository/data module;
2. inspect existing schema migration/version path;
3. inspect consumers through HomeGraph;
4. verify ARC-001 still holds;
5. run the evidenced persistence tests/build target if available.
```

Prefer a small number of high-value checks to dozens of micro-checks.

## LIM limitations

Use stable `LIM-*` IDs only for implementation-relevant facts.

Every limitation requires:

- scope;
- exact limitation/evidence gap;
- evidence/boundary;
- current implementation consequence;
- current handling or exact unknown.

Good:

> Thumbnail eviction behavior is owned by an external platform API and is not observable in this repository. Do not add application-level eviction policy without verifying the platform contract.

Bad:

> Testing could be improved.

Do not speculate about future fixes/remediation.

## Scope and deduplication

One registry per Project. No module registries.

Module-specific entries use scope metadata:

```text
ARC-002 [module:editor]
ARC-003 [modules:entry,media-data]
```

Put a rule once at the narrowest scope covering its blast radius. Module Architecture may link the ID but should not copy the rule body.

## Extraction order

Collect candidates during module analysis, then finalize after Project Architecture/Business synthesis:

1. compare module ownership/dependency summaries;
2. promote durable cross-module invariants;
3. create change checks for likely drift-prone feature changes;
4. add only concrete limitations/evidence gaps;
5. deduplicate and scope;
6. verify evidence and wording.

## Developer-maintained content

Content outside ProjectSpec generated markers is protected for future updates.

If a developer later adds/overrides a rule and current repository evidence appears to contradict it:

- do not silently delete or rewrite the manual rule;
- surface the conflict for review;
- preserve the manual content until a human resolves it.

V1 does not require `Source: manual/discovered` metadata inside each rule.
