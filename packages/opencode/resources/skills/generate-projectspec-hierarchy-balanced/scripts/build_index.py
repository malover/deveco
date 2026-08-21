#!/usr/bin/env python3
"""Deterministically render the balanced repository router and overview."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
from document_contract import extract_project_metadata, extract_summary, fallback_metadata, truncate_summary

START = "<!-- PROJECTSPEC:GENERATED:START -->"
END = "<!-- PROJECTSPEC:GENERATED:END -->"


def load(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path}: expected object")
    return value


def text(value: Any) -> str:
    return "" if value is None else str(value).replace("|", r"\|").replace("\n", " ").strip()


def link(label: str, target: Any) -> str:
    return f"[{label}]({str(target).replace(chr(92), '/')})" if isinstance(target, str) and target else "—"


def list_text(values: Any, limit: int = 4) -> str:
    if not isinstance(values, list) or not values:
        return "—"
    values = [text(item) for item in values if text(item)]
    shown = values[:limit]
    suffix = f" +{len(values) - limit}" if len(values) > limit else ""
    return ", ".join(f"`{item}`" for item in shown) + suffix


def planned(plan: dict[str, Any]) -> list[dict[str, Any]]:
    return [item for item in plan.get("documents", []) if isinstance(item, dict)]


def generated(existing: str, body: str) -> str:
    if START not in existing or END not in existing:
        return body
    before, rest = existing.split(START, 1)
    _, after = rest.split(END, 1)
    region = body.split(START, 1)[1].split(END, 1)[0]
    return f"{before}{START}{region}{END}{after}"


def first(*values: Any) -> Any:
    return next((value for value in values if value not in (None, "", [])), None)


def project_profiles(root: Path, plan: dict[str, Any], inventory: dict[str, Any], report: dict[str, Any]) -> dict[str, dict[str, Any]]:
    inventory_projects = {str(item.get("id")): item for item in inventory.get("projects", []) if isinstance(item, dict)}
    project_scopes = {str(item.get("id")): item for item in report.get("scopes", []) if isinstance(item, dict) and item.get("kind") == "project"}
    profiles = {}
    for project in plan.get("projects", []):
        identifier = str(project.get("id"))
        scope = project_scopes.get(identifier, {})
        completed = scope.get("facts", {}).get("project", {}) if isinstance(scope.get("facts"), dict) else {}
        discovery = scope.get("discovery", {}) if isinstance(scope.get("discovery"), dict) else {}
        deterministic = first(project.get("deterministicProfile"), inventory_projects.get(identifier, {}).get("deterministicProfile"), {})
        business = root / str(project.get("businessDocument", ""))
        architecture = root / str(project.get("architectureDocument", ""))
        parsed = extract_project_metadata(architecture.read_text(encoding="utf-8")) if architecture.is_file() else {}
        parsed = parsed or {}
        profile = {
            "summary": truncate_summary(str(first(completed.get("summary"), discovery.get("summary"), extract_summary(business, business.read_text(encoding="utf-8")) if business.is_file() else None, project.get("summary")) or "")),
            "projectType": first(completed.get("projectType"), discovery.get("projectType"), deterministic.get("structuralKind"), parsed.get("projectType"), project.get("kind")),
            "technologies": first(completed.get("technologies"), discovery.get("technologies"), deterministic.get("primaryTechnologies"), parsed.get("technologies"), project.get("technology")),
            "architecturePattern": first(completed.get("architecturePattern"), discovery.get("architecturePattern"), deterministic.get("architecturePattern"), parsed.get("architecturePattern"), project.get("architecturePattern")),
        }
        if fallback_metadata(str(profile["summary"] or "")) or fallback_metadata(str(profile["projectType"] or "")) or fallback_metadata(str(profile["architecturePattern"] or "")) or not profile["technologies"]:
            raise ValueError(f"Project {identifier} has incomplete verified metadata")
        profiles[identifier] = profile
    return profiles


def render(root: Path, plan: dict[str, Any], inventory: dict[str, Any], report: dict[str, Any], packets: dict[str, dict[str, Any]]) -> str:
    projects = [item for item in plan.get("projects", []) if isinstance(item, dict)]
    stats = inventory.get("stats", {})
    graph = report.get("homegraph", {}) if isinstance(report.get("homegraph"), dict) else {}
    profiles = project_profiles(root, plan, inventory, report)
    types = list(dict.fromkeys(profiles[str(project.get("id"))]["projectType"] for project in projects))
    repository_type = types[0] if len(types) == 1 else "mixed"
    technologies = list(dict.fromkeys(technology for project in projects for technology in profiles[str(project.get("id"))]["technologies"]))
    patterns = list(dict.fromkeys(profiles[str(project.get("id"))]["architecturePattern"] for project in projects))
    architecture_pattern = patterns[0] if len(patterns) == 1 else "; ".join(f"{project.get('name') or project.get('id')}: {profiles[str(project.get('id'))]['architecturePattern']}" for project in projects)
    cross_edges = [edge for edge in inventory.get("dependencies", []) if isinstance(edge, dict) and edge.get("consumer") != edge.get("provider")]
    relationship = " Cross-Project dependencies are recorded below." if cross_edges else ""
    overview = truncate_summary(" ".join(f"{project.get('name') or project.get('id')}: {profiles[str(project.get('id'))]['summary']}" for project in projects) + relationship, 600)
    if graph.get("readiness") not in {"ready", "reduced-confidence"}:
        raise ValueError("HomeGraph readiness is incomplete")
    lines = [START, "# Documentation Index", "", f"> Baseline: `{text(plan.get('selectedRevision', inventory.get('selectedRevision', 'unknown')))}` · Scan: `{text(plan.get('scanLevel', 'deep'))}` · HomeGraph: `{text(graph.get('readiness'))}`", "", "## Repository Overview", "", text(overview), "", f"**Repository type:** `{text(repository_type)}` · **Projects:** {len(projects)} · **Modules:** {stats.get('moduleCount', sum(len(item.get('modules', [])) for item in projects))} · **Technologies:** {list_text(technologies, 5)} · **Architecture pattern:** {text(architecture_pattern)}", ""]
    root_governance = next((item.get("path") for item in planned(plan) if item.get("kind") == "constraints-and-limitations" and item.get("scope") == "workspace"), None)
    if root_governance:
        lines.extend(["## Repository Governance", "", link("Cross-Project constraints and limitations", root_governance), ""])
    lines.extend(["## Projects", "", "| Project | Type / technology | Summary | Business | Architecture | Constraints |", "|---|---|---|---|---|---|"])
    for project in projects:
        profile = profiles[str(project.get("id"))]
        lines.append(f"| {text(project.get('name') or project.get('id'))} | `{text(profile['projectType'])}` / {list_text(profile['technologies'], 3)} | {text(profile['summary'])} | {link('Business', project.get('businessDocument'))} | {link('Architecture', project.get('architectureDocument'))} | {link('Constraints', project.get('governanceDocument'))} |")
    lines.extend(["", "## Modules", "", "| Project / module path | Role | Responsibility | Key entry surfaces | Architecture | Business / grouped |", "|---|---|---|---|---|---|"])
    for project in projects:
        for module in project.get("modules", []):
            packet = packets.get(str(module.get("id")), {})
            business = module.get("businessOwnerDocument") or (project.get("businessDocument") if module.get("businessDetail") == "project-grouped" else None)
            lines.append(f"| `{text(module.get('path'))}` | `{text(packet.get('businessRole') or module.get('businessRole') or 'pending')}` | {text(packet.get('responsibility') or module.get('responsibility') or 'See module Architecture')} | {list_text(packet.get('entrySurfaces') or module.get('entrySurfaces'))} | {link('Architecture', module.get('architectureDocument'))} | {link('Business / grouped', business)} |")
    edges = cross_edges
    if edges:
        lines.extend(["", "## Cross-Project Relationships", "", "| Consumer | Provider | Contract / evidence |", "|---|---|---|"])
        lines.extend(f"| `{text(edge.get('consumerModule') or edge.get('consumer'))}` | `{text(edge.get('providerModule') or edge.get('provider'))}` | `{text(edge.get('contract') or edge.get('evidence'))}` |" for edge in edges)
    lines.extend(["", "## Start here / how to use this documentation for feature work", "", "Start with Project Business for the observable journey, then open the relevant module Architecture for ownership, the scope matrix, contracts, extension seams, and blast radius. Follow linked ARC/LIM entries and inspect their cited evidence before changing code.", END, ""])
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("docs_root", type=Path)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--inventory", type=Path, required=True)
    parser.add_argument("--scan-report", "--intelligence", dest="scan_report", type=Path)
    parser.add_argument("--packet", type=Path, action="append")
    args = parser.parse_args()
    try:
        root = args.docs_root.resolve()
        plan = load(args.plan.resolve())
        inventory = load(args.inventory.resolve())
        report = load(args.scan_report.resolve()) if args.scan_report and args.scan_report.is_file() else {}
        report["docsRoot"] = str(root)
        packets: dict[str, dict[str, Any]] = {}
        for project in plan.get("projects", []):
            for module in project.get("modules", []):
                document = root / str(module.get("architectureDocument", ""))
                if document.is_file():
                    packets[str(module.get("id"))] = {
                        "responsibility": extract_summary(document, document.read_text(encoding="utf-8")),
                        "entrySurfaces": module.get("entrySurfaces", []),
                        "businessRole": module.get("businessRole", "pending"),
                    }
        destination = root / str(plan.get("indexDocument") or "index.md")
        destination.parent.mkdir(parents=True, exist_ok=True)
        current = destination.read_text(encoding="utf-8") if destination.is_file() else ""
        destination.write_text(generated(current, render(root, plan, inventory, report, packets)), encoding="utf-8")
        print(destination)
        return 0
    except ValueError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
