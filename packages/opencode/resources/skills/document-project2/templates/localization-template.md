# Localization — {{part_id}}

**Generated:** {{date}}
**Scan Level:** {{scan_level}}
**Languages Supported:** {{locale_count}}

{{#if multi-part}}**Part:** {{part_id}}{{/if}}

## Overview

{{i18n_overview}}

## Supported Languages

| Locale Code | Language | Coverage |
|-------------|----------|----------|
{{#each supported_locales}}
| `{{locale_code}}` | {{language_name}} | {{coverage_notes}} |
{{/each}}

**Default / fallback locale:** `{{default_locale}}`

## Resource File Structure

```
{{resource_tree}}
```

### Resource Types

{{#each resource_types}}
#### {{type_name}}

**Format:** {{file_format}}
**Location pattern:** `{{location_pattern}}`

{{#if example}}
```{{file_format_lang}}
{{example}}
```
{{/if}}
{{/each}}

## String Resource Injection Patterns

{{#each injection_patterns}}
### {{pattern_name}}

**Pattern:** `{{pattern_syntax}}`
**Files using this:** {{file_count}}

{{#if example_code}}
```{{code_lang}}
{{example_code}}
```
{{/if}}
{{/each}}

### Parameterized / Format Strings

{{#if has_format_strings}}
| Pattern | Usage | Example Key |
|---------|-------|-------------|
{{#each format_strings}}
| `{{pattern}}` | {{usage}} | `{{example_key}}` |
{{/each}}
{{else}}
No format string interpolation used in localized strings.
{{/if}}

## Locale Switching Mechanism

{{locale_switching_description}}

**Fallback chain:** {{fallback_chain}}

{{#if has_runtime_switching}}
**Runtime locale switching:** {{runtime_switch_method}}
{{/if}}

## Key String Catalog ({{default_locale}})

{{#each modules}}
### {{module_name}} — `{{module_path}}`

{{#if string_table}}
| Key | Value ({{../default_locale}}) |
|-----|-------------------------------|
{{#each string_table}}
| `{{key}}` | {{value}} |
{{/each}}
{{else}}
_No string resources in this module._
{{/if}}

{{#if has_strarray}}
**String Arrays:**
{{#each strarray}}
- `{{array_name}}`: {{item_count}} items
{{/each}}
{{/if}}
{{/each}}

## Resource Statistics

| Module | String Keys | Float Keys | Color Keys | Locales |
|--------|------------|------------|------------|---------|
{{#each stats}}
| {{module}} | {{strings}} | {{floats}} | {{colors}} | {{locales}} |
{{/each}}

**Totals:** {{total_strings}} string keys, {{total_floats}} float keys, {{total_colors}} color keys

## Adding a New Locale

{{add_locale_instructions}}

## Fallback & Missing Translation Handling

{{#if missing_translation_info}}
{{missing_translation_info}}
{{else}}
The `base/` directory provides the default English strings. If a locale directory is missing for a specific module, ArkTS falls back to `base/`. If a specific key is missing from a locale's `string.json`, the key from `base/` is used automatically.
{{/if}}
