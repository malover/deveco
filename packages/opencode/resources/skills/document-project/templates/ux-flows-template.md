# UX Flows — {{project_name}}

> {{#if multi-part}}**Part**: {{part_id}} | {{/if}}**Generated**: {{generation_date}} | **Scan Level**: {{scan_level}}
>
> For detailed widget hierarchy per screen, see **[UX Screen Trees](./ux-screen-trees{{#if multi-part}}-{{part_id}}{{/if}}.md)** — a static Component Tree generated from {{ui_framework}} `build()` analysis.
> For visual wireframes, see **[UX Wireframes](./ux-screen-wireframes.html)** — interactive HTML with all ViewStates.
> For an interactive click-through mockup, see **[UX Interactive Mockup](./ux-interactive-mockup.html)** — click the phone to follow the flow.

## Overview

{{project_short_description}}

---

## 1. Primary User Flow: {{primary_flow_name}}

```
# ASCII art state-transition diagram showing the main user journey
# Include: all ViewState transitions, triggers (gestures/callbacks), success/failure branches
```

### Key Interactions

| Step | Component | Gesture | Result |
|------|-----------|---------|--------|
{{#each primary_flow_interactions}}
| {{step}} | `{{component}}` | {{gesture}} | {{result}} |
{{/each}}

---

{{#each secondary_flows}}
## {{flow_index}}. {{flow_name}}

```
# ASCII art or mermaid diagram for this flow
```

### {{subsection}}
{{description}}

### Offline behavior
{{offline_description}}
{{/each}}

---

## {{error_flow_index}}. Error Flow

```
# Error state-transition diagram
```

### Error sources
{{#each error_sources}}
- {{description}}
{{/each}}

---

## {{offline_flow_index}}. Offline Flow

```
# Offline data flow diagram
```

{{offline_notes}}

---

## {{nav_section_index}}. Navigation Model

```
# ASCII art state machine showing all ViewStates and allowed transitions
# Include: back-press paths, tab switching, modal dismiss
```

{{#each navigation_notes}}
> {{note}}
{{/each}}

## ViewState Enum

| Value | Description | Visible UI |
|-------|-------------|------------|
{{#each view_state_entries}}
| `{{name}}` | {{description}} | {{visible_ui}} |
{{/each}}

## Component Interaction Map

| Action | Source Component | ViewModel Method | State Change |
|--------|-----------------|-----------------|-------------|
{{#each component_interactions}}
| {{action}} | `{{component}}` | `{{method}}` | {{state_change}} |
{{/each}}

## Conditional Rendering

| ViewState | Components Rendered | Hidden Components |
|-----------|--------------------|--------------------|
{{#each conditional_rendering}}
| `{{view_state}}` | {{rendered}} | {{hidden}} |
{{/each}}

## Back-Press Handling

| Current ViewState | onBackPress() → | Notes |
|------------------|-----------------|-------|
{{#each back_press_handling}}
| `{{from}}` | `{{to}}` | {{notes}} |
{{/each}}

## State Transitions Summary

| From | To | Trigger | Data Flow |
|------|-----|---------|-----------|
{{#each state_transitions}}
| `{{from}}` | `{{to}}` | {{trigger}} | {{data_flow}} |
{{/each}}

---

*Documented by BMAD document-project — exhaustive scan*
