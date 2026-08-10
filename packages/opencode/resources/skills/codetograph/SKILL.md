---
name: codetograph
description: |
  Perform a comprehensive codebase structural audit using tree-sitter parsers.
  Auto-discovers all file extensions, dynamically installs missing tree-sitter
  parsers (including tree-sitter-arkts for HarmonyOS .ets files), extracts
  classes/functions/methods/calls using deterministic AST analysis, builds a
  complete dependency graph with typed relations, detects cycles and god nodes,
  and exports both codetograph_tree.md and codetograph.json. Use when the user asks to
  audit the codebase, generate dependency graph, map project structure, or find
  architecture issues.
---

# CodeToGraph

## Overview

Programmatic codebase → dependency graph at **entity level** using tree-sitter parsers.
No LLM involvement — 100% deterministic AST extraction. Multi-phase pipeline:
discovery → parser setup → entity extraction → graph construction → analysis → export.

**Input:** project directory (current workspace by default).

**Output:**

1. `docs/codetograph_tree.md` — human-readable report
2. `docs/codetograph.json` — machine-readable NetworkX node-link format

---

## Phase 0: Discovery & Parser Setup

1. Scan the project directory to collect all unique file extensions.
2. Map each extension to a tree-sitter parser (see parser registry in `scripts/parsers.ts`).
3. For each required parser, check if the WASM file is cached locally (`~/codetograph-cache/`).
4. If missing, download the WASM file from GitHub releases.
5. For `.ets` files (HarmonyOS ArkTS), attempt to load `tree-sitter-arkts-open`; if unavailable, fall back to the TypeScript parser (ArkTS is a superset of TypeScript syntax).
6. Report: which extensions found, which parsers used, any fallbacks applied.

### Supported Extensions (built-in)

| Extension                                    | Parser                    | WASM Source                                 |
| -------------------------------------------- | ------------------------- | ------------------------------------------- |
| `.ets`                                       | ArkTS (→TS fallback)      | `tree-sitter-arkts-open` npm or TS fallback |
| `.ts`, `.tsx`                                | TypeScript/TSX            | GitHub releases                             |
| `.js`, `.jsx`                                | JavaScript                | GitHub releases                             |
| `.py`                                        | Python                    | GitHub releases                             |
| `.go`                                        | Go                        | GitHub releases                             |
| `.rs`                                        | Rust                      | GitHub releases                             |
| `.java`                                      | Java                      | GitHub releases                             |
| `.cpp`, `.cc`, `.cxx`, `.hpp`, `.hh`, `.hxx` | C++                       | GitHub releases                             |
| `.c`, `.h`                                   | C                         | GitHub releases                             |
| `.cs`                                        | C#                        | GitHub releases                             |
| `.rb`                                        | Ruby                      | GitHub releases                             |
| `.php`                                       | PHP                       | GitHub releases                             |
| `.swift`                                     | Swift                     | GitHub releases                             |
| `.scala`                                     | Scala                     | GitHub releases                             |
| `.kt`, `.kts`                                | Kotlin (fallback to Java) | GitHub releases                             |
| `.dart`                                      | Dart (fallback to JS)     | GitHub releases                             |
| `.json`                                      | JSON                      | GitHub releases                             |
| `.yaml`, `.yml`                              | YAML                      | GitHub releases                             |
| `.sh`, `.bash`                               | Bash                      | GitHub releases                             |

Extensions not in this list are reported as warnings. The skill can be extended with additional tree-sitter parsers by adding entries to `scripts/parsers.ts`.

---

## Phase 1: Entity Extraction (per-file AST analysis)

This phase is executed by the full pipeline below; do not invoke it separately.

For each source file, the script:

1. Parses the file with the appropriate tree-sitter parser.
2. Executes language-specific S-expression queries against the CST.
3. Extracts entities with deterministic IDs.

### Extracted entities per language

**TypeScript/ArkTS/JavaScript:**

- Classes: `class_declaration`, `abstract_class_declaration`
- Functions: `function_declaration`, `generator_function_declaration`, arrow functions in variable declarations
- Methods: `method_definition` (inside classes)
- Interfaces: `interface_declaration`
- Enums: `enum_declaration`
- Type aliases: `type_alias_declaration`
- Imports: `import_statement` (source + symbols)
- Exports: `export_statement`
- Calls: `call_expression` → function/method name
- New expressions: `new_expression`

**Python:**

- Classes: `class_definition` (with bases)
- Functions: `function_definition` (with params)
- Methods: `function_definition` inside `class_definition`
- Imports: `import_statement`, `import_from_statement`
- Calls: `call` → identifier/attribute

**Go:**

- Types: `type_declaration` → `type_spec` (struct/interface)
- Functions: `function_declaration` (with params/results)
- Methods: `method_declaration` (with receiver)
- Imports: `import_declaration`
- Calls: `call_expression`

**Rust:**

- Structs: `struct_item`
- Enums: `enum_item`
- Traits: `trait_item`
- Impl blocks: `impl_item`
- Functions: `function_item`
- Methods: `function_item` inside `impl_item`
- Imports: `use_declaration`
- Calls: `call_expression`

**Java:**

- Classes: `class_declaration` (with superclass/interfaces)
- Interfaces: `interface_declaration`
- Enums: `enum_declaration`
- Methods: `method_declaration`
- Imports: `import_declaration`
- Calls: `method_invocation`

**C/C++:**

- Classes/Structs: `class_specifier`, `struct_specifier`
- Functions: `function_definition` (with return type)
- Methods: `function_definition` inside `class_specifier`
- Includes: `preproc_include`
- Calls: `call_expression`

**JSON/YAML:**

- Top-level keys as constants
- Nested keys as sub-items

### Entity ID Format

`{parentdir}_{filename}_{EntityName}`

- parentdir = immediate parent directory name (not full path)
- Replace dots, hyphens, slashes with underscores
- Normalize to lowercase

---

## Phase 2: Graph Construction

This phase is executed by the full pipeline below; do not invoke it separately.

### 2a. Nodes

Every extracted entity becomes a node:

```json
{
  "id": "src_cli.ts_main",
  "label": "main",
  "file_type": "code",
  "source_file": "src/cli.ts",
  "source_location": "L42",
  "norm_label": "main",
  "entity_type": "function",
  "language": "typescript"
}
```

### 2b. Relations (8 types)

| Relation     | Confidence | Trigger                                                                    |
| ------------ | ---------- | -------------------------------------------------------------------------- |
| `contains`   | EXTRACTED  | Class/interface/enum/struct contains method/field/declaration              |
| `inherits`   | EXTRACTED  | Class inheritance (`extends`), interface extension                         |
| `implements` | EXTRACTED  | Class implements interface                                                 |
| `imports`    | EXTRACTED  | Import statement resolved to an entity                                     |
| `calls`      | EXTRACTED  | Function/method call to entity IN same file                                |
| `calls`      | INFERRED   | Function/method call to entity NOT in same file (cross-file, see Phase 2c) |
| `calls`      | EXTERNAL   | Call to unresolved symbol → virtual `@external/<name>` node created        |
| `exports`    | EXTRACTED  | Export statement referencing an entity                                     |

### 2c. Cross-file Call Resolution

1. Build global index: `{normalized_name → [entity_ids]}` from ALL extracted entities across ALL files.
2. For each call where callee is NOT in same file:
   - Look up callee name (normalized) in the index.
   - Exactly ONE match → `calls` edge, `INFERRED`, score 0.5.
   - MULTIPLE matches → `calls` edge, `AMBIGUOUS`, score 0.2, note candidates.
   - NO match → create virtual `@external/<call_name>` node (entity_type: `external`, file_type: `external`) and `calls` edge with confidence `EXTERNAL`, score 0.3.
3. Normalization: strip `get_`, `set_`, `is_`, `has_` prefixes; case-insensitive.
4. Exclude language builtins.

### 2d. Deduplication

1. Exact merge: same `entity_id` → keep richer label.
2. Label merge: identical normalized labels AND same `source_file` → merge, combine links.

### 2e. Cycle Detection

DFS with coloring (white/gray/black) on ALL links. Every cycle flagged with ⚠️, printed with path and mitigation suggestion.

---

## Phase 3: Analysis

### 3a. God Nodes

Top-15 nodes by degree. Exclude: language builtins.

### 3b. Surprising Connections

Scoring: base = confidence_score + cross-file bonus (+2) + cross-dir bonus (+2) + hub→peripheral bonus (+1) + AMBIGUOUS bonus (×2). Top-10 by final score.

### 3c. Knowledge Gaps

- Isolated entities (degree = 0)
- AMBIGUOUS-only entities
- Call-free files (no outgoing calls, only imports)

### 3d. Community Hubs

Group entities by directory. List top entities per directory by local degree.

---

## Phase 4: Export

This phase is executed by the full pipeline below; do not invoke it separately.

### 4a. Graph Report (`docs/codetograph_tree.md`)

Standard graph-tree report format with: Summary, System Graph Overview, Relationship Matrix, Circular Dependencies, God Nodes, Surprising Connections, Community Hubs, Knowledge Gaps, Self-Audit Verification.

### 4b. Graph JSON (`docs/codetograph.json`)

NetworkX node-link format, identical to graph-tree output schema.

---

## Phase 5: Self-Audit

This phase is executed by the full pipeline below; do not invoke it separately.

Verifies: files analyzed == total files, 0 missing, entity/edge counts match.

---

## Full Pipeline

```bash
bun run "{skill-root}/scripts/codetograph.bundle.js" --project <dir> [--output <dir>]
```

Runs all phases: discovery → extraction → graph → analysis → export → audit.

---

## Quality Constraints

- **Entity-level, not file-level.** Every node is a class, function, method, or constant.
- **IDs must be deterministic.** `{parentdir}_{filename}_{entityName}` format.
- **100% file coverage.** Every discovered file is parsed.
- **Self-audit must pass.** analyzed files == total files, 0 missing.
- **Cross-file resolution on ALL calls.**
- **Normalize before matching.** Language builtins excluded.
- **codetograph.json must be valid JSON.**
- **Cycle detection scans ALL links.**
