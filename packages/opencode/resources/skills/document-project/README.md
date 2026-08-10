# document-project

A Code Genie skill that generates comprehensive AI-readable documentation for brownfield (existing) codebases. Analyzes your project structure, technology stack, API endpoints, data models, UI components, UX flows, localization, and more — then produces a full set of Markdown documentation with optional Mermaid sequence diagrams.

## What It Does

`document-project` scans your entire codebase and produces:

| Document | Description |
|----------|-------------|
| `index.md` | Master entry point with project structure, quick reference, links to all docs |
| `project-overview.md` | Executive summary, project classification, technology decisions |
| `source-tree-analysis.md` | Annotated directory tree with entry points and folder roles |
| `architecture.md` | Architecture pattern, technology stack, data flow, component structure |
| `component-inventory.md` | UI component catalog with props, state, events |
| `development-guide.md` | Setup, run, build, test instructions |
| `api-contracts.md` | API endpoints, request/response schemas, middleware |
| `data-models.md` | Entity models, relationships, migrations |
| `deployment-guide.md` | Deployment architecture, CI/CD pipeline |
| `localization.md` | i18n/l10n structure, supported locales, fallback chain |
| `diagrams/` | Codetograph-generated Mermaid `.mmd` sequence diagrams |
| `project-scan-report.json` | Resumable state file — resume interrupted scans |

Supports three scan modes: **Quick** (pattern-based, 2–5 min), **Deep** (reads critical directories, 10–30 min), and **Exhaustive** (reads every source file, 30–120 min).

## Detects 15 Project Archetypes

Automatically classifies your project using a hybrid **LLM + CSV baseline** strategy:

web, mobile, backend, CLI, library, desktop, game, data, browser-extension, infrastructure, embedded, **HarmonyOS**, AI/ML, static-SSG, monorepo

## Prerequisites

- **Code Genie** with skill support
- **No external dependencies** — the skill is fully self-contained (no Python, no pip, no scripts)

### Recommended (for best results)

- **codetograph MCP server** — generates AST-based dependency graphs, Mermaid sequence diagrams, call traces, cross-module paths. This is the primary analysis layer.

The skill works without codetograph (falls back to manual glob/grep), but you will not get sequence diagrams and analysis will be slower.

---

## Installation

### 1. Copy the skill to your Code Genie skills directory

**Linux:**

```bash
# Clone the skill
git clone https://github.com/your-org/document-project.git ~/.codegenie/skills/document-project

# Or copy manually:
cp -r /path/to/document-project ~/.codegenie/skills/document-project
```

**Windows (PowerShell):**

```powershell
# Clone the skill
git clone https://github.com/your-org/document-project.git $env:USERPROFILE\.codegenie\skills\document-project

# Or copy manually:
Copy-Item -Recurse C:\path\to\document-project $env:USERPROFILE\.codegenie\skills\document-project
```

> **Note:** The exact skills directory depends on your Code Genie configuration. Common paths are `~/.codegenie/skills/` (Linux) or `%USERPROFILE%\.codegenie\skills\` (Windows). Check your Code Genie settings if unsure.

### 2. Configure the skill (optional)

Edit `config.toml` inside the skill directory to customize behavior:

**Linux:**
```bash
nano ~/.codegenie/skills/document-project/config.toml
```

**Windows (PowerShell):**
```powershell
notepad $env:USERPROFILE\.codegenie\skills\document-project\config.toml
```

Key settings in `[config]`:
- `project_knowledge` — where docs are written (default: `{project-root}/docs`)
- `communication_language` — language for agent messages (default: `English`)
- `document_output_language` — language for generated docs (default: `English`)
- `user_name` — your name (leave empty to be prompted)

### 3. (Recommended) Set up codetograph

For Mermaid sequence diagrams, call traces, and cross-module dependency analysis, install the codetograph MCP server and generate a graph before running the skill:

```
/codetograph
```

This creates `codetograph-out/codetograph.json` which the skill uses as its primary analysis layer.

That's it! No other setup required.

---

## Usage

### In Code Genie

Simply type one of these trigger phrases:

```
document this project
generate project docs
```

The skill will:
1. Detect your project type and structure
2. Ask you to choose a scan level (Quick / Deep / Exhaustive)
3. Generate all documentation to the configured output directory
4. Offer to generate codetograph sequence diagrams (if codetograph graph exists)
5. Create a resumable state file — you can stop and resume later

### Scan Modes

| Mode | Time | What It Reads | Best For |
|------|------|---------------|----------|
| **Quick** | 2–5 min | Config files, manifests, directory structure (no source files) | Quick overview |
| **Deep** | 10–30 min | Critical directories per project type | Brownfield PRD preparation |
| **Exhaustive** | 30–120 min | All source files | Complete audit, migration planning |

### Resume Interrupted Scans

If your scan is interrupted, the state file at `docs/project-scan-report.json` saves your progress. Just run the skill again and choose **Resume**.

---

## Customization

All configuration lives in a single file: **`config.toml`** inside the skill directory.

```toml
[config]
# Where documentation is written (relative to project root)
project_knowledge = "{project-root}/docs"

# Languages
communication_language = "English"
document_output_language = "English"
user_name = ""

[workflow]
# Pre-activation steps (runs before greeting)
activation_steps_prepend = []

# Post-activation steps (runs after greeting, before workflow)
activation_steps_append = []

# Persistent facts — loaded as context for the entire run
persistent_facts = [
  "file:{project-root}/**/project-context.md",
]

# Post-completion behavior
on_complete = "After documentation is generated, refresh codetograph..."
```

---

## File Structure

```
document-project/
├── README.md
├── SKILL.md                          # Skill entry point (activation)
├── instructions.md                   # Workflow router (mode detection, resume)
├── config.toml                    # All configuration in one file
├── checklist.md                      # Validation checklist (250+ items)
├── documentation-requirements.csv    # 15 project archetype baselines
├── templates/                        # Document templates
│   ├── deep-dive-template.md           # Deep-dive output template
│   ├── index-template.md               # Master index template
│   ├── localization-template.md        # i18n/l10n template
│   ├── project-overview-template.md    # Project overview template
│   ├── project-scan-report-schema.json # State file JSON schema
│   ├── source-tree-template.md         # Source tree analysis template
│   └── ux-flows-template.md            # UX flows template
└── workflows/                          # Sub-workflow definitions
    ├── full-scan-workflow.md           # Entry point for full scan
    ├── full-scan-instructions.md       # Steps 0–12 (main pipeline)
    ├── deep-dive-workflow.md           # Entry point for deep dive
    └── deep-dive-instructions.md       # Steps 13a–13g (area deep-dive)
```

---

## Troubleshooting

### "No knowledge graph detected"

Without codetograph, the skill falls back to manual file scanning. For sequence diagrams and faster analysis, run `/codetograph` first.

### State file older than 24 hours

If you resume after 24+ hours, the old state is automatically archived and a fresh scan starts. This prevents stale analysis.
