# Full Project Scan Instructions

<workflow>

<critical>This workflow performs complete project documentation (Steps 1-12)</critical>
<critical>Handles: initial_scan and full_rescan modes</critical>
<critical>YOU MUST ALWAYS SPEAK OUTPUT In your Agent communication style with the configured `{communication_language}`</critical>
<critical>YOU MUST ALWAYS WRITE all artifact and document content in `{document_output_language}`</critical>
<critical>Read and follow `../homegraph-analysis.md` as the canonical analysis policy for every scan stage.</critical>
<critical>GOAL OVERRIDE: When invocation_mode == goal-step0, the supplied autonomous runtime values take precedence throughout this file. Skip Step 0.3 and all ask blocks because goal-step0-instructions.md already asked the single scan-depth question. Reuse its HomeGraph status, revisions, workflow_mode, scan_level, project_root_path, and concise Project SPEC discoveries. For skipped manual decisions: use the supplied initial_scan/full_rescan mode, accept the evidence-backed project classification and CSV baseline, record no extra user/hardware context, generate required conditional documents, and finalize after validation.</critical>

<step n="0.3" goal="Ensure HomeGraph knowledge graph is available" if="resume_mode == false">
<critical>HOMEGRAPH IS THE ONLY GRAPH PROVIDER FOR THIS SKILL. Do not use Python or TypeScript CodeToGraph tools unless the user explicitly asks for a provider comparison.</critical>

<action>Call `homegraph_status` for {{project_root_path}} (use `projectPath` when required by the MCP).</action>

<check if="HomeGraph index is healthy/available">
  <action>Set {{knowledge_graph_type}} = "homegraph"</action>
  <action>Set {{has_knowledge_graph}} = true</action>
  <action>Display: "✓ HomeGraph index available. Proceeding with graph-enhanced analysis."</action>
</check>

<check if="HomeGraph index is unavailable or missing">
  <action>Set {{has_knowledge_graph}} = false</action>
  <action>Display: "HomeGraph is unavailable or this project is not indexed. Proceeding with direct file scanning. Initialize/sync HomeGraph separately if graph-enhanced analysis is desired."</action>
</check>
</step>

<step n="0.5" goal="Load documentation baseline data and explain hybrid approach" if="resume_mode == false">
<critical>HYBRID DETECTION STRATEGY: LLM is the primary analysis engine; CSV serves as minimum baseline / safety net.</critical>

<action>Display explanation to user:

**How Project Detection Works (Hybrid LLM + CSV Baseline):**

This workflow uses a **two-layer approach** to intelligently document your project:

**Layer 1 — LLM Analysis (Primary):**
- The LLM analyzes your project structure: config files, directory layout, dependencies
- It determines: project type(s), repository structure (monolith/monorepo/multi-part), what to document, where to look
- LLM can detect hybrid projects (e.g., "Next.js fullstack with Prisma"), niche stacks, and custom architectures
- LLM proposes a complete documentation plan tailored to your specific project

**Layer 2 — CSV Baseline (Safety Net):**
- `documentation-requirements.csv` contains baseline requirements for 15 project archetypes (web, mobile, backend, cli, library, desktop, game, data, extension, infra, embedded, harmony, ai-ml, static-ssg)
- After LLM proposes its plan, CSV is consulted as a **minimum baseline**
- If CSV says `baseline_localization=true` for your detected type but LLM didn't include it → the workflow flags it and asks LLM to re-check
- If LLM proposes to scan something CSV doesn't require → LLM wins (LLM is the primary authority)

**Result:** You get a documentation plan that is BOTH tailored to your project (LLM) AND guaranteed to cover the minimum requirements for your project category (CSV).

**When Documentation Baseline is Loaded:**
- **Fresh Start / Full Rescan**: Load all 15 rows → LLM analyzes → CSV cross-checks
- **Resume**: Load ONLY the cached baseline row(s) + LLM analysis from state file
- **Deep Dive**: Load ONLY the baseline row(s) for the part being deep-dived
</action>

<action>Load documentation-requirements.csv from: ../documentation-requirements.csv</action>
<action>Store all 15 rows indexed by project_type_id for baseline cross-reference</action>
<action>Display: "Loaded documentation baseline for 15 project archetypes. LLM analysis will be primary; CSV will validate minimum coverage."</action>

<action>Display: "✓ Documentation baseline loaded successfully. Ready to begin LLM-driven project analysis."</action>
</step>

<step n="0.6" goal="Check for existing documentation and determine workflow mode">
<action>Check if {project_knowledge}/index.md exists</action>

<check if="index.md exists">
  <action>Read existing index.md to extract metadata (date, project structure, parts count)</action>
  <action>Store as {{existing_doc_date}}, {{existing_structure}}</action>

<ask>I found existing documentation generated on {{existing_doc_date}}.

What would you like to do?

1. **Re-scan entire project** - Update all documentation with latest changes
2. **Deep-dive into specific area** - Generate detailed documentation for a particular feature/module/folder
3. **Cancel** - Keep existing documentation as-is

Your choice [1/2/3]:
</ask>

  <check if="user selects 1">
    <action>Set workflow_mode = "full_rescan"</action>
    <action>Continue to scan level selection below</action>
  </check>

  <check if="user selects 2">
    <action>Set workflow_mode = "deep_dive"</action>
    <action>Set scan_level = "exhaustive"</action>
    <action>Initialize state file with mode=deep_dive, scan_level=exhaustive</action>
    <action>Jump to Step 13</action>
  </check>

  <check if="user selects 3">
    <action>Display message: "Keeping existing documentation. Exiting workflow."</action>
    <action>Exit workflow</action>
  </check>
</check>

<check if="index.md does not exist">
  <action>Set workflow_mode = "initial_scan"</action>
  <action>Continue to scan level selection below</action>
</check>

<action if="workflow_mode != deep_dive">Select Scan Level</action>

<check if="workflow_mode == initial_scan OR workflow_mode == full_rescan">
  <ask>Choose your scan depth level:

**1. Quick Scan** [DEFAULT]

- Fast structural understanding through HomeGraph files/explore/search
- Node/call-chain expansion only for a few important unresolved relationships
- Minimal direct reads for manifests, build/config, CI, docs, and unindexed facts

**2. Deep Scan**

- Comprehensive HomeGraph exploration across every important subsystem and documentation category
- Targeted node/callers/callees/impact expansion
- Selective exact source verification; never bulk-read every source file in a folder

**3. Exhaustive Scan**

- Maximum HomeGraph-backed coverage across relevant indexed modules/files
- Broader direct reads for graph gaps, resources, config, data, and exact details
- HomeGraph-led rather than an indiscriminate filesystem crawl

Your choice [1/2/3] (default: 1):
</ask>

  <action if="user selects 1 OR user presses enter">
    <action>Set scan_level = "quick"</action>
    <action>Display: "Using Quick Scan (fast HomeGraph structural analysis with minimal direct reads)"</action>
  </action>

  <action if="user selects 2">
    <action>Set scan_level = "deep"</action>
    <action>Display: "Using Deep Scan (comprehensive HomeGraph traversal with selective source verification)"</action>
  </action>

  <action if="user selects 3">
    <action>Set scan_level = "exhaustive"</action>
    <action>Display: "Using Exhaustive Scan (maximum HomeGraph-backed coverage with broader gap reads)"</action>
  </action>

<action>Initialize state file: {project_knowledge}/project-scan-report.json</action>
<critical>Every time you touch the state file, record: step id, human-readable summary (what you actually did), precise timestamp, and any outputs written. Vague phrases are unacceptable.</critical>
<action>Write initial state:
{
"workflow_version": "1.2.0",
"timestamps": {"started": "{{current_timestamp}}", "last_updated": "{{current_timestamp}}"},
"mode": "{{workflow_mode}}",
"scan_level": "{{scan_level}}",
"project_root": "{{project_root_path}}",
"project_knowledge": "{{project_knowledge}}",
"source_revision": {"repository": "{{repository_revision}}", "homegraph": "{{homegraph_revision}}"},
"knowledge_graph": {"type": "{{knowledge_graph_type}}", "available": {{has_knowledge_graph}}},
"completed_steps": [],
"current_step": "step_1",
"findings": {},
"outputs_generated": ["project-scan-report.json"],
"resume_instructions": "Starting from step 1",
"conditional_flags": {
   "localization_documented": false,
   "api_documented": false,
   "data_models_documented": false,
   "ux_flows_documented": false,
   "test_strategy_documented": false
}
}
</action>
<action>Continue with standard workflow from Step 1</action>
</check>
</step>

<step n="1" goal="LLM-driven project analysis with CSV baseline cross-check" if="workflow_mode != deep_dive">

<!-- ═══════════════ PHASE A: LLM ANALYSIS ═══════════════ -->

<critical>LLM-DRIVEN DETECTION: Instead of matching CSV patterns, the LLM analyzes the actual project structure.</critical>

<action>Ask user: "What is the root directory of the project to document?" (default: current working directory)</action>
<action>Store as {{project_root_path}}</action>

<action>Gather project structure data for LLM analysis:
  1. If HomeGraph is available, call `homegraph_files` for indexed repository shape, languages, modules, and file boundaries.
  2. Use `homegraph_explore` with project-scoped architecture/subsystem questions to identify all materially important hotspots.
  3. Supplement with a shallow top-level directory listing and targeted manifest/config discovery for non-symbol facts HomeGraph does not represent.
</action>

<action>Read key configuration files (up to 5 most informative: package.json, go.mod, requirements.txt, Cargo.toml, etc.)</action>

<action>LLM ANALYSIS PROMPT — Analyze the collected data and produce structured output in this exact JSON schema:

{
  "repository_type": "monolith | monorepo | multi-part",
  "parts": [
    {
      "part_id": "string (e.g. 'frontend', 'api', 'root')",
      "part_name": "Human-readable name",
      "root_path": "Relative path from project root",
      "project_type": "Free-text description (e.g. 'React + Vite SPA', 'FastAPI Python backend', 'HarmonyOS ArkUI')",
      "primary_language": "TypeScript | Python | Go | Rust | etc.",
      "primary_framework": "React | FastAPI | Gin | etc.",
      "closest_archetype": "One of: web, mobile, backend, cli, library, desktop, game, data, extension, infra, embedded, harmony, ai-ml, static-ssg (closest match, used for CSV baseline lookup)",
      "requires_api_scan": true/false,
      "requires_data_models": true/false,
      "requires_state_management": true/false,
      "requires_ui_components": true/false,
      "requires_deployment_config": true/false,
      "requires_localization": true/false,
      "requires_hardware_docs": true/false,
      "requires_asset_inventory": true/false,
      "requires_ux_flows": true/false,
      "requires_test_strategy": true/false,
      "custom_scans": ["List of additional things LLM thinks should be documented beyond the boolean flags (e.g. 'WebSocket message flow', 'Worker queue architecture')"],
      "critical_directories": ["List of directories that are important for this part"],
      "architecture_pattern": "Inferred architecture pattern (e.g. 'MVC', 'MVVM', 'Clean Architecture', 'Event-driven')",
      "confidence": "high | medium | low"
    }
  ],
  "cross_part_integration": {
    "detected": true/false,
    "integration_type": "REST API | GraphQL | gRPC | Event Bus | Shared DB | etc.",
    "description": "Brief description of how parts communicate"
  },
  "special_considerations": ["List of any special things the LLM noticed (e.g. 'Uses Prisma ORM with SQLite', 'Has Docker Compose for local dev', 'Contains Storybook stories')"],
  "analysis_confidence": "high | medium | low"
}
</action>

<action>Store LLM output as {{llm_analysis}}</action>

<!-- ═══════════════ PHASE B: CSV BASELINE CROSS-CHECK ═══════════════ -->

<action>CSV BASELINE CROSS-CHECK:
  For each part in {{llm_analysis.parts}}:
    1. Look up `closest_archetype` in documentation-requirements.csv (loaded in Step 0.5)
    2. Compare LLM's `requires_*` flags against CSV's `baseline_*` flags:

       FOR each baseline flag:
         IF baseline flag is TRUE AND LLM flag is FALSE:
           ADD to {{baseline_gaps}} list with:
             - part_id
             - flag name
             - LLM value (false)
             - Baseline value (true)
             - Question: "LLM says this is not needed, but the {archetype} baseline says it is. Should we include it?"

    3. For any `custom_scans` LLM proposed that aren't in CSV's baseline flags:
       ADD to {{llm_extras}} list — these are LLM additions beyond baseline
       (they are ALWAYS accepted, no question needed)

  4. If {{baseline_gaps}} is non-empty:
     Display to user with each gap and ask: "LLM decided these are not needed, but the {archetype} baseline requires them. Keep baseline requirements? [y/n per item or 'accept all baseline']"

     User can:
     - Accept baseline → override LLM flag to true
     - Reject baseline → keep LLM flag as false (LLM wins)
</action>

<!-- ═══════════════ PHASE C: USER CONFIRMATION ═══════════════ -->

<action>Display merged analysis to user:

**LLM Analysis Results:**

| Part | Type | Language | Framework | Arch Pattern | API | Models | State | UI | Deploy | i18n |
|------|------|----------|-----------|-------------|-----|--------|-------|----|--------|-----|
| {{parts_table_rows}}

**Repository Structure:** {{repository_type}} ({{parts_count}} part(s) detected)
**Integration:** {{cross_part_integration.description}}
**Special Considerations:** {{special_considerations}}

{{if baseline_gaps exist}}
⚠️ **Baseline Cross-Check Findings:**
_{{baseline_gaps_list}}_
{{/if}}

{{if llm_extras exist}}
✨ **LLM Discovered Additional Scans (beyond baseline):**
_{{llm_extras_list}}_
{{/if}}

Is this analysis correct? [y/n/edit]
</ask>

<action if="user confirms">Store final merged {{project_classification}} in state file</action>
<action if="user rejects or edits">Ask user to specify corrections, re-run LLM analysis with corrections</action>

<template-output>project_structure</template-output>
<template-output>project_parts_metadata</template-output>

<!-- ═══════════════ PHASE D: STATE FILE UPDATE ═══════════════ -->

<action>IMMEDIATELY update state file:
  {
    "completed_steps": [...,
      {"step": "step_1", "status": "completed", "timestamp": "{{now}}",
       "summary": "LLM classified as {{repo_type}} with {{parts_count}} parts"}
    ],
    "current_step": "step_2",
    "findings": {
      "project_classification": {
        "method": "llm-primary-csv-baseline",
        "analysis_confidence": "{{llm_analysis.analysis_confidence}}",
        "baseline_gaps_resolved": {{baseline_gaps_count}},
        "llm_extras_count": {{llm_extras_count}},
        "repository_type": "{{repository_type}}",
        "parts": [/* full merged part data with all requires_* flags */]
      }
    },
    "cached_llm_analysis": {{llm_analysis}},  /* CACHE for resume — skip re-analysis */
    "cached_baseline": {
      "csv_loaded": true,
      "rows_used": ["{{archetypes_used}}"]
    }
  }
</action>

<action>PURGE detailed analysis from context, keep only:
  "{{repo_type}}, {{parts_count}} parts, baseline gaps: {{gaps_count}}, LLM extras: {{extras_count}}"
</action>
</step>

<step n="2" goal="Discover existing documentation and gather user context" if="workflow_mode != deep_dive">
<action>For each part, scan for existing documentation using patterns:
- README.md, README.rst, README.txt
- CONTRIBUTING.md, CONTRIBUTING.rst
- ARCHITECTURE.md, ARCHITECTURE.txt, docs/architecture/
- DEPLOYMENT.md, DEPLOY.md, docs/deployment/
- API.md, docs/api/
- Any files in docs/, documentation/, .github/ folders
</action>

<action>Create inventory of existing_docs with:

- File path
- File type (readme, architecture, api, etc.)
- Which part it belongs to (if multi-part)
  </action>

<ask>I found these existing documentation files:
{{existing_docs_list}}

Are there any other important documents or key areas I should focus on while analyzing this project? [Provide paths or guidance, or type 'none']
</ask>

<action>Store user guidance as {{user_context}}</action>

<template-output>existing_documentation_inventory</template-output>
<template-output>user_provided_context</template-output>

<action>Update state file:

- Add to completed_steps: {"step": "step_2", "status": "completed", "timestamp": "{{now}}", "summary": "Found {{existing_docs_count}} existing docs"}
- Update current_step = "step_3"
- Update last_updated timestamp
  </action>

<action>PURGE detailed doc contents from memory, keep only: "{{existing_docs_count}} docs found"</action>
</step>

<step n="3" goal="Analyze technology stack for each part" if="workflow_mode != deep_dive">
<action>For each part in project_parts:
  - Load cached LLM analysis for this part (from Step 1: {{llm_analysis.parts}})
  - Use `critical_directories` and `entry_point_patterns` from documentation-requirements.csv as suggested scan targets
  - Parse technology manifest files (package.json, go.mod, requirements.txt, etc.)
  - Extract: framework, language, version, database, dependencies
  - Build technology_table with columns: Category, Technology, Version, Justification
</action>

<action>Determine architecture pattern based on detected tech stack:

- Use project_type_id as primary indicator (e.g., "web" → layered/component-based, "backend" → service/API-centric)
- Consider framework patterns (e.g., React → component hierarchy, Express → middleware pipeline)
- Note architectural style in technology table
- Store as {{architecture_pattern}} for each part
  </action>

<template-output>technology_stack</template-output>
<template-output>architecture_patterns</template-output>

<action>Update state file:

- Add to completed_steps: {"step": "step_3", "status": "completed", "timestamp": "{{now}}", "summary": "Tech stack: {{primary_framework}}"}
- Update current_step = "step_4"
- Update findings.technology_stack with summary per part
- Update last_updated timestamp
  </action>

<action>PURGE detailed tech analysis from memory, keep only: "{{framework}} on {{language}}"</action>
</step>

<step n="3.5" goal="Generate architecture and sequence diagrams from HomeGraph evidence" if="workflow_mode != deep_dive AND {{has_knowledge_graph}} == true AND {{knowledge_graph_type}} == 'homegraph'">
<critical>Use HomeGraph as the graph evidence layer. HomeGraph does not emit CodeToGraph-style Mermaid traces directly; synthesize diagrams from `homegraph_explore`, `homegraph_node`, `homegraph_callers`, and `homegraph_callees`, and verify ambiguous relationships against source.</critical>

<action>Display: "Generating diagrams from HomeGraph call/dependency evidence..."</action>
<action>Create `{project_knowledge}/diagrams/` if it does not exist.</action>

<critical>DISCOVERY PHASE — cache these results for Step 4:</critical>
<action>1. Run `homegraph_explore` with a project-scoped architectural question asking for central modules/symbols, startup paths, shared services, and high fan-in dependencies. Store the project-relevant central symbols as {{project_hotspots}}.</action>
<action>2. ENTRY POINT DISCOVERY (LLM-driven): use `homegraph_search` with project-type-specific entry terms, inspect candidates with `homegraph_node`, and use `homegraph_callers` / `homegraph_callees` to distinguish true startup/request/command entry points from ordinary utilities. Cross-check `entry_point_patterns` only as a validation hint. Store selected symbols as {{entry_points}}.</action>
<action>3. Use `homegraph_search` for ViewModel/state-controller terms and store {{viewmodels}}.</action>
<action>4. Use `homegraph_search` for model/state/entity terms and store {{data_models}}.</action>
<action>5. Use `homegraph_search` for component/build/view terms and store {{components}}.</action>
<action>CACHE all result sets for Step 4.</action>

<critical>DIAGRAM GENERATION IS DATA-DRIVEN. Prefer a smaller set of accurate diagrams over a large set of speculative ones.</critical>

<action>CATEGORY 1 — ARCHITECTURAL HOTSPOTS: For each materially important {{project_hotspots}} item, inspect with `homegraph_node`, collect important outgoing calls via `homegraph_callees` and important consumers via `homegraph_callers`, then synthesize focused Mermaid diagrams. Save as `hotspot-{label}-flow.mmd` / `hotspot-{label}-callers.mmd` when each view adds value.</action>

<action>CATEGORY 2 — ENTRY POINT FLOWS: For each documentation-relevant {{entry_points}} item, follow important callees until the flow is sufficiently evidenced using `homegraph_callees`; use `homegraph_explore` when the flow crosses modules or is unclear. Verify key transitions and write `entry-{label}-trace.mmd`.</action>

<action>CATEGORY 3 — DATA/STORAGE FLOWS: Use `homegraph_search` for repository/service/storage/data-access terms. For each important symbol, use callers/callees to map producers and consumers and synthesize `data-{label}-flow.mmd` when useful.</action>

<action>CATEGORY 4 — NAVIGATION/ROUTING: Search relevant routing/navigation symbols, inspect relationships, and synthesize the supported `nav-{label}-flow.mmd` diagrams needed for documentation.</action>

<action>CATEGORY 5 — SHARED COMPONENT CONSUMERS: Search shared component symbols and use `homegraph_callers` to discover consumers. For each meaningful shared component, synthesize `component-{label}-consumers.mmd` when useful.</action>

<action>CATEGORY 6 — CROSS-MODULE FLOWS: Use `homegraph_explore` with explicit natural-language questions such as "How does <entry> reach <feature/service>?" and corroborate returned paths with node/caller/callee evidence. Create `path-{from}-to-{to}.mmd` diagrams when a supported, documentation-relevant path is found.</action>

<action>CATEGORY 7 — STATE MANAGEMENT: Search state/store/ViewModel symbols, use callers/callees to map publishers and subscribers, and synthesize the state flow diagrams needed to explain important behavior.</action>

<action>CATEGORY 8 — PORTING/SHARED UTILITIES: Identify shared utilities with meaningful callers across multiple modules using `homegraph_callers` and exploration. For the highest-value utilities, synthesize caller/flow diagrams useful for cross-platform porting.</action>

<action>GENERATE INDEX FILE: Write `{project_knowledge}/diagrams/INDEX.md` listing each generated `.mmd`, category, what it represents, and HomeGraph evidence used (`explore`, `callers`, `callees`, `node`). Do not claim HomeGraph generated Mermaid directly.</action>
<action>Validate that all listed `.mmd` files exist, are non-empty, and contain only relationships supported by HomeGraph/source evidence.</action>
<action>Set {{total_diagram_count}} to the number of validated diagrams and store diagram paths in {{sequence_diagrams}}.</action>

<action>Update state file:
- Add to completed_steps: {"step": "step_3.5", "status": "completed", "timestamp": "{{now}}", "summary": "Generated {{total_diagram_count}} evidence-backed Mermaid diagrams using HomeGraph relationships"}
- Update last_updated timestamp
</action>

<action>PURGE detailed graph responses from context; keep concise findings and {{sequence_diagrams}} references.</action>
</step>

<step n="4" goal="Perform conditional analysis based on project type requirements" if="workflow_mode != deep_dive">

<critical>KNOWLEDGE GRAPH PREFERENCE (HOMEGRAPH FIRST): If {{has_knowledge_graph}} is true AND {{knowledge_graph_type}} == "homegraph", use HomeGraph as the primary structural-discovery layer. Preferred tools: `homegraph_explore`, `homegraph_search`, `homegraph_node`, `homegraph_callers`, `homegraph_callees`, `homegraph_files`, and `homegraph_impact`.

IMPORTANT PROJECT-PATH FILTERING: Pass `projectPath={{project_root_path}}` when needed, especially in monorepos/workspaces. Only use results belonging to the target project. If HomeGraph returns no relevant result, fall back to direct file reading/search.

Do not call Python/TS CodeToGraph tools from this skill.

SPECIALIZED HOMEGRAPH TOOLS:
- `homegraph_diff_impact`: use only when documenting/reviewing a supplied code diff or changed hunks.
- `homegraph_arkui_migrate`: use only for ArkUI migration/state-semantics documentation.
- `homegraph_spec_match`, `homegraph_spec_find`, `homegraph_spec_trace`: use only when historical Commit4Spec/requirement provenance would improve the requested documentation. Do not make baseline project documentation depend on Commit4Spec data.</critical>

<check if="{{has_knowledge_graph}} == true">
  <critical>MANDATORY HOMEGRAPH ANALYSIS SEQUENCE: HomeGraph is explore-first, not a renamed CodeToGraph pipeline. Begin broad/subsystem investigations with `homegraph_explore`, which may already provide source + call-path + impact evidence. Use `homegraph_search`, `homegraph_node`, `homegraph_callers`, and `homegraph_callees` only for unresolved candidates, exact line-numbered evidence, or explicit directional traces. Avoid redundant calls that reproduce evidence already returned by `homegraph_explore`.</critical>
  <action>STEP 4a: REUSE CACHED DISCOVERY — use {{project_hotspots}}, {{entry_points}}, {{viewmodels}}, {{data_models}}, and {{components}} from Step 3.5.</action>
  <action>STEP 4b: TRACE KEY FLOWS — use `homegraph_node` + bounded `homegraph_callees` for entry points and `homegraph_callers` for central/shared symbols. Reuse existing Step 3.5 diagrams; synthesize a missing diagram only when required by documentation.</action>
  <action>STEP 4c: CROSS-MODULE DEPENDENCY ANALYSIS — ask `homegraph_explore` focused questions between selected entry points and key feature/service modules; verify key transitions with node/caller/callee evidence and source reads.</action>
  <action>STEP 4d: ENTITY DETAILS — use `homegraph_node` for detailed source/relationships and `homegraph_callers` / `homegraph_callees` for directional context.</action>
  <action>STEP 4e: For domain scans below, prefer `homegraph_search` / `homegraph_explore`; use direct file reads for exact implementation details, comments, configuration, schemas, and behavior.</action>
</check>

<critical>GRAPH-LED SUBSYSTEM STRATEGY FOR DEEP/EXHAUSTIVE SCANS</critical>

<check if="scan_level == deep OR scan_level == exhaustive">
  <action>Identify documentation-relevant subsystems from HomeGraph files/explore evidence and the classification's critical_directories.</action>
  <action>For Deep, investigate every important subsystem with focused `homegraph_explore`, then use node/callers/callees/impact and selective exact reads to close gaps. Never read every source file merely because it is in a critical folder.</action>
  <action>For Exhaustive, cover all relevant indexed modules/files and subsystem relationships through HomeGraph, then read unindexed, partially represented, resource/config/data, or exact-detail files as needed. Do not perform an indiscriminate filesystem crawl.</action>
  <action>For each subsystem: collect sufficient graph evidence, selectively verify exact facts, write and validate the relevant documentation, update state, retain a concise summary for reuse, then continue.</action>

<action>Track batches in state file:
findings.batches_completed: [
{"path": "{{subsystem_or_path}}", "files_scanned": {{selectively_verified_count}}, "summary": "{{brief_summary}}"}
]
</action>
</check>

<check if="scan_level == quick">
  <action>Use fast HomeGraph structural analysis and minimal direct reads as defined by the shared policy.</action>
  <check if="{{has_knowledge_graph}} == true">
    <action>Use `homegraph_explore` to identify project-scoped architectural hotspots. Run `homegraph_search` for "entry", "ViewModel", "Model", "component", "util".</action>
    <action>Use `homegraph_callees` on important unresolved entry points to collect sufficient high-level call evidence; synthesize concise Mermaid flow diagrams without deep source verification.</action>
    <action>Fall back to glob/grep only for patterns not covered by the graph</action>
  </check>
  <check if="{{has_knowledge_graph}} == false">
    <action>Use glob/grep to identify file locations and patterns</action>
  </check>
  <action>Extract information from filenames, directory structure, and config files only</action>
</check>

<action>For each part, determine scan requirements:
  1. PRIMARY: Use the merged `requires_*` flags from Step 1 (LLM proposed + baseline cross-check resolution)
  2. SECONDARY: Use CSV's `*_patterns` columns as SUGGESTED glob patterns (LLM can override with better patterns)
  3. TERTIARY: Process any `custom_scans` proposed by LLM in Step 1
</action>

<critical>ANNOTATE LLM-ONLY FLAGS: When a flag was proposed by LLM but NOT required by CSV baseline for this archetype, note it explicitly so the user understands the rationale.</critical>
<check if="any requires_* flag was set by LLM only (not in baseline)">
  <action>For each such flag, add annotation:
  "Note: {{flag_name}} scan was proposed by LLM (not in CSV baseline for {{closest_archetype}} archetype).
  LLM rationale: This project appears to use {{detected_feature}} based on {{evidence}}."</action>
</check>

<action>For each part, execute corresponding scans:</action>

<check if="requires_api_scan == true">
  <action>Scan for API routes and endpoints using integration_scan_patterns</action>
  <action>Look for: controllers/, routes/, api/, handlers/, endpoints/</action>

  <check if="{{has_knowledge_graph}} == true">
    <action>Use `homegraph_search` with query="route OR handler OR controller OR endpoint OR MockRequest OR service" to discover API-related entities. Filter results to {{project_root_path}} paths only.</action>
      <action>Use `homegraph_explore` on the discovered API entities that materially affect documentation to trace middleware, services, and data models they depend on.</action>
    <action>Use `homegraph_callees` on each key data-service handler to map request → parse → response chains; synthesize a diagram only from supported edges.</action>
    <action>Use `homegraph_callers` on data-service entities to discover consumers (which ViewModels call MockRequest, which pages use PreferenceManager).</action>
  </check>

  <check if="scan_level == quick">
    <check if="{{has_knowledge_graph}} == true">
      <action>Use `homegraph_search` with endpoint patterns; extract signatures from entity labels</action>
    </check>
    <check if="{{has_knowledge_graph}} == false">
      <action>Use glob to find route files, extract patterns from filenames and folder structure</action>
    </check>
  </check>

  <check if="scan_level == deep OR scan_level == exhaustive">
    <check if="{{has_knowledge_graph}} == true">
      <action>Use `homegraph_node` on each API entity for detailed metadata; supplement with file reads only for entities missing from the graph</action>
      <action>Use focused `homegraph_explore` questions on important API/data entities until the surrounding context is sufficiently evidenced.</action>
    </check>
    <action>Read only API source details missing or incomplete in HomeGraph; use `homegraph_node` for indexed source.</action>
    <action>Extract: data service methods, trigger strings, request/response types from actual code</action>
  </check>

<action>Build API contracts catalog</action>
<action>IMMEDIATELY write to: {project_knowledge}/api-contracts-{part_id}.md</action>
<action>Validate document has all required sections</action>
<action>Update state file with output generated</action>
<action>PURGE detailed API data, keep only: "{{api_count}} endpoints documented"</action>
<template-output>api_contracts\*{part_id}</template-output>
<critical>SET FLAG: {{api_documented}} = true</critical>
</check>

<check if="requires_data_models == true">
  <action>Scan for data models using schema_migration_patterns</action>
  <action>Look for: models/, schemas/, entities/, migrations/, prisma/, ORM configs</action>

  <check if="{{has_knowledge_graph}} == true">
    <action>Use `homegraph_search` with query="model OR entity OR schema OR Model OR State OR Data" to discover all data model classes. Filter results to {{project_root_path}} paths only.</action>
    <action>Use `homegraph_explore` on documentation-relevant data model entities to trace which ViewModels consume them, which services populate them, and which views display them.</action>
    <action>Use bounded `homegraph_callees` plus `homegraph_explore` on the core data service to reconstruct the data loading pipeline: caller → service → JSON file → model → consumer.</action>
    <action>Ask `homegraph_explore` focused questions about how the main data source reaches 2-3 top-level ViewModels; verify the returned propagation paths.</action>
  </check>

  <check if="scan_level == quick">
    <check if="{{has_knowledge_graph}} == true">
      <action>Use MCP graph queries to extract model names, fields, and types from entity metadata</action>
    </check>
    <check if="{{has_knowledge_graph}} == false">
      <action>Identify schema files via glob, parse migration file names for table discovery</action>
    </check>
  </check>

  <check if="scan_level == deep OR scan_level == exhaustive">
    <check if="{{has_knowledge_graph}} == true">
      <action>Use `homegraph_node` on each model entity for detailed field metadata; supplement with file reads only for entities missing from the graph</action>
    </check>
    <action>Read only model/schema details missing or incomplete in HomeGraph; use `homegraph_node` for indexed source.</action>
    <action>Extract: table names, fields, relationships, constraints from actual code</action>
  </check>

<action>Build database schema documentation</action>
<action>IMMEDIATELY write to: {project_knowledge}/data-models-{part_id}.md</action>
<action>Validate document completeness</action>
<action>Update state file with output generated</action>
<action>PURGE detailed schema data, keep only: "{{table_count}} tables documented"</action>
<template-output>data_models\*{part_id}</template-output>
<critical>SET FLAG: {{data_models_documented}} = true</critical>
</check>

<check if="requires_state_management == true">
  <action>Analyze state management patterns</action>
  <action>Look for: Redux, Context API, MobX, Vuex, Pinia, Provider, MVVM patterns</action>
  <check if="{{has_knowledge_graph}} == true">
    <action>Use `homegraph_search` with query="State OR Store OR ViewModel OR BaseVM OR AppStorage OR @Observed" to discover state management entities. Filter by {{project_root_path}}.</action>
    <action>Use `homegraph_explore` on the BaseVM class (or core state entities) to trace which ViewModels extend it and which views consume them.</action>
    <action>Use `homegraph_callers` on key AppStorage consumers to discover all state subscribers.</action>
  </check>
  <action>Identify: stores, reducers, actions, state structure, reactive flow</action>
  <template-output>state_management_patterns_{part_id}</template-output>
</check>

<check if="requires_ui_components == true">
  <action>Inventory UI component library</action>
  <action>Scan: components/, ui/, widgets/, views/ folders</action>
  <check if="{{has_knowledge_graph}} == true">
    <action>Use `homegraph_search` with query="struct OR @Component OR @Builder OR build" to discover all UI components. Filter results to {{project_root_path}} paths only.</action>
    <action>Use `homegraph_explore` on top-level page structs (e.g., MainPage, SplashPage) to inspect their bounded component context.</action>
    <action>Use `homegraph_callers` on shared components (Toast, TopNavigationView, WebSheet) to discover all pages that reuse them.</action>
  </check>
  <action>Categorize: Layout, Form, Display, Navigation, etc.</action>
  <action>Identify: Design system, component patterns, reusable elements</action>
  <template-output>ui_component_inventory_{part_id}</template-output>
</check>

<check if="requires_ux_flows == true">
  <action>Analyze UX flows and interaction patterns</action>
  <action>Look for: navigation models, state machines, back-press handlers, error/loading states, conditional rendering</action>
  <check if="{{has_knowledge_graph}} == true">
    <action>Use `homegraph_search` with query="onBackPress OR ViewState OR navigate OR pushPath OR @State OR conditional" to discover navigation and state entities. Filter by {{project_root_path}}.</action>
    <action>Use `homegraph_node`, `homegraph_callees`, and source verification on the main page build method to reconstruct component-tree and conditional-flow evidence.</action>
  </check>
  <action>Document: primary user flows (step-by-step), navigation model (state transitions), error/offline UX, loading states, empty states, interaction patterns (tap, scroll, swipe)</action>
  <action>LLM-ONLY FLAG: If this archetype's CSV baseline has baseline_ux_flows=false, annotate: "Note: UX flows scan was proposed by LLM (not in CSV baseline for {{closest_archetype}} archetype). LLM detected UI components and state management."</action>
  <action>IMMEDIATELY write to: {project_knowledge}/ux-flows-{part_id}.md</action>
  <action>Validate document has all required sections (user flows, navigation, error UX, offline, interaction patterns)</action>
  <action>IMMEDIATELY write to: {project_knowledge}/ux-screen-trees-{part_id}.md</action>
  <action>Generate screen tree document with: widget hierarchy for each screen/ViewState (equivalent to DevEco Component Tree inspector), extracted from ArkUI build() methods or equivalent UI framework. Include data bindings, conditional branches, props/links, and component reuse map. Also extract and consolidate Design Tokens section from resource files (color.json, float.json, dimens.xml, etc.) and hardcoded values: color palette, typography scale, spacing/sizing tokens, border radius, shadow styles, opacity values, backgrounds/gradients, icon sizes.</action>
  <action>Validate screen tree document has all required sections (tree per view state, component reuse map, legend)</action>
  <action>Generate HTML wireframe: create {project_knowledge}/ux-screen-wireframes.html with styled HTML/CSS phone frames rendering each ViewState as visual boxes with the same colors, spacing, and layout extracted from the tree. Use tabs/sidebar to switch between ViewStates. Include annotation tooltips showing component names and properties. Ensure the linearGradient background, card borders, semi-transparent overlays, and font sizes match the design tokens.</action>
  <action>Copy icon/asset images: scan all `$r('app.media.XXX')` or equivalent image references from source code, copy the actual PNG/SVG files from resource directories to {project_knowledge}/images/, and embed them as `<img>` tags in the wireframe HTML. For any missing icons (e.g., system resources), create inline SVG placeholders so the wireframe renders visually complete.</action>
  <action>Generate interactive UX mockup: create {project_knowledge}/ux-interactive-mockup.html — a self-contained HTML file that renders a phone frame with clickable UI elements. Implement the full state machine from ux-flows.md: every tap/gesture triggers a ViewState transition with animated loading delays (1-1.5s), error simulation, and back-press handling. Include: (1) a right-side panel with live state indicator, flow diagram with highlighted current state, breadcrumb path, and navigation history log, (2) keyboard shortcuts (Esc=back, Enter=search), (3) a toast notification showing each transition action. The mockup must be standalone — no server, no dependencies, open in any browser.</action>
  <action>Update state file with output generated</action>
  <action>PURGE detailed UX data, keep only: "UX flows documented for {{part_id}}"</action>
  <template-output>ux_flows_{part_id}</template-output>
  <critical>SET FLAG: {{ux_flows_documented}} = true</critical>
</check>

<check if="requires_test_strategy == true">
  <action>Analyze testing infrastructure and recommend test strategy</action>
  <action>Scan for: test frameworks (Jest, Mocha, PyTest, Go test, Hypium, etc.), test file patterns, CI test integration</action>
  <check if="{{has_knowledge_graph}} == true">
    <action>Use `homegraph_search` with query="test OR spec OR __tests__ OR hypium OR describe OR it" to discover test files. Filter by {{project_root_path}}.</action>
  </check>
  <action>Document: test framework used, current test coverage (scan for test files), recommended test inventory (test ID, target, what to test, priority), mocking strategy, CI integration commands</action>
  <action>LLM-ONLY FLAG: If this archetype's CSV baseline has baseline_test_strategy=false, annotate: "Note: Test strategy was proposed by LLM (not in CSV baseline for {{closest_archetype}} archetype). Every project benefits from documented test strategy."</action>
  <action>IMMEDIATELY write to: {project_knowledge}/test-strategy-{part_id}.md</action>
  <action>Validate document has all required sections (test inventory, mocking, CI, coverage targets)</action>
  <action>Update state file with output generated</action>
  <action>PURGE detailed test data, keep only: "Test strategy documented for {{part_id}}"</action>
  <template-output>test_strategy_{part_id}</template-output>
  <critical>SET FLAG: {{test_strategy_documented}} = true</critical>
</check>

<check if="requires_hardware_docs == true">
  <action>Look for hardware schematics using hardware_interface_patterns</action>
  <ask>This appears to be an embedded/hardware project. Do you have:
  - Pinout diagrams
  - Hardware schematics
  - PCB layouts
  - Hardware documentation

If yes, please provide paths or links. [Provide paths or type 'none']
</ask>
<action>Store hardware docs references</action>
<template-output>hardware*documentation*{part_id}</template-output>
</check>

<check if="requires_asset_inventory == true">
  <action>Scan and catalog assets using asset_patterns</action>
  <action>Categorize by: Images, Audio, 3D Models, Sprites, Textures, etc.</action>
  <action>Calculate: Total size, file counts, formats used</action>
  <action>Include a cross-reference at the top: "For localization / i18n details, see [localization-{part_id}.md](./localization-{part_id}.md)."</action>
  <template-output>asset_inventory_{part_id}</template-output>
</check>

<critical>LOCALIZATION IS A SEPARATE STANDALONE DOCUMENT. Do NOT merge localization content into asset inventory or any other file. Localization must be written to its own `localization-{part_id}.md` file. Use the localization-template.md from the templates folder.</critical>
<check if="requires_localization == true">
  <action>Analyze internationalization (i18n) and localization support using localization_patterns</action>
  <action>Scan for i18n files: locales/, i18n/, translations/, resources/*/element/, lang/, messages/, *.po, *.pot, *.strings, *.json locale files</action>

  <check if="{{has_knowledge_graph}} == true">
    <action>Use `homegraph_search` with query="i18n OR locale OR resources OR element OR translations OR lang OR string" to discover i18n-related entities. Filter results to {{project_root_path}} paths only.</action>
    <action>Use `homegraph_explore` on documentation-relevant i18n consumers to trace which UI components use localized strings.</action>
  </check>

  <check if="scan_level == quick">
    <check if="{{has_knowledge_graph}} == true">
      <action>Use `homegraph_search` with i18n patterns; extract supported locales from filenames and directory structure</action>
    </check>
    <check if="{{has_knowledge_graph}} == false">
      <action>Use glob to find locale files, extract language codes from directory names and filenames</action>
    </check>
  </check>

  <check if="scan_level == deep OR scan_level == exhaustive">
    <check if="{{has_knowledge_graph}} == true">
      <action>Use `homegraph_node` on each i18n entity for detailed metadata; supplement with file reads for translation file formats</action>
    </check>
    <action>Read locale files in batches (one directory at a time)</action>
    <action>Extract: supported languages, translation file format, UI string discovery, resource injection patterns</action>
  </check>

  <action>Categorize: supported languages, translation file format, string resource structure, locale switching mechanism</action>
  <action>Use template: templates/localization-template.md — fill all sections from the locale analysis data</action>
  <action>IMMEDIATELY write to: {project_knowledge}/localization-{part_id}.md</action>
  <action>Validate document has all required sections</action>
  <action>Update state file with output generated</action>
  <action>PURGE detailed i18n data, keep only: "{{locale_count}} languages supported"</action>
  <template-output>localization_{part_id}</template-output>
  <critical>SET FLAG: {{localization_documented}} = true. This flag drives Step 9 generation. Do not skip.</critical>
</check>

<action>Scan for additional patterns based on doc requirements:

- config_patterns → Configuration management
- auth_security_patterns → Authentication/authorization approach
- entry_point_patterns → Application entry points and bootstrap
- shared_code_patterns → Shared libraries and utilities
- async_event_patterns → Event-driven architecture
- ci_cd_patterns → CI/CD pipeline details
  </action>

<check if="{{has_knowledge_graph}} == true">
  <action>For each pattern above, use `homegraph_search` with the pattern's domain keywords. For entry_point_patterns, reuse the {{entry_points}} already discovered and LLM-validated in Step 3.5 — do NOT run a new search. For shared_code_patterns use query="common OR shared OR util". Filter ALL results to {{project_root_path}} paths ONLY — discard any nodes from outside the target project.</action>
  <action>For auth/security, use `homegraph_search` with query="auth OR certManager OR crypto OR permission OR HUKS". For async events use query="emitter OR EventHub OR NotificationManager OR backgroundTask".</action>
  <action>For each discovered entity cluster, run `homegraph_explore` to reveal their full dependency context.</action>
</check>

<action>Apply the shared scan-level strategy to every pattern: Quick uses graph-first structural discovery with minimal direct reads; Deep uses comprehensive graph traversal plus selective verification; Exhaustive maximizes graph-backed coverage and reads broadly only to fill graph/resource/data gaps.</action>

<template-output>comprehensive*analysis*{part_id}</template-output>

<action>Update state file:

- Add to completed_steps: {"step": "step_4", "status": "completed", "timestamp": "{{now}}", "summary": "Conditional analysis complete, {{files_generated}} files written"}
- Update current_step = "step_5"
- Update last_updated timestamp
- List all outputs_generated
- Track conditional flags: localization_documented={{localization_documented}}, api_documented={{api_documented}}, data_models_documented={{data_models_documented}}, ux_flows_documented={{ux_flows_documented}}, test_strategy_documented={{test_strategy_documented}}
  </action>

<action>PURGE all detailed scan results from context. Keep only summaries:

- "APIs: {{api_count}} endpoints"
- "Data: {{table_count}} tables"
- "Components: {{component_count}} components"
  </action>
  </step>

<step n="5" goal="Generate source tree analysis with annotations" if="workflow_mode != deep_dive">
<check if="{{has_knowledge_graph}} == true">
  <action>Reuse the LLM-validated {{entry_points}} from Step 3.5 discovery phase. Use `homegraph_search` with query="component OR @Component OR struct" to map component locations. This supplements the directory tree with entity-level annotations.</action>
</check>

<action>For each part, generate complete directory tree using critical_directories from doc requirements</action>

<action>Annotate the tree with:

- Purpose of each critical directory
- Entry points marked
- Key file locations highlighted
- Integration points noted (for multi-part projects)
  </action>

<action if="multi-part project">Show how parts are organized and where they interface</action>

<action>Create formatted source tree with descriptions:

```
project-root/
├── client/          # React frontend (Part: client)
│   ├── src/
│   │   ├── components/  # Reusable UI components
│   │   ├── pages/       # Route-based pages
│   │   └── api/         # API client layer → Calls server/
├── server/          # Express API backend (Part: api)
│   ├── src/
│   │   ├── routes/      # REST API endpoints
│   │   ├── models/      # Database models
│   │   └── services/    # Business logic
```

</action>

<template-output>source_tree_analysis</template-output>
<template-output>critical_folders_summary</template-output>

<action>IMMEDIATELY write source-tree-analysis.md to disk</action>
<action>Validate document structure</action>
<action>Update state file:

- Add to completed_steps: {"step": "step_5", "status": "completed", "timestamp": "{{now}}", "summary": "Source tree documented"}
- Update current_step = "step_6"
- Add output: "source-tree-analysis.md"
  </action>
  <action>PURGE detailed tree from context, keep only: "Source tree with {{folder_count}} critical folders"</action>
  </step>

<step n="6" goal="Extract development and operational information" if="workflow_mode != deep_dive">
<action>Scan for development setup using entry_point_patterns and config_patterns from documentation-requirements.csv, plus existing docs:
- Prerequisites (Node version, Python version, etc.)
- Installation steps (npm install, etc.)
- Environment setup (.env files, config)
- Build commands (npm run build, make, etc.)
- Run commands (npm start, go run, etc.)
- Test commands using test_file_patterns
</action>

<action>Look for deployment configuration using ci_cd_patterns:

- Dockerfile, docker-compose.yml
- Kubernetes configs (k8s/, helm/)
- CI/CD pipelines (.github/workflows/, .gitlab-ci.yml)
- Deployment scripts
- Infrastructure as Code (terraform/, pulumi/)
  </action>

<action if="CONTRIBUTING.md or similar found">
  <action>Extract contribution guidelines:
    - Code style rules
    - PR process
    - Commit conventions
    - Testing requirements
  </action>
</action>

<template-output>development_instructions</template-output>
<template-output>deployment_configuration</template-output>
<template-output>contribution_guidelines</template-output>

<action>Update state file:

- Add to completed_steps: {"step": "step_6", "status": "completed", "timestamp": "{{now}}", "summary": "Dev/deployment guides written"}
- Update current_step = "step_7"
- Add generated outputs to list
  </action>
  <action>PURGE detailed instructions, keep only: "Dev setup and deployment documented"</action>
  </step>

<step n="7" goal="Detect multi-part integration architecture" if="workflow_mode != deep_dive and project has multiple parts">
<action>Analyze how parts communicate:
- Scan integration_scan_patterns across parts
- Identify: REST calls, GraphQL queries, gRPC, message queues, shared databases
- Document: API contracts between parts, data flow, authentication flow
</action>

<action>Create integration_points array with:

- from: source part
- to: target part
- type: REST API, GraphQL, gRPC, Event Bus, etc.
- details: Endpoints, protocols, data formats
  </action>

<action>IMMEDIATELY write integration-architecture.md to disk</action>
<action>Validate document completeness</action>

<template-output>integration_architecture</template-output>

<action>Update state file:

- Add to completed_steps: {"step": "step_7", "status": "completed", "timestamp": "{{now}}", "summary": "Integration architecture documented"}
- Update current_step = "step_8"
  </action>
  <action>PURGE integration details, keep only: "{{integration_count}} integration points"</action>
  </step>

<step n="8" goal="Generate architecture documentation for each part" if="workflow_mode != deep_dive">
<action>For each part in project_parts:
  - Use matched architecture template from Step 3 as base structure
  - Fill in all sections with discovered information:
    * Executive Summary
    * Technology Stack (from Step 3)
    * Architecture Pattern (from registry match)
    * Data Architecture (from Step 4 data models scan)
    * API Design (from Step 4 API scan if applicable)
    * Component Overview (from Step 4 component scan if applicable)
    * Source Tree (from Step 5)
    * Development Workflow (from Step 6)
    * Deployment Architecture (from Step 6)
    * Testing Strategy (from test patterns)
    * Porting Patterns (if porting-mode or ≥3 cross-module patterns discovered via diagram traces)
</action>

<critical>PORTING PATTERNS: If ≥3 cross-module patterns were discovered during diagram trace analysis (Step 3.5), add a "## Porting Patterns" section to architecture.md. Each pattern describes a recurring architectural convention critical for cross-platform porting.</critical>

<check if="≥3 cross-module patterns discovered (e.g., shared utilities with ≥5 callers, multi-step init chains spanning ≥2 files)">
  <action>Add a "## Porting Patterns" section with this structure:</action>
  <action>
```
## Porting Patterns

> Patterns critical for cross-platform porting — revealed by HomeGraph trace analysis.
> Each pattern describes a recurring architectural convention that must be replicated
> in the target platform.

### Pattern: Event Dispatch (sendEvent)

| Aspect | Detail |
|--------|--------|
| **Where** | All ViewModels (BaseHomeViewModel, ComponentDetailPageVM, ...) |
| **What** | Single `sendEvent(action, params)` method dispatches to `this[action](params)` |
| **Port** | Replace with equivalent event bus / action dispatch system in target framework |

### Pattern: Storage Singleton

| Aspect | Detail |
|--------|--------|
| **Where** | All features via shared storage manager |
| **What** | Lazy-init singleton wrapping platform key-value store |
| **Port** | Replace with target platform's key-value store (AsyncStorage, SharedPreferences, etc.) |

### Pattern: Router Facade

| Aspect | Detail |
|--------|--------|
| **Where** | All ViewModels navigate via centralized router facade |
| **What** | Single facade wrapping navigation stack with per-tab back stacks |
| **Port** | Replace with target platform's navigation system |

### Pattern: Download Flow

| Aspect | Detail |
|--------|--------|
| **Where** | Feature-specific download chain |
| **What** | Dynamic module installation via platform SDK, with progress/status tracking |
| **Port** | Replace with target platform's dynamic feature/module loading API |

### Pattern: WebView Initialization

| Aspect | Detail |
|--------|--------|
| **Where** | WebView setup chain |
| **What** | Offline-capable WebView via native WebView API with custom URL interception |
| **Port** | Replace with target platform's WebView API with equivalent load interception hooks |
```
  </action>
  <action>Discover patterns by examining {{diagram_index}} for: (a) reverse traces showing 5+ callers from multiple modules, (b) forward traces showing multi-step initialization chains crossing ≥2 project files.</action>
  <action>For each pattern: include name, where (files/modules), what (1-line summary), key methods, and porting notes.</action>
</check>

<check if="{project_knowledge}/diagrams/INDEX.md exists">
  <action>Add a "## Sequence Diagrams" section to architecture.md with this structure:</action>
  <action>
```
## Sequence Diagrams

> {{total_diagram_count}} sequence diagrams synthesized from HomeGraph `explore`, `callers`, `callees`, and `node` evidence plus verified source reads. Full catalog with descriptions:
> **[diagrams/INDEX.md](./diagrams/INDEX.md)**

### Highlights

Pick the 3-5 most architecturally revealing diagrams from INDEX.md and link them with a 1-sentence analysis each:

- **[hotspot-{Label}-trace.mmd](./diagrams/hotspot-{Label}-trace.mmd)** — {What this reveals: e.g., "Logger is called by 19 modules across all feature boundaries"}
- **[entry-{Label}-trace.mmd](./diagrams/entry-{Label}-trace.mmd)** — {What this reveals}
- **[data-{Label}-callers.mmd](./diagrams/data-{Label}-callers.mmd)** — {What this reveals}
- **[path-{from}-to-{to}.mmd](./diagrams/path-{from}-to-{to}.mmd)** — {What this reveals}
- **[component-{Label}-consumers.mmd](./diagrams/component-{Label}-consumers.mmd)** — {What this reveals}

Open `.mmd` files in any Mermaid renderer (VS Code, Mermaid Live, Obsidian).
```
  </action>
  <action>For the highlights, prioritize diagrams that cross the most community/module boundaries or reveal surprising dependency chains (e.g., a component used by features you wouldn't expect).</action>
</check>

<action if="single part project">
  - Generate: architecture.md (no part suffix)
</action>

<action if="multi-part project">
  - Generate: architecture-{part_id}.md for each part
</action>

<action>For each architecture file generated:

- IMMEDIATELY write architecture file to disk
- Validate against architecture template schema
- Update state file with output
- PURGE detailed architecture from context, keep only: "Architecture for {{part_id}} written"
  </action>

<template-output>architecture_document</template-output>

<action>Update state file:

- Add to completed_steps: {"step": "step_8", "status": "completed", "timestamp": "{{now}}", "summary": "Architecture docs written for {{parts_count}} parts"}
- Update current_step = "step_9"
  </action>
  </step>

<step n="9" goal="Generate supporting documentation files" if="workflow_mode != deep_dive">
<action>Generate project-overview.md with:
- Project name and purpose (from README or user input)
- Executive summary
- Tech stack summary table
- Architecture type classification
- Repository structure (monolith/monorepo/multi-part)
- Links to detailed docs
</action>

<action>Generate source-tree-analysis.md with:

- Full annotated directory tree from Step 5
- Critical folders explained
- Entry points documented
- Multi-part structure (if applicable)
  </action>

<action>IMMEDIATELY write project-overview.md to disk</action>
<action>Validate document sections</action>

<action>Generate source-tree-analysis.md (if not already written in Step 5)</action>
<action>IMMEDIATELY write to disk and validate</action>

<action>Generate component-inventory.md (or per-part versions) with:

- All discovered components from Step 4
- Categorized by type
- Reusable vs specific components
- Design system elements (if found)
  </action>
  <action>IMMEDIATELY write each component inventory to disk and validate</action>

<action>Generate development-guide.md (or per-part versions) with:

- Prerequisites and dependencies
- Environment setup instructions
- Local development commands
- Build process
- Testing approach and commands
- Common development tasks
  </action>
  <action>IMMEDIATELY write each development guide to disk and validate</action>

<action if="deployment configuration found">
   <critical>DEPLOYMENT-CONFIG SCOPE: This document covers build config, module dependencies, signing, permissions, and CI/CD pipeline ONLY. For localization/i18n content, reference `localization-{part_id}.md`.</critical>
  <action>Generate deployment-guide.md with:
    - Infrastructure requirements
    - Deployment process
    - Environment configuration
    - CI/CD pipeline details
  </action>
  <action>IMMEDIATELY write to disk and validate</action>
</action>

<action if="contribution guidelines found">
  <action>Generate contribution-guide.md with:
    - Code style and conventions
    - PR process
    - Testing requirements
    - Documentation standards
  </action>
  <action>IMMEDIATELY write to disk and validate</action>
</action>

<action if="api_documented == true">
  <action>Generate api-contracts.md (or per-part) with:
    - All API endpoints
    - Request/response schemas
    - Authentication requirements
    - Example requests
  </action>
  <action>IMMEDIATELY write to disk and validate</action>
</action>

<action if="data_models_documented == true">
  <action>Generate data-models.md (or per-part) with:
    - Database schema
    - Table relationships
    - Data models and entities
    - Migration strategy
  </action>
  <action>IMMEDIATELY write to disk and validate</action>
</action>

<action if="localization_documented == true">
   <critical>Localization is a standalone file: `localization-{part_id}.md`. For deployment/CI/CD content, reference `deployment-guide-{part_id}.md`.</critical>
  <action>Generate localization.md (or per-part) with:
    - Supported languages and locale codes
    - Translation file format and structure
    - String resource injection patterns
    - Locale switching mechanism
    - Key UI strings catalog
  </action>
  <action>IMMEDIATELY write to disk and validate</action>
</action>

<action if="ux_flows_documented == true">
  <action>Generate ux-flows.md (or per-part) using template `templates/ux-flows-template.md` with:
    - Primary user flows (step-by-step with state transitions)
    - Secondary flows (saved data, search history, etc.)
    - Navigation model (state machine, back-press, tab switching)
    - Error UX (error states, retry mechanisms)
    - Offline UX (cached data handling, offline indicators)
    - Loading states (spinners, skeletons, progress)
    - Component interaction map (action → component → ViewModel method → state change)
    - Conditional rendering table (ViewState → rendered/hidden components)
  </action>
  <action>IMMEDIATELY write to disk and validate</action>
  <action>Generate ux-screen-trees.md (or per-part) with:
    - Widget hierarchy for each screen/ViewState (equivalent to DevEco Component Tree inspector)
    - Extracted from framework build() methods or equivalent UI's render functions
    - Include: data bindings (@State, @Prop, @Link, useState, props), conditional branches, layout properties, child components, ForEach/List loops
    - Component reuse map: which components are reused and how many instances
    - Design Tokens section: color palette, typography scale, spacing/layout tokens, shadow & opacity values, backgrounds & gradients, icon sizes — extracted from resource files AND hardcoded values
    - Legend explaining symbols and conventions
  </action>
  <action>IMMEDIATELY write to disk and validate</action>
  <action>Generate ux-screen-wireframes.html (or per-part) with:
    - Styled HTML/CSS phone frames rendering each ViewState
    - Same colors, spacing, layout extracted from design tokens
    - Tabs/sidebar to switch between ViewStates
    - Annotation tooltips showing component names and properties
    - <img> tags embedding actual icon PNGs from {project_knowledge}/images/
    - Inline SVG placeholders for any missing icons
  </action>
  <action>IMMEDIATELY write to disk and validate</action>
  <action>Generate ux-interactive-mockup.html (or per-part) with:
    - Self-contained HTML phone-frame mockup implementing the full state machine from ux-flows.md
    - Clickable UI elements: SearchBar → city search, city cards → weather fetch, ← Back button
    - Animated ViewState transitions with realistic API delays (1-1.5s)
    - Right-side panel: live state indicator, flow diagram (current state highlighted), breadcrumb path, navigation history log
    - Keyboard shortcuts: Esc = Back, Enter = Search, Ctrl+R = Reset
    - Toast notifications showing each transition action
    - Standalone — no server, no dependencies, works in any browser
  </action>
  <action>IMMEDIATELY write to disk and validate</action>
</action>

<action if="test_strategy_documented == true">
  <action>Generate test-strategy.md (or per-part) with:
    - Test framework and infrastructure
    - Current test coverage assessment
    - Recommended test inventory (ID, target, what to test, priority)
    - Mocking strategy (API mocks, DB mocks, DI mocking)
    - CI/CD integration (test commands in pipeline)
    - Coverage targets by layer
  </action>
  <action>IMMEDIATELY write to disk and validate</action>
</action>

<action if="multi-part project">
  <action>Generate integration-architecture.md with:
    - How parts communicate
    - Integration points diagram/description
    - Data flow between parts
    - Shared dependencies
  </action>
  <action>IMMEDIATELY write to disk and validate</action>

<action>Generate project-parts.json metadata file:
`json
    {
      "repository_type": "monorepo",
      "parts": [ ... ],
      "integration_points": [ ... ]
    }
    `
</action>
<action>IMMEDIATELY write to disk</action>
</action>

<template-output>supporting_documentation</template-output>

<action>Update state file:

- Add to completed_steps: {"step": "step_9", "status": "completed", "timestamp": "{{now}}", "summary": "All supporting docs written"}
- Update current_step = "step_10"
- List all newly generated outputs
  </action>

<action>PURGE all document contents from context, keep only list of files generated</action>
</step>

<step n="10" goal="Generate master index as primary AI retrieval source" if="workflow_mode != deep_dive">

<critical>INCOMPLETE DOCUMENTATION MARKER CONVENTION:
When a document SHOULD be generated but wasn't (due to quick scan, missing data, conditional requirements not met):

- Use EXACTLY this marker: _(To be generated)_
- Place it at the end of the markdown link line
- Example: - [API Contracts - Server](./api-contracts-server.md) _(To be generated)_
- This allows Step 11 to detect and offer to complete these items
- ALWAYS use this exact format for consistency and automated detection
  </critical>

<action>Create index.md with intelligent navigation based on project structure</action>

<action if="single part project">
  <action>Generate simple index with:
    - Project name and type
    - Quick reference (tech stack, architecture type)
    - Links to all generated docs
    - Links to discovered existing docs
    - Getting started section
  </action>
</action>

<action if="multi-part project">
  <action>Generate comprehensive index with:
    - Project overview and structure summary
    - Part-based navigation section
    - Quick reference by part
    - Cross-part integration links
    - Links to all generated and existing docs
    - Getting started per part
  </action>
</action>

<action>Include in index.md:

## Project Documentation Index

### Project Overview

- **Type:** {{repository_type}} {{#if multi-part}}with {{parts.length}} parts{{/if}}
- **Primary Language:** {{primary_language}}
- **Architecture:** {{architecture_type}}

### Quick Reference

{{#if single_part}}

- **Tech Stack:** {{tech_stack_summary}}
- **Entry Point:** {{entry_point}}
- **Architecture Pattern:** {{architecture_pattern}}
  {{else}}
  {{#each parts}}

#### {{part_name}} ({{part_id}})

- **Type:** {{project_type}}
- **Tech Stack:** {{tech_stack}}
- **Root:** {{root_path}}
  {{/each}}
  {{/if}}

### Generated Documentation

- [Project Overview](./project-overview.md)
- [Architecture](./architecture{{#if multi-part}}-{part\*id}{{/if}}.md){{#unless architecture_file_exists}} (To be generated) {{/unless}}
- [Source Tree Analysis](./source-tree-analysis.md)
- [Component Inventory](./component-inventory{{#if multi-part}}-{part\*id}{{/if}}.md){{#unless component_inventory_exists}} (To be generated) {{/unless}}
- [Development Guide](./development-guide{{#if multi-part}}-{part\*id}{{/if}}.md){{#unless dev_guide_exists}} (To be generated) {{/unless}}
  {{#if deployment_found}}- [Deployment Guide](./deployment-guide.md){{#unless deployment_guide_exists}} (To be generated) {{/unless}}{{/if}}
  {{#if contribution_found}}- [Contribution Guide](./contribution-guide.md){{/if}}
  {{#if api_documented}}- [API Contracts](./api-contracts{{#if multi-part}}-{part_id}{{/if}}.md){{#unless api_contracts_exists}} (To be generated) {{/unless}}{{/if}}
  {{#if data_models_documented}}- [Data Models](./data-models{{#if multi-part}}-{part_id}{{/if}}.md){{#unless data_models_exists}} (To be generated) {{/unless}}{{/if}}
  {{#if localization_documented}}- [Localization](./localization{{#if multi-part}}-{part_id}{{/if}}.md){{#unless localization_exists}} (To be generated) {{/unless}}{{/if}}
  {{#if ux_flows_documented}}- [UX Flows](./ux-flows{{#if multi-part}}-{part_id}{{/if}}.md){{#unless ux_flows_exists}} (To be generated) {{/unless}}{{/if}}
  {{#if ux_flows_documented}}- [UX Screen Trees](./ux-screen-trees{{#if multi-part}}-{part_id}{{/if}}.md){{#unless ux_flows_exists}} (To be generated) {{/unless}}{{/if}}
  {{#if test_strategy_documented}}- [Test Strategy](./test-strategy{{#if multi-part}}-{part_id}{{/if}}.md){{#unless test_strategy_exists}} (To be generated) {{/unless}}{{/if}}
  {{#if multi-part}}- [Integration Architecture](./integration-architecture.md){{#unless integration_arch_exists}} (To be generated) {{/unless}}{{/if}}

### Existing Documentation

{{#each existing_docs}}

- [{{title}}]({{relative_path}}) - {{description}}
  {{/each}}

### Getting Started

{{getting_started_instructions}}
</action>

<action>Before writing index.md, check which expected files actually exist:

- For each document that should have been generated, check if file exists on disk
- Set existence flags: architecture_file_exists, component_inventory_exists, dev_guide_exists, etc.
- These flags determine whether to add the _(To be generated)_ marker
- Track which files are missing in {{missing_docs_list}} for reporting
  </action>

<action>IMMEDIATELY write index.md to disk with appropriate _(To be generated)_ markers for missing files</action>
<action>Validate index has all required sections and links are valid</action>

<template-output>index</template-output>

<action>Update state file:

- Add to completed_steps: {"step": "step_10", "status": "completed", "timestamp": "{{now}}", "summary": "Master index generated"}
- Update current_step = "step_11"
- Add output: "index.md"
  </action>

<action>PURGE index content from context</action>
</step>

<step n="11" goal="Validate and review generated documentation" if="workflow_mode != deep_dive">
<action>Show summary of all generated files:
Generated in {{project_knowledge}}/:
{{file_list_with_sizes}}
</action>

<action>Run validation checklist from ../checklist.md</action>

<critical>INCOMPLETE DOCUMENTATION DETECTION:

1. PRIMARY SCAN: Look for exact marker: _(To be generated)_
2. FALLBACK SCAN: Look for fuzzy patterns (in case agent was lazy):
   - _(TBD)_
   - _(TODO)_
   - _(Coming soon)_
   - _(Not yet generated)_
   - _(Pending)_
3. Extract document metadata from each match for user selection
   </critical>

<action>Read {project_knowledge}/index.md</action>

<action>Scan for incomplete documentation markers:
Step 1: Search for exact pattern "_(To be generated)_" (case-sensitive)
Step 2: For each match found, extract the entire line
Step 3: Parse line to extract:

- Document title (text within [brackets] or **bold**)
- File path (from markdown link or inferable from title)
- Document type (infer from filename: architecture, api-contracts, data-models, localization, component-inventory, development-guide, deployment-guide, integration-architecture)
- Part ID if applicable (extract from filename like "architecture-server.md" → part_id: "server")
  Step 4: Add to {{incomplete_docs_strict}} array
  </action>

<action>Fallback fuzzy scan for alternate markers:
Search for patterns: _(TBD)_, _(TODO)_, _(Coming soon)_, _(Not yet generated)_, _(Pending)_
For each fuzzy match:

- Extract same metadata as strict scan
- Add to {{incomplete_docs_fuzzy}} array with fuzzy_match flag
  </action>

<action>Combine results:
Set {{incomplete_docs_list}} = {{incomplete_docs_strict}} + {{incomplete_docs_fuzzy}}
For each item store structure:
{
"title": "Architecture – Server",
"file\*path": "./architecture-server.md",
"doc_type": "architecture",
"part_id": "server",
"line_text": "- [Architecture – Server](./architecture-server.md) (To be generated)",
"fuzzy_match": false
}
</action>

<ask>Documentation generation complete!

Summary:

- Project Type: {{project_type_summary}}
- Parts Documented: {{parts_count}}
- Files Generated: {{files_count}}
- Total Lines: {{total_lines}}

{{#if incomplete_docs_list.length > 0}}
⚠️ **Incomplete Documentation Detected:**

I found {{incomplete_docs_list.length}} item(s) marked as incomplete:

{{#each incomplete_docs_list}}
{{@index + 1}}. **{{title}}** ({{doc_type}}{{#if part_id}} for {{part_id}}{{/if}}){{#if fuzzy_match}} ⚠️ [non-standard marker]{{/if}}
{{/each}}

{{/if}}

Would you like to:

{{#if incomplete_docs_list.length > 0}}

1. **Generate incomplete documentation** - Complete any of the {{incomplete_docs_list.length}} items above
2. Review any specific section [type section name]
3. Add more detail to any area [type area name]
4. Generate additional custom documentation [describe what]
5. Finalize and complete [type 'done']
   {{else}}
6. Review any specific section [type section name]
7. Add more detail to any area [type area name]
8. Generate additional documentation [describe what]
9. Finalize and complete [type 'done']
   {{/if}}

Your choice:
</ask>

<check if="user selects option 1 (generate incomplete)">
  <ask>Which incomplete items would you like to generate?

{{#each incomplete_docs_list}}
{{@index + 1}}. {{title}} ({{doc_type}}{{#if part_id}} - {{part_id}}{{/if}})
{{/each}}
{{incomplete_docs_list.length + 1}}. All of them

Enter number(s) separated by commas (e.g., "1,3,5"), or type 'all':
</ask>

<action>Parse user selection:

- If "all", set {{selected_items}} = all items in {{incomplete_docs_list}}
- If comma-separated numbers, extract selected items by index
- Store result in {{selected_items}} array
  </action>

  <action>Display: "Generating {{selected_items.length}} document(s)..."</action>

  <action>For each item in {{selected_items}}:

1. **Identify the part and requirements:**
   - Extract part_id from item (if exists)
   - Look up part data in project_parts array from state file
   - Load documentation_requirements for that part's project_type_id

2. **Route to appropriate generation substep based on doc_type:**

   **If doc_type == "architecture":**
   - Display: "Generating architecture documentation for {{part_id}}..."
   - Load architecture_match for this part from state file (Step 3 cache)
   - Re-run Step 8 architecture generation logic ONLY for this specific part
   - Use matched template and fill with cached data from state file
   - Write architecture-{{part_id}}.md to disk
   - Validate completeness

   **If doc_type == "api-contracts":**
   - Display: "Generating API contracts for {{part_id}}..."
   - Load part data and documentation_requirements
   - Re-run Step 4 API scan substep targeting ONLY this part
   - Use scan_level from state file (quick/deep/exhaustive)
   - Generate api-contracts-{{part_id}}.md
   - Validate document structure

   **If doc_type == "data-models":**
    - Display: "Generating data models documentation for {{part_id}}..."
    - Re-run Step 4 data models scan substep targeting ONLY this part
    - Use schema_migration_patterns from documentation_requirements
    - Generate data-models-{{part_id}}.md
    - Validate completeness

   **If doc_type == "localization":**
    - Display: "Generating localization documentation for {{part_id}}..."
    - Re-run Step 4 localization scan substep targeting ONLY this part
    - Use localization_patterns from documentation_requirements
    - Generate localization-{{part_id}}.md
    - Validate completeness

   **If doc_type == "component-inventory":**
   - Display: "Generating component inventory for {{part_id}}..."
   - Re-run Step 9 component inventory generation for this specific part
   - Scan components/, ui/, widgets/ folders
   - Generate component-inventory-{{part_id}}.md
   - Validate structure

   **If doc_type == "development-guide":**
   - Display: "Generating development guide for {{part_id}}..."
   - Re-run Step 9 development guide generation for this specific part
    - Use entry_point_patterns and test_file_patterns from documentation_requirements as suggested scan targets
   - Generate development-guide-{{part_id}}.md
   - Validate completeness

   **If doc_type == "deployment-guide":**
   - Display: "Generating deployment guide..."
   - Re-run Step 6 deployment configuration scan
   - Re-run Step 9 deployment guide generation
   - Generate deployment-guide.md
   - Validate structure

   **If doc_type == "integration-architecture":**
   - Display: "Generating integration architecture..."
   - Re-run Step 7 integration analysis for all parts
   - Generate integration-architecture.md
   - Validate completeness

3. **Post-generation actions:**
   - Confirm file was written successfully
   - Update state file with newly generated output
   - Add to {{newly_generated_docs}} tracking list
   - Display: "✓ Generated: {{file_path}}"

4. **Handle errors:**
   - If generation fails, log error and continue with next item
   - Track failed items in {{failed_generations}} list
     </action>

<action>After all selected items are processed:

**Update index.md to remove markers:**

1. Read current index.md content
2. For each item in {{newly_generated_docs}}:
   - Find the line containing the file link and marker
   - Remove the _(To be generated)_ or fuzzy marker text
   - Leave the markdown link intact
3. Write updated index.md back to disk
4. Update state file to record index.md modification
   </action>

<action>Display generation summary:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ **Documentation Generation Complete!**

**Successfully Generated:**
{{#each newly_generated_docs}}

- {{title}} → {{file_path}}
  {{/each}}

{{#if failed_generations.length > 0}}
**Failed to Generate:**
{{#each failed_generations}}

- {{title}} ({{error_message}})
  {{/each}}
  {{/if}}

**Updated:** index.md (removed incomplete markers)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
</action>

<action>Update state file with all generation activities</action>

<action>Return to Step 11 menu (loop back to check for any remaining incomplete items)</action>
</check>

<action if="user requests other changes (options 2-3)">Make requested modifications and regenerate affected files</action>
<action if="user selects finalize (option 4 or 5)">Proceed to Step 12 completion</action>

<check if="not finalizing">
  <action>Update state file:
- Add to completed_steps: {"step": "step_11_iteration", "status": "completed", "timestamp": "{{now}}", "summary": "Review iteration complete"}
- Keep current_step = "step_11" (for loop back)
- Update last_updated timestamp
  </action>
  <action>Loop back to beginning of Step 11 (re-scan for remaining incomplete docs)</action>
</check>

<check if="finalizing">
  <action>Update state file:
- Add to completed_steps: {"step": "step_11", "status": "completed", "timestamp": "{{now}}", "summary": "Validation and review complete"}
- Update current_step = "step_12"
  </action>
  <action>Proceed to Step 12</action>
</check>
</step>

<step n="12" goal="Finalize and provide next steps" if="workflow_mode != deep_dive">
<action>Create final summary report</action>
<action>Compile verification recap variables:
  - Set {{verification_summary}} to the concrete tests, validations, or scripts you executed (or "none run").
  - Set {{open_risks}} to any remaining risks or TODO follow-ups (or "none").
  - Set {{next_checks}} to recommended actions before merging/deploying (or "none").
</action>

<action>Display completion message:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Project Documentation Complete! ✓

**Location:** {{project_knowledge}}/

**Master Index:** {{project_knowledge}}/index.md
👆 This is your primary entry point for AI-assisted development

**Generated Documentation:**
{{generated_files_list}}

**Next Steps:**

1. Review the index.md to familiarize yourself with the documentation structure
2. When creating a brownfield PRD, point the PRD workflow to: {{project_knowledge}}/index.md
3. For UI-only features: Reference {{project_knowledge}}/architecture-{{ui_part_id}}.md
4. For API-only features: Reference {{project_knowledge}}/architecture-{{api_part_id}}.md
5. For full-stack features: Reference both part architectures + integration-architecture.md

**Verification Recap:**

- Tests/extractions executed: {{verification_summary}}
- Outstanding risks or follow-ups: {{open_risks}}
- Recommended next checks before PR: {{next_checks}}

**Brownfield PRD Command:**
When ready to plan new features, run the PRD workflow and provide this index as input.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
</action>

<action>FINALIZE state file:

- Add to completed_steps: {"step": "step_12", "status": "completed", "timestamp": "{{now}}", "summary": "Workflow complete"}
- Update timestamps.completed = "{{now}}"
- Update current_step = "completed"
- Write final state file
  </action>

<action>Display: "State file saved: {{project_knowledge}}/project-scan-report.json"</action>
<action>If `{workflow.on_complete}` is non-empty, follow it as the final terminal instruction before exiting.</action>

</workflow>
