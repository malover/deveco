#!/usr/bin/env python3
"""Render deterministic ProjectSpec scaffolding from validated evidence packets."""
from __future__ import annotations

import argparse
import json
import posixpath
import sys
from pathlib import Path
from typing import Any

from validate_packet import load, validate_packet

START = "<!-- PROJECTSPEC:GENERATED:START -->"
END = "<!-- PROJECTSPEC:GENERATED:END -->"


def safe(value: Any, fallback: str = "Evidence pending") -> str:
    if value is None:
        return fallback
    return str(value).replace("|", r"\|").replace("\n", " ").strip() or fallback


def link(document: str, target: str | None, label: str) -> str:
    if not target:
        return "—"
    relative = posixpath.relpath(target.replace("\\", "/"), posixpath.dirname(document) or ".")
    return f"[{label}]({relative})"


def evidence(packet: dict[str, Any], fallback: str) -> list[dict[str, Any]]:
    values = packet.get("evidence", [])
    if isinstance(values, list) and values:
        return [item for item in values if isinstance(item, dict) and item.get("anchor")]
    return [{"claim": "Packet boundary", "status": "unavailable", "anchor": fallback, "scope": "module"}]


def evidence_lines(packet: dict[str, Any], fallback: str) -> list[str]:
    return [f"- `{safe(item.get('anchor'), fallback)}` — {safe(item.get('claim'))} ({safe(item.get('status'))})" for item in evidence(packet, fallback)]


def list_text(values: Any) -> str:
    if not isinstance(values, list) or not values:
        return "Evidence pending"
    return ", ".join(f"`{safe(value)}`" for value in values[:8])


def generated(existing: str, body: str, replace: bool) -> str:
    if not replace and START in existing and END in existing:
        return existing
    if START not in existing or END not in existing:
        return body
    before, rest = existing.split(START, 1)
    _, after = rest.split(END, 1)
    region = body.split(START, 1)[1].split(END, 1)[0]
    return f"{before}{START}{region}{END}{after}"


def packet_map(packets: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for packet in packets:
        for module in packet.get("modules", [packet]):
            if isinstance(module, dict) and isinstance(module.get("moduleId"), str):
                result[module["moduleId"]] = module
    return result


def merged_module(module: dict[str, Any], packets: dict[str, dict[str, Any]]) -> dict[str, Any]:
    packet = packets.get(str(module.get("id")), {})
    return {**module, **packet}


def project_packet(project: dict[str, Any], modules: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "responsibility": "; ".join(safe(module.get("responsibility")) for module in modules) or "Project boundary retained from the structural plan",
        "flows": [flow for module in modules for flow in module.get("flows", []) if isinstance(flow, (str, dict))],
        "evidence": [item for module in modules for item in evidence(module, safe(module.get("path"), project.get("path", ".")))],
    }


def flow_lines(flows: Any) -> list[str]:
    if not isinstance(flows, list) or not flows:
        return ["No representative flow was recorded in the validated packet."]
    lines: list[str] = []
    for index, flow in enumerate(flows[:8], 1):
        if isinstance(flow, dict):
            name = safe(flow.get("name") or flow.get("id"), f"representative flow {index}")
            trigger = safe(flow.get("trigger") or flow.get("precondition"))
            outcome = safe(flow.get("outcome") or flow.get("terminalOutcome"))
            lines.extend([f"### FLOW-{index} — {name}", "", f"- **Trigger / preconditions:** {trigger}", f"- **Main path:** {safe(flow.get('path') or flow.get('steps'))}", f"- **Terminal outcome:** {outcome}", f"- **Alternates / failures / recovery:** {safe(flow.get('alternate') or flow.get('recovery'), 'None recorded')}", ""])
        else:
            lines.extend([f"### FLOW-{index} — {safe(flow)}", "", "- **Trigger / preconditions:** Evidence recorded in packet", "- **Main path:** Evidence-backed flow retained by the packet", "- **Terminal outcome:** See cited evidence", "- **Alternates / failures / recovery:** None recorded", ""])
    return lines


def render_index(document: str, plan: dict[str, Any], inventory: dict[str, Any], report: dict[str, Any]) -> str:
    lines = [START, "# Documentation Index", "", f"> Baseline: `{safe(plan.get('selectedRevision'), 'unknown')}` · Scan: `{safe(plan.get('scanLevel'), 'deep')}` · HomeGraph: `{safe(report.get('homegraph', {}).get('readiness') if isinstance(report.get('homegraph'), dict) else None, 'pending')}`", "", "## Repository Overview", "", safe(report.get("repositoryOverview"), "Repository overview is synthesized from the validated plan and compact evidence packets."), "", "## Projects", "", "| Project | Type / technology | Summary | Business | Architecture | Constraints |", "|---|---|---|---|---|---|"]
    for project in plan.get("projects", []):
        if not isinstance(project, dict):
            continue
        lines.append(f"| {safe(project.get('name') or project.get('id'))} | `{safe(project.get('kind'))}` | {safe(project.get('responsibility'), 'See Project Business')} | {link(document, project.get('businessDocument'), 'Business')} | {link(document, project.get('architectureDocument'), 'Architecture')} | {link(document, project.get('governanceDocument'), 'Constraints')} |")
    lines.extend(["", "## Modules", "", "| Project / module path | Role | Responsibility | Key entry surfaces | Architecture | Business / grouped |", "|---|---|---|---|---|---|"])
    for project in plan.get("projects", []):
        if not isinstance(project, dict):
            continue
        for module in project.get("modules", []):
            if not isinstance(module, dict):
                continue
            business = module.get("businessOwnerDocument") or (project.get("businessDocument") if module.get("businessDetail") == "project-grouped" else None)
            lines.append(f"| `{safe(module.get('path'))}` | `{safe(module.get('businessRole'))}` | {safe(module.get('responsibility'))} | {list_text(module.get('entrySurfaces'))} | {link(document, module.get('architectureDocument'), 'Architecture')} | {link(document, business, 'Business / grouped')} |")
    edges = inventory.get("dependencies", [])
    if edges:
        lines.extend(["", "## Cross-Project Relationships", "", "| Consumer | Provider | Contract / evidence |", "|---|---|---|"])
        lines.extend(f"| `{safe(edge.get('consumerModule') or edge.get('consumer'))}` | `{safe(edge.get('providerModule') or edge.get('provider'))}` | `{safe(edge.get('contract') or edge.get('evidence'))}` |" for edge in edges if isinstance(edge, dict))
    lines.extend(["", "## Start here / how to use this documentation for feature work", "", "Start with Project Business for the observable journey, then open module Architecture for ownership, contracts, evidence, extension seams, and blast radius. Follow linked ARC/LIM entries before changing code.", END, ""])
    return "\n".join(lines)


def render_project_business(document: str, project: dict[str, Any], modules: list[dict[str, Any]], plan: dict[str, Any]) -> str:
    packet = project_packet(project, modules)
    lines = [START, f"# Project Business — {safe(project.get('name') or project.get('id'))}", "", f"> Scope: `{safe(project.get('path'))}` · Baseline: `{safe(plan.get('selectedRevision'), 'unknown')}`", "", "## Purpose and Observable Boundary", "", safe(packet.get("responsibility")), "", "## Actors and Main Journeys", ""]
    lines.extend(flow_lines(packet.get("flows")))
    lines.extend(["## Module Contributions", "", "\n".join(f"- `{safe(module.get('path'))}` — {safe(module.get('responsibility'))}" for module in modules) or "No module contribution was recorded.", "", "## Business Concepts and Data", "", "Evidence-backed concepts and visible data effects are retained in the module packets.", "", "## Rules, States, Failures, and Outcomes", "", "| Rule / state | Given | When | Then / observable outcome | Evidence status |", "|---|---|---|---|---|", "| RULE-packet | Packet evidence is available | The documented journey executes | The recorded terminal outcome is observed or explicitly unavailable | packet |", "", "## Architecture and Governance Traceability", "", "See the linked Project and module Architecture documents and the Project governance registry.", "", "## Source Evidence", "", *evidence_lines(packet, safe(project.get('path'), '.')), END, ""])
    return "\n".join(lines)


def render_project_architecture(document: str, project: dict[str, Any], modules: list[dict[str, Any]], plan: dict[str, Any]) -> str:
    lines = [START, f"# Project Architecture — {safe(project.get('name') or project.get('id'))}", "", f"> Scope: `{safe(project.get('path'))}` · Baseline: `{safe(plan.get('selectedRevision'), 'unknown')}` · Governance: {link(document, project.get('governanceDocument'), 'Constraints')}", "", "## Project Boundary and Architecture", "", "The project boundary is derived from descriptors, owned modules, and validated evidence packets.", "", "## Physical Modules and Ownership Map", "", "| Module / build unit | Responsibility | Entry/lifecycle surfaces | Architecture |", "|---|---|---|---|---|"]
    lines.extend(f"| `{safe(module.get('path'))}` | {safe(module.get('responsibility'))} | {list_text(module.get('entrySurfaces'))} | {link(document, module.get('architectureDocument'), 'Architecture')} |" for module in modules)
    lines.extend(["", "## Module Responsibilities and Dependency Direction", "", "Dependencies are normalized as consumer-to-provider edges in the inventory and module packets.", "", "## Cross-Module Runtime and Data Flows", "", "Representative trigger, orchestration, state/data, integration, persistence, and outcome details remain in the module packets.", "", "## Scope Matrix", "", "| Dimension | Owning scope | Boundary / source of truth | Change implication |", "|---|---|---|---|---|", f"| Ownership | `{safe(project.get('path'))}` | Owned descriptors and modules | Boundary changes affect all Project documents |", "| Runtime/lifecycle | Project and entry modules | Validated entry surfaces | Recheck consumers when lifecycle contracts change |", "| State/data | Evidence-backed module owner | Packet state/data claims | Recheck persistence and invalidation paths |", "| Public/dependency contract | Module boundaries | Normalized dependency edges | Recheck providers and consumers |", "", "## Extension and Modification Points", "", "Use the owning module Architecture and its ARC/LIM registry entries to select the smallest safe change surface.", "", "## Source Evidence", ""])
    lines.extend(evidence_lines(project_packet(project, modules), safe(project.get("path"), ".")))
    lines.extend([END, ""])
    return "\n".join(lines)


def render_module_business(document: str, project: dict[str, Any], module: dict[str, Any], plan: dict[str, Any]) -> str:
    lines = [START, f"# Module Business — {safe(module.get('name') or module.get('moduleId'))}", "", f"> Module ID: `{safe(module.get('moduleId') or module.get('id'))}` · Business role: `{safe(module.get('businessRole'))}`", "", "## Role in the Product", "", safe(module.get("responsibility")), "", "## User / Domain Flows", ""]
    lines.extend(flow_lines(module.get("flows")))
    lines.extend(["## Business Concepts and Data", "", "The packet retains only evidence-backed concepts and persistence-visible effects.", "", "## Rules, States, and Outcomes", "", "No additional standalone rule was recorded outside the representative flows.", "", "## Architecture and Governance Traceability", "", f"See {link(document, module.get('architectureDocument'), 'module Architecture')} and the Project governance registry.", "", "## Source Evidence", "", *evidence_lines(module, safe(module.get('path'), project.get('path', '.'))), END, ""])
    return "\n".join(lines)


def render_module_architecture(document: str, project: dict[str, Any], module: dict[str, Any], plan: dict[str, Any], packet: dict[str, Any]) -> str:
    anchor = safe(module.get("path"), ".")
    lines = [START, f"# Module Architecture — {safe(module.get('name') or module.get('id'))}", "", f"> Module ID: `{safe(module.get('id'))}` · Physical path: `{anchor}` · Project: `{safe(project.get('name') or project.get('id'))}`", f"> Governance: {link(document, project.get('governanceDocument'), 'Constraints and Limitations')}", "", "## Purpose and Responsibilities", "", safe(packet.get("responsibility"), safe(module.get("responsibility"))), "", "## Entry, Lifecycle, and Public Contracts", "", f"Entry surfaces: {list_text(packet.get('entrySurfaces') or module.get('entrySurfaces'))}", "", "## Architecture and Dependencies", "", f"Dependencies: {list_text([edge.get('providerModule') or edge.get('provider') for edge in packet.get('dependencies', []) if isinstance(edge, dict)])}", "", "## Runtime and Data Flow", ""]
    lines.extend(flow_lines(packet.get("flows")))
    lines.extend(["## Scope Matrix", "", "| Dimension | Owning scope | Boundary / source of truth | Change implication |", "|---|---|---|---|---|", f"| Ownership | `{anchor}` | {safe(packet.get('responsibility'))} | Changes affect this module and its consumers |", "| Runtime/lifecycle | Module entry and public surfaces | Validated packet | Recheck lifecycle consumers |", f"| State/data | `{anchor}` | {safe(packet.get('scopeMatrix', {}).get('stateData') if isinstance(packet.get('scopeMatrix'), dict) else None)} | Recheck mutation and persistence effects |", "| Public/dependency contract | Module boundary | Normalized dependency evidence | Recheck provider/consumer compatibility |", "", "## State and Data Ownership", "", safe(packet.get("stateDataOwners"), "No additional state/data ownership claim was recorded."), "", "## Extension and Modification Points", "", "Use the existing entry, dependency, and state/data owner seams; inspect coupled artifacts and consumers before changing the module.", "", "## Selective Technical Relationships", "", "No diagram was emitted because the packet did not record a verified architectural question and relationship set.", "", "## Source Evidence", "", *evidence_lines(packet, anchor), END, ""])
    return "\n".join(lines)


def render_governance(document: str, project: dict[str, Any], modules: list[dict[str, Any]], plan: dict[str, Any]) -> str:
    candidates = [candidate for module in modules for candidate in module.get("arcLimCandidates", []) if isinstance(candidate, dict)]
    candidate = candidates[0] if candidates else {}
    identifier = safe(candidate.get("id"), f"LIM-{safe(project.get('outputSlug') or project.get('name') or project.get('id'), 'project')}-coverage").replace(" ", "-")
    if not identifier.startswith(("ARC-", "LIM-")):
        identifier = f"LIM-{identifier}"
    is_arc = identifier.startswith("ARC-")
    lines = [START, f"# Constraints and Limitations — {safe(project.get('name') or project.get('id'))}", "", f"> Scope: `{safe(project.get('path'))}` · Baseline: `{safe(plan.get('selectedRevision'), 'unknown')}`", "", "## Architecture Constraints and Limitations", f"", f"### {identifier} — {safe(candidate.get('title'), 'Validated evidence coverage')}", "", f"- **Scope:** `project:{safe(project.get('id'))}`"]
    if is_arc:
        lines.extend([f"- **Constraint / invariant:** {safe(candidate.get('constraint') or candidate.get('claim'))}", "- **Basis:** `Observed pattern`"])
    else:
        lines.extend([f"- **Category:** `evidence gap`", f"- **Limitation / evidence gap:** {safe(candidate.get('limitation') or candidate.get('claim'), 'Some architectural facts remain dependent on packet evidence.')}"])
    lines.extend(["- **Implementation impact / blast radius:** Recheck affected Project modules and consumers before changing the boundary.", f"- **Evidence:** `{safe(candidate.get('anchor'), safe(project.get('path'), '.'))}`"])
    if not is_arc:
        lines.append("- **Current handling / unknown:** The packet records the current evidence boundary; unresolved detail requires a targeted follow-up query.")
    lines.extend(["- **How to work with it:** Treat the cited packet and module Architecture as the source of truth for this boundary.", "- **When it applies:** Any change to ownership, lifecycle, state/data, or dependency contracts.", "- **What to check:**", "  1. Inspect the cited owner and contract evidence.", "  2. Verify affected consumers, state/data behavior, and tests.", END, ""])
    return "\n".join(lines)


def render_document(document: str, item: dict[str, Any], plan: dict[str, Any], inventory: dict[str, Any], packets: dict[str, dict[str, Any]], report: dict[str, Any]) -> str:
    projects = [project for project in plan.get("projects", []) if isinstance(project, dict)]
    project = next((project for project in projects if document in {project.get("businessDocument"), project.get("architectureDocument"), project.get("governanceDocument")} or any(document == module.get("architectureDocument") or document == module.get("businessOwnerDocument") for module in project.get("modules", []))), {})
    modules = [module for module in project.get("modules", []) if isinstance(module, dict)]
    if item.get("kind") == "index":
        return render_index(document, plan, inventory, report)
    if item.get("kind") == "project-business":
        return render_project_business(document, project, [merged_module(module, packets) for module in modules], plan)
    if item.get("kind") == "project-architecture":
        return render_project_architecture(document, project, [merged_module(module, packets) for module in modules], plan)
    if item.get("kind") == "constraints-and-limitations":
        if not project:
            project = {"id": "workspace", "name": "Workspace", "path": ".", "governanceDocument": document}
        return render_governance(document, project, [merged_module(module, packets) for module in modules], plan)
    module = next((module for module in modules if document in {module.get("architectureDocument"), module.get("businessOwnerDocument")}), {})
    packet = merged_module(module, packets)
    if item.get("kind") == "module-architecture":
        return render_module_architecture(document, project, module, plan, packet)
    if item.get("kind") == "module-business":
        return render_module_business(document, project, packet, plan)
    return render_index(document, plan, inventory, report)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("docs_root", type=Path)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--inventory", type=Path, required=True)
    parser.add_argument("--scan-report", type=Path)
    parser.add_argument("--packet", type=Path, action="append")
    parser.add_argument("--replace-generated", action="store_true")
    args = parser.parse_args()
    root = args.docs_root.resolve()
    try:
        plan = load(args.plan.resolve())
        inventory = load(args.inventory.resolve())
        report = load(args.scan_report.resolve()) if args.scan_report and args.scan_report.is_file() else {}
        packet_paths = args.packet or sorted((root / ".projectspec" / "analysis").glob("*.json"))
        packets = [load(path.resolve()) for path in packet_paths]
        errors = [error for packet in packets for error in validate_packet(packet, plan)]
        if errors:
            raise ValueError("\n".join(errors))
        expected = {str(module.get("id")) for project in plan.get("projects", []) if isinstance(project, dict) for module in project.get("modules", []) if isinstance(module, dict)}
        actual = {str(module.get("moduleId")) for packet in packets for module in packet.get("modules", [packet]) if isinstance(module, dict) and module.get("moduleId")}
        if expected - actual:
            raise ValueError(f"missing validated packets for modules: {', '.join(sorted(expected - actual))}")
    except ValueError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    packet_lookup = packet_map(packets)
    for item in plan.get("documents", []):
        if not isinstance(item, dict) or not isinstance(item.get("path"), str):
            continue
        destination = root / item["path"]
        destination.parent.mkdir(parents=True, exist_ok=True)
        existing = destination.read_text(encoding="utf-8") if destination.is_file() else ""
        destination.write_text(generated(existing, render_document(item["path"], item, plan, inventory, packet_lookup, report), args.replace_generated), encoding="utf-8")
    print(f"Rendered {len([item for item in plan.get('documents', []) if isinstance(item, dict)])} ProjectSpec documents under {root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
