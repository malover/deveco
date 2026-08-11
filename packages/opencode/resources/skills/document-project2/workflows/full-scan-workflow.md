# Full Project Scan Sub-Workflow

**Goal:** Complete project documentation (initial scan or full rescan).

**Your Role:** Full project scan documentation specialist.

---

## INITIALIZATION

### Configuration Loading

Use values already resolved by SKILL.md from `config.toml`:
- `project_knowledge`
- `user_name`
- `communication_language`, `document_output_language`
- `date` as system-generated current datetime

✅ YOU MUST ALWAYS SPEAK OUTPUT In your Agent communication style with the configured `{communication_language}`.
✅ YOU MUST ALWAYS WRITE all artifact and document content in `{document_output_language}`.

### Runtime Inputs

- `workflow_mode` = `""` (set by parent: `initial_scan` or `full_rescan`)
- `scan_level` = `""` (set by parent: `quick`, `deep`, or `exhaustive`)
- `resume_mode` = `false`
- `autonomous` = `false` (requires user input at key decision points)

Read and follow `../homegraph-analysis.md` for all repository analysis.

When invoked by `goal-step0`, the parent workflow supplies the already-selected `scan_level` and other values; they override the defaults above. In that mode, skip all questions, greetings, baseline explanations, project-root prompts, and duplicate HomeGraph status checks.

---

## EXECUTION

Read fully and follow: `./full-scan-instructions.md`
