#!/usr/bin/env python3
"""Build docs/index.md from ProjectSpec semantic metadata.

The index is intentionally deterministic: it reuses repository intelligence, Project analysis
packets, and the documentation plan instead of asking an LLM to rediscover navigation facts.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

START = "<!-- PROJECTSPEC:GENERATED:START -->"
END = "<!-- PROJECTSPEC:GENERATED:END -->"


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError(f"{path}: expected a JSON object")
    return value


def esc(value: Any) -> str:
    text = "" if value is None else str(value)
    return text.replace("|", r"\|").replace("\n", " ").strip()


def code(value: Any) -> str:
    text = esc(value).replace("`", "\\`")
    return f"`{text}`" if text else "—"


def link(label: str, relative: Any) -> str:
    if not isinstance(relative, str) or not relative.strip():
        return "—"
    target = relative.replace("\\", "/")
    return f"[{label}]({target})"


def join_text(values: Any, *, limit: int = 4) -> str:
    if not isinstance(values, list):
        return "—"
    cleaned = [esc(item) for item in values if esc(item)]
    if not cleaned:
        return "—"
    shown = cleaned[:limit]
    suffix = f" +{len(cleaned) - limit}" if len(cleaned) > limit else ""
    return ", ".join(f"`{item}`" for item in shown) + suffix


def project_intelligence_map(intelligence: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        str(item.get("id")): item
        for item in intelligence.get("projects", [])
        if isinstance(item, dict) and item.get("id") is not None
    }


def module_analysis_map(analysis: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        str(item.get("moduleId")): item
        for item in analysis.get("modules", [])
        if isinstance(item, dict) and item.get("moduleId") is not None
    }


def read_analysis(root: Path, project: dict[str, Any]) -> dict[str, Any]:
    relative = project.get("analysisDocument")
    if not isinstance(relative, str) or not relative:
        return {}
    path = root / relative
    if not path.is_file():
        return {}
    return load_json(path)


def render(root: Path, plan: dict[str, Any], intelligence: dict[str, Any]) -> str:
    revision = esc(plan.get("selectedRevision", "unknown")) or "unknown"
    workspace_mode = esc(plan.get("workspaceMode", intelligence.get("workspaceMode", "unknown"))) or "unknown"
    repository_summary = esc(intelligence.get("summary")) or "Semantic documentation for the verified repository Projects and modules."
    repository_type = esc(intelligence.get("repositoryType"))
    intel_projects = project_intelligence_map(intelligence)
    projects = [item for item in plan.get("projects", []) if isinstance(item, dict)]

    lines: list[str] = [
        START,
        "# Documentation Index",
        "",
        f"> Baseline: `{revision}`  ",
        f"> Workspace mode: `{workspace_mode}`",
        "",
        "## Repository Overview",
        "",
        repository_summary,
        "",
    ]

    stats = []
    if repository_type:
        stats.append(f"**Repository type:** `{repository_type}`")
    stats.append(f"**Projects:** {len(projects)}")
    stats.append(f"**Modules:** {sum(len([m for m in p.get('modules', []) if isinstance(m, dict)]) for p in projects)}")
    lines.extend([" · ".join(stats), "", "## Projects", "", "| Project | Type / technology | Summary | Project docs |", "|---|---|---|---|"])

    project_cache: list[tuple[dict[str, Any], dict[str, Any], dict[str, Any]]] = []
    for project in projects:
        pid = str(project.get("id", ""))
        pintel = intel_projects.get(pid, {})
        analysis = read_analysis(root, project)
        project_cache.append((project, pintel, analysis))
        name = esc(project.get("name") or pintel.get("name") or pid)
        ptype = esc(analysis.get("type") or pintel.get("type") or project.get("kind")) or "—"
        technology = join_text(pintel.get("technology"), limit=3)
        type_cell = f"`{ptype}`" + (f"<br>{technology}" if technology != "—" else "")
        summary = esc(analysis.get("summary") or pintel.get("summary")) or "—"
        docs = " · ".join([
            link("Architecture", project.get("architectureDocument")),
            link("Business", project.get("businessDocument")),
            link("Constraints", project.get("governanceDocument")),
        ])
        lines.append(f"| {name} | {type_cell} | {summary} | {docs} |")

    for project, pintel, analysis in project_cache:
        pid = str(project.get("id", ""))
        name = esc(project.get("name") or pintel.get("name") or pid)
        summary = esc(analysis.get("summary") or pintel.get("summary"))
        lines.extend(["", f"## {name}", ""])
        if summary:
            lines.extend([summary, ""])

        project_docs = " · ".join([
            link("Architecture", project.get("architectureDocument")),
            link("Business", project.get("businessDocument")),
            link("Constraints and limitations", project.get("governanceDocument")),
        ])
        lines.extend([f"**Project docs:** {project_docs}", ""])

        technology = join_text(pintel.get("technology"), limit=5)
        entries = join_text(pintel.get("entryAnchors"), limit=4)
        if technology != "—" or entries != "—":
            metadata = []
            if technology != "—":
                metadata.append(f"**Technology:** {technology}")
            if entries != "—":
                metadata.append(f"**Key entries:** {entries}")
            lines.extend(["  ".join(metadata), ""])

        module_analysis = module_analysis_map(analysis)
        modules = [item for item in project.get("modules", []) if isinstance(item, dict)]
        lines.extend([
            "### Modules",
            "",
            "| Module | Business role | Responsibility | Key entry surfaces | Docs |",
            "|---|---|---|---|---|",
        ])
        for module in modules:
            mid = str(module.get("id", ""))
            packet = module_analysis.get(mid, {})
            module_name = esc(module.get("name") or mid)
            role = esc(packet.get("businessRole") or module.get("businessRole")) or "pending"
            responsibility = esc(packet.get("responsibility")) or "—"
            entry_surfaces = join_text(packet.get("entrySurfaces"), limit=4)
            docs = [link("Architecture", module.get("architectureDocument"))]
            business_doc = module.get("businessOwnerDocument")
            if isinstance(business_doc, str) and business_doc:
                docs.append(link("Business", business_doc))
            elif module.get("businessDetail") == "project-grouped":
                docs.append(link("Business in project", project.get("businessDocument")))
            lines.append(
                f"| {module_name} | `{role}` | {responsibility} | {entry_surfaces} | {' · '.join(docs)} |"
            )

    cross_edges = intelligence.get("crossProjectEdges")
    if isinstance(cross_edges, list) and any(isinstance(item, dict) for item in cross_edges):
        lines.extend([
            "",
            "## Cross-Project Relationships",
            "",
            "| Consumer | Provider | Relationship / contract |",
            "|---|---|---|",
        ])
        for edge in cross_edges:
            if not isinstance(edge, dict):
                continue
            consumer = esc(edge.get("consumer")) or "—"
            provider = esc(edge.get("provider")) or "—"
            relationship = esc(edge.get("note") or edge.get("contract") or edge.get("relationship")) or "—"
            lines.append(f"| {consumer} | {provider} | {relationship} |")

    lines.extend(["", END, ""])
    return "\n".join(lines)


def preserve_manual(existing: str, generated: str) -> str:
    if START not in existing or END not in existing:
        return generated
    before, rest = existing.split(START, 1)
    _, after = rest.split(END, 1)
    new_region = generated.split(START, 1)[1].split(END, 1)[0]
    return f"{before}{START}{new_region}{END}{after}"


def main() -> int:
    parser = argparse.ArgumentParser(description="Build combined-doc-generation repository index")
    parser.add_argument("docs_root", type=Path)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--intelligence", type=Path, required=True)
    args = parser.parse_args()

    root = args.docs_root.resolve()
    plan = load_json(args.plan.resolve())
    intelligence = load_json(args.intelligence.resolve())
    generated = render(root, plan, intelligence)

    destination = root / str(plan.get("indexDocument") or "index.md")
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.is_file():
        generated = preserve_manual(destination.read_text(encoding="utf-8"), generated)
    destination.write_text(generated, encoding="utf-8")
    print(destination)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
