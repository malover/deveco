#!/usr/bin/env python3
"""Deterministically render the balanced repository router and overview."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
from validate_packet import load as load_packet
from validate_packet import validate_packet

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


def render(plan: dict[str, Any], inventory: dict[str, Any], report: dict[str, Any], packets: dict[str, dict[str, Any]]) -> str:
    projects = [item for item in plan.get("projects", []) if isinstance(item, dict)]
    stats = inventory.get("stats", {})
    graph = report.get("homegraph", {}) if isinstance(report.get("homegraph"), dict) else {}
    overview = report.get("repositoryOverview") or "Repository overview retained from the LLM-primary and CSV-baseline scan; consult Project documents for evidence-backed detail."
    lines = [START, "# Documentation Index", "", f"> Baseline: `{text(plan.get('selectedRevision', inventory.get('selectedRevision', 'unknown')))}` · Scan: `{text(plan.get('scanLevel', 'deep'))}` · HomeGraph: `{text(graph.get('readiness', 'pending'))}`", "", "## Repository Overview", "", text(overview), "", f"**Repository type:** `{text(report.get('repositoryType', 'mixed or unclassified'))}` · **Projects:** {len(projects)} · **Modules:** {stats.get('moduleCount', sum(len(item.get('modules', [])) for item in projects))} · **Technologies:** {list_text(report.get('technologies'), 5)} · **Architecture pattern:** {text(report.get('architecturePattern', 'evidence pending'))}", ""]
    root_governance = next((item.get("path") for item in planned(plan) if item.get("kind") == "constraints-and-limitations" and item.get("scope") == "workspace"), None)
    if root_governance:
        lines.extend(["## Repository Governance", "", link("Cross-Project constraints and limitations", root_governance), ""])
    lines.extend(["## Projects", "", "| Project | Type / technology | Summary | Business | Architecture | Constraints |", "|---|---|---|---|---|---|"])
    for project in projects:
        lines.append(f"| {text(project.get('name') or project.get('id'))} | `{text(project.get('kind'))}` / {list_text(project.get('technology'), 3)} | {text(project.get('summary') or 'See Project Business')} | {link('Business', project.get('businessDocument'))} | {link('Architecture', project.get('architectureDocument'))} | {link('Constraints', project.get('governanceDocument'))} |")
    lines.extend(["", "## Modules", "", "| Project / module path | Role | Responsibility | Key entry surfaces | Architecture | Business / grouped |", "|---|---|---|---|---|---|"])
    for project in projects:
        for module in project.get("modules", []):
            packet = packets.get(str(module.get("id")), {})
            business = module.get("businessOwnerDocument") or (project.get("businessDocument") if module.get("businessDetail") == "project-grouped" else None)
            lines.append(f"| `{text(module.get('path'))}` | `{text(packet.get('businessRole') or module.get('businessRole') or 'pending')}` | {text(packet.get('responsibility') or module.get('responsibility') or 'See module Architecture')} | {list_text(packet.get('entrySurfaces') or module.get('entrySurfaces'))} | {link('Architecture', module.get('architectureDocument'))} | {link('Business / grouped', business)} |")
    edges = inventory.get("dependencies", [])
    if edges:
        lines.extend(["", "## Cross-Project Relationships", "", "| Consumer | Provider | Contract / evidence |", "|---|---|---|"])
        lines.extend(f"| `{text(edge.get('consumerModule') or edge.get('consumer'))}` | `{text(edge.get('providerModule') or edge.get('provider'))}` | `{text(edge.get('contract') or edge.get('evidence'))}` |" for edge in edges if isinstance(edge, dict))
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
        packet_paths = args.packet or sorted((root / ".projectspec" / "analysis").glob("*.json"))
        if not packet_paths:
            raise ValueError("no validated analysis packets found under .projectspec/analysis; document writing cannot consume an empty packet set")
        packets: dict[str, dict[str, Any]] = {}
        for packet_path in packet_paths:
            packet = load_packet(packet_path.resolve())
            errors = validate_packet(packet, plan)
            if errors:
                raise ValueError("\n".join(errors))
            for module in packet.get("modules", [packet]):
                if isinstance(module, dict) and isinstance(module.get("moduleId"), str):
                    packets[module["moduleId"]] = module
        expected = {str(module.get("id")) for project in plan.get("projects", []) if isinstance(project, dict) for module in project.get("modules", []) if isinstance(module, dict)}
        if expected - set(packets):
            raise ValueError(f"missing validated packets for modules: {', '.join(sorted(expected - set(packets))) }")
        destination = root / str(plan.get("indexDocument") or "index.md")
        destination.parent.mkdir(parents=True, exist_ok=True)
        current = destination.read_text(encoding="utf-8") if destination.is_file() else ""
        destination.write_text(generated(current, render(plan, inventory, report, packets)), encoding="utf-8")
        print(destination)
        return 0
    except ValueError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
