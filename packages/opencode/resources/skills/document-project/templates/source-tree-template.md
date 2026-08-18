# {{project_name}} - Source Tree Analysis

**Date:** {{date}}

## Overview

{{source_tree_overview}}

{{#if is_multi_part}}

## Multi-Part Structure

This project is organized into {{parts_count}} distinct parts:

{{#each project_parts}}

- **{{part_name}}** (`{{root_path}}`): {{purpose}}
  {{/each}}
  {{/if}}

## Complete Directory Structure

```
{{complete_source_tree}}
```

## Critical Directories

{{#each critical_folders}}

### `{{folder_path}}`

{{description}}

**Purpose:** {{purpose}}
**Contains:** {{contents_summary}}
{{#if entry_points}}**Entry Points:** {{entry_points}}{{/if}}
{{#if integration_note}}**Integration:** {{integration_note}}{{/if}}

{{/each}}

{{#if is_multi_part}}

## Part-Specific Trees

{{#each project_parts}}

### {{part_name}} Structure

```
{{source_tree}}
```

**Key Directories:**
{{#each critical_directories}}

- **`{{path}}`**: {{description}}
  {{/each}}

{{/each}}

## Integration Points

{{#each integration_points}}

### {{from_part}} → {{to_part}}

- **Location:** `{{integration_path}}`
- **Type:** {{integration_type}}
- **Details:** {{details}}
  {{/each}}

{{/if}}

{{#if has_internal_modules}}

## Internal Module Boundaries

{{#each internal_modules}}

### {{module_name}}

- **Location:** `{{root_path}}`
- **Purpose:** {{purpose}}
- **Owning Part:** {{owning_part_name}}
- **Dependencies:** {{dependencies}}

{{/each}}

{{/if}}

## Entry Points

{{#if is_single_part}}

- **Main Entry:** `{{main_entry_point}}`
  {{#if additional_entry_points}}
- **Additional:**
  {{#each additional_entry_points}}
  - `{{path}}`: {{description}}
    {{/each}}
    {{/if}}
    {{else}}
    {{#each project_parts}}

### {{part_name}}

- **Entry Point:** `{{entry_point}}`
- **Bootstrap:** {{bootstrap_description}}
  {{/each}}
  {{/if}}

## File Organization Patterns

{{file_organization_patterns}}

## Key File Types

{{#each file_type_patterns}}

### {{file_type}}

- **Pattern:** `{{pattern}}`
- **Purpose:** {{purpose}}
- **Examples:** {{examples}}
  {{/each}}

## Asset Locations

{{#if has_assets}}
{{#each asset_locations}}

- **{{asset_type}}**: `{{location}}` ({{file_count}} files, {{total_size}})
  {{/each}}
  {{else}}
  No significant assets detected.
  {{/if}}

## Icon Assets Inventory

{{#if has_icon_assets}}
A complete mapping of all `$r('app.media.XXX')` (or equivalent) image references to their actual files. Icons are copied to `{project_knowledge}/images/` for wireframe embedding.

| Resource Name | File | Used In |
|---------------|------|---------|
{{#each icon_assets}}
| `{{resource_ref}}` | `{{filename}}` | {{used_in}} |
{{/each}}

**Total**: {{icon_count}} icon assets.
{{else}}
No icon/image assets detected in project resources.
{{/if}}

## Configuration Files

{{#each config_files}}

- **`{{path}}`**: {{description}}
  {{/each}}

## Notes for Development

{{development_notes}}

---

_Generated using BMAD Method `document-project` workflow_
