# Whitelist of files to include in skill_files for deveco-create-project
# Lines starting with # are comments; empty lines are ignored
# @note lines add informational annotations to skill_files

scripts/detect-sdk.ts
scripts/detect-sdk.mjs
scripts/copy-template.ts
scripts/copy-template.mjs
.version
@note application/ (built-in project template directory — the script uses this automatically; do NOT manually copy files from here)
@note application/AGENT.md — template navigation file; Agent reads it first in Step 4 to know which files to read/skip; copied into generated projects where the agent reads it (committable to skill repo); script appends `/AGENT.md` to each generated project's .gitignore so it stays out of the user's git history but remains on disk for the agent to read
