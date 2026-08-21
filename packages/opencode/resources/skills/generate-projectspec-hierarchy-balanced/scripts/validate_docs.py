#!/usr/bin/env python3
"""Mechanical validator for the balanced ProjectSpec document contract."""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from urllib.parse import unquote
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
from document_contract import CONTRACT_VERSION, HEADINGS as CONTRACT_HEADINGS, evidence_anchors, extract_project_metadata, fallback_metadata, has_placeholder, mermaid_blocks

START = "<!-- PROJECTSPEC:GENERATED:START -->"
END = "<!-- PROJECTSPEC:GENERATED:END -->"
ROLES = {"behavior-owner", "supporting-behavior", "architecture-only"}
DETAILS = {"standalone", "project-grouped", "none"}
DEPTHS = {"focused", "standard", "deep"}
KINDS = {"index", "project-business", "project-architecture", "module-business", "module-architecture", "constraints-and-limitations"}
HEADINGS = CONTRACT_HEADINGS
LINK = re.compile(r"(?<!!)\[[^]]+\]\(([^)]+)\)")
MERMAID = re.compile(r"```mermaid\s*\n(.*?)\n```", re.DOTALL | re.IGNORECASE)
IDS = re.compile(r"^###\s+((?:ARC|LIM)-[A-Za-z0-9][A-Za-z0-9._-]*)\b", re.MULTILINE)


def load(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path}: expected object")
    return value


def region(text: str) -> str:
    if START not in text or END not in text:
        return text
    return text.split(START, 1)[1].split(END, 1)[0]


def h2(text: str) -> set[str]:
    return {match.group(1).strip() for match in re.finditer(r"^##\s+(.+?)\s*$", region(text), re.MULTILINE)}


def h2_body(text: str, title: str) -> str:
    match = re.search(rf"^##\s+{re.escape(title)}\s*$", region(text), re.MULTILINE)
    if not match:
        return ""
    remainder = region(text)[match.end():]
    next_heading = re.search(r"^##\s+", remainder, re.MULTILINE)
    return remainder[:next_heading.start() if next_heading else len(remainder)]


def field(body: str, name: str) -> bool:
    return re.search(rf"^-\s*\*\*{re.escape(name)}:\*\*\s*\S", body, re.MULTILINE | re.IGNORECASE) is not None


def planned(plan: dict[str, Any]) -> list[dict[str, Any]]:
    return [item for item in plan.get("documents", []) if isinstance(item, dict) and isinstance(item.get("path"), str)]


def validate_markers(path: Path, text: str) -> list[str]:
    return [] if text.count(START) == 1 and text.count(END) == 1 and text.index(START) < text.index(END) else [f"{path}: expected one balanced generated region"]


def validate_links(path: Path, root: Path) -> list[str]:
    errors = []
    text = path.read_text(encoding="utf-8")
    for raw in LINK.findall(text):
        target = unquote(raw.strip().split()[0].strip("<>").split("#", 1)[0].split("?", 1)[0])
        if not target or target.startswith(("http://", "https://", "mailto:")):
            continue
        resolved = (path.parent / target).resolve()
        try:
            resolved.relative_to(root)
        except ValueError:
            errors.append(f"{path}: link escapes docs root: {raw}")
        else:
            if not resolved.exists(): errors.append(f"{path}: broken local link: {raw}")
    return errors


def validate_mermaid(path: Path, text: str) -> list[str]:
    errors = []
    if text.count("```") % 2: errors.append(f"{path}: unbalanced code fences")
    supported = {"flowchart", "graph", "stateDiagram-v2", "sequenceDiagram", "classDiagram"}
    for index, block in enumerate(MERMAID.findall(text), 1):
        lines = [line.strip() for line in block.splitlines() if line.strip()]
        if not lines or lines[0].split()[0] not in supported:
            errors.append(f"{path}: unsupported or empty Mermaid block {index}")
            continue
        if "classDiagram" in lines[0] and len(lines) < 3:
            errors.append(f"{path}: selective classDiagram must contain a relationship")
        for line in lines[1:]:
            for match in re.finditer(r"(?:-->|---|-.->|==>)\|([^|]+)\|", line):
                if not (match.group(1).strip().startswith('"') and match.group(1).strip().endswith('"')):
                    errors.append(f"{path}: Mermaid edge label must be quoted: {match.group(1)}")
    return errors


def validate_headings(path: Path, text: str, kind: str) -> list[str]:
    return []


def validate_evidence(path: Path, text: str, kind: str) -> list[str]:
    if kind in {"index", "constraints-and-limitations"}: return []
    body = h2_body(text, "Source Evidence")
    if not re.search(r"`(?!Evidence pending)[^`\n]+`", body):
        return [f"{path}: Source Evidence lacks a concrete path, symbol, or descriptor anchor"]
    return []


def validate_governance(path: Path, text: str) -> list[str]:
    errors = []
    body = region(text)
    if re.search(r"\bCHK-[A-Za-z0-9]", body) or re.search(r"^##\s+.*Change Checks", body, re.MULTILINE | re.IGNORECASE):
        errors.append(f"{path}: balanced governance must not contain CHK-* or a Change Checks table")
    ids = IDS.findall(body)
    for identifier in sorted({value for value in ids if ids.count(value) > 1}): errors.append(f"{path}: duplicate governance ID {identifier}")
    entries = list(re.finditer(r"^###\s+((?:ARC|LIM)-[^\n]+)\s*$", body, re.MULTILINE))
    for index, match in enumerate(entries):
        entry_id = match.group(1).split()[0]
        entry = body[match.end():entries[index + 1].start() if index + 1 < len(entries) else len(body)]
        if not re.search(r"\b(?:Evidence|Basis):", entry, re.IGNORECASE):
            errors.append(f"{path}: {entry_id} has no evidence or basis")
    return errors


def required_diagrams(plan: dict[str, Any], kind: str, path: str) -> int:
    if kind == "project-architecture":
        project_count = len(plan.get("projects", []))
        module_count = sum(len(project.get("modules", [])) for project in plan.get("projects", []))
        return 2 if project_count > 1 or module_count > 1 else 1
    if kind == "module-architecture":
        module = next((module for project in plan.get("projects", []) for module in project.get("modules", []) if module.get("architectureDocument") == path), {})
        return 1 if module.get("businessRole") == "behavior-owner" else 0
    return 0


def validate_plan(root: Path, inventory: dict[str, Any], plan: dict[str, Any]) -> list[str]:
    errors = []
    if plan.get("contractVersion") != CONTRACT_VERSION:
        errors.append("plan: expected current v2 contract metadata")
    if plan.get("requiresHomeGraphVerification") is True: errors.append("plan: HomeGraph boundary verification is still pending")
    docs = {item["path"]: item.get("kind") for item in planned(plan)}
    if docs.get(plan.get("indexDocument", "index.md")) != "index": errors.append("plan: index.md must be planned as index")
    inventory_projects = {item.get("id"): item for item in inventory.get("projects", []) if isinstance(item, dict)}
    plan_projects = {item.get("id") for item in plan.get("projects", []) if isinstance(item, dict)}
    if set(inventory_projects) != plan_projects:
        errors.append("plan: inventory and plan project identities do not agree")
    if plan.get("workspaceMode") == "multi-project" and docs.get("constraints-and-limitations") != "constraints-and-limitations":
        errors.append("plan: multi-Project workspace requires root cross-Project constraints-and-limitations.md")
    for project in plan.get("projects", []):
        if not isinstance(project, dict): continue
        pid = str(project.get("id"))
        if project.get("boundaryStatus") not in {"verified", "corrected-and-verified"}: errors.append(f"plan: Project {pid} boundary is not verified")
        for key, kind in (("architectureDocument", "project-architecture"), ("businessDocument", "project-business"), ("governanceDocument", "constraints-and-limitations")):
            if docs.get(project.get(key)) != kind: errors.append(f"plan: {pid} missing {kind}")
        inventory_modules = {item.get("id") for item in inventory_projects.get(pid, {}).get("modules", []) if isinstance(item, dict)}
        planned_modules = {item.get("id") for item in project.get("modules", []) if isinstance(item, dict)}
        for module_id in inventory_modules - planned_modules: errors.append(f"plan: inventory module missing from {pid}: {module_id}")
        for module in project.get("modules", []):
            if not isinstance(module, dict): continue
            mid = str(module.get("id")); role = module.get("businessRole"); detail = module.get("businessDetail")
            if docs.get(module.get("architectureDocument")) != "module-architecture": errors.append(f"plan: {mid} lacks module Architecture")
            if role not in ROLES: errors.append(f"plan: {mid} has unresolved role {role!r}")
            if detail not in DETAILS: errors.append(f"plan: {mid} has unresolved detail {detail!r}")
            if module.get("analysisDepth") not in DEPTHS: errors.append(f"plan: {mid} has invalid analysis depth")
            if role == "behavior-owner" and detail != "standalone": errors.append(f"plan: {mid} behavior-owner must be standalone")
            if role == "architecture-only" and detail != "none": errors.append(f"plan: {mid} architecture-only must have no Business")
            if detail == "standalone" and docs.get(module.get("businessOwnerDocument")) != "module-business": errors.append(f"plan: {mid} standalone Business missing")
            if detail != "standalone" and module.get("businessOwnerDocument") not in {None, ""}: errors.append(f"plan: {mid} non-standalone module has a Business owner document")
        business_path = root / str(project.get("businessDocument", ""))
        business_text = business_path.read_text(encoding="utf-8") if business_path.is_file() else ""
        for module in project.get("modules", []):
            if not isinstance(module, dict) or module.get("businessDetail") != "project-grouped": continue
            needles = [str(module.get("name", "")), str(module.get("path", "")), str(module.get("id", "")).split("@", 1)[0]]
            if business_text and not any(needle and needle.casefold() in business_text.casefold() for needle in needles):
                errors.append(f"plan: project-grouped module {module.get('id')} is not covered in {project.get('businessDocument')}")
    return errors


def validate_state(root: Path, plan: dict[str, Any], report: dict[str, Any], require_documents: bool = True) -> list[str]:
    errors = []
    if plan.get("contractVersion") != CONTRACT_VERSION:
        errors.append("plan: expected current v2 contract metadata")
    graph = report.get("homegraph", {}) if isinstance(report.get("homegraph"), dict) else {}
    if "status" in graph:
        errors.append("scan report: stale HomeGraph status key conflicts with canonical readiness schema")
    if graph.get("readiness") not in {"ready", "reduced-confidence"}:
        errors.append("scan report: HomeGraph readiness is pending or invalid")
    for key in ("statusSummary", "filesSummary", "exploreAnchor", "revision"):
        if not graph.get(key) or graph.get(key) == "pending":
            errors.append(f"scan report: HomeGraph {key} is incomplete")
    scopes = [scope for scope in report.get("scopes", []) if isinstance(scope, dict)]
    for project in plan.get("projects", []):
        identifier = str(project.get("id"))
        if project.get("boundaryStatus") not in {"verified", "corrected-and-verified"}:
            errors.append(f"plan: Project {identifier} boundary is not verified")
        scope = next((item for item in scopes if item.get("kind") == "project" and item.get("id") == identifier), {})
        discovery = scope.get("discovery", {}) if isinstance(scope.get("discovery"), dict) else {}
        required = ("summary", "projectType", "architecturePattern", "technologies", "evidenceAnchors", "evidenceStatus")
        if discovery.get("status") != "complete" or any(not discovery.get(key) for key in required):
            errors.append(f"scan report: Project {identifier} discovery is absent or incomplete")
        elif any(fallback_metadata(str(discovery.get(key))) for key in ("summary", "projectType", "architecturePattern")) or any(fallback_metadata(str(value)) for value in discovery.get("technologies", [])):
            errors.append(f"scan report: Project {identifier} discovery contains fallback metadata")
        if require_documents:
            facts = scope.get("facts", {}).get("project", {}) if isinstance(scope.get("facts"), dict) else {}
            if scope.get("status") != "complete" or any(not facts.get(key) for key in ("summary", "projectType", "architecturePattern", "technologies")):
                errors.append(f"scan report: Project {identifier} completed document facts are absent or incomplete")
            elif any(fallback_metadata(str(facts.get(key))) for key in ("summary", "projectType", "architecturePattern")) or any(fallback_metadata(str(value)) for value in facts.get("technologies", [])):
                errors.append(f"scan report: Project {identifier} completed document facts contain fallback metadata")
    if require_documents:
        for scope in scopes:
            if scope.get("status") != "complete":
                errors.append(f"scan report: incomplete scope {scope.get('kind')}:{scope.get('id')}")
    return errors


def validate_index_metadata(root: Path, plan: dict[str, Any]) -> list[str]:
    path = root / str(plan.get("indexDocument", "index.md"))
    if not path.is_file():
        return ["index: generated index is missing"]
    content = region(path.read_text(encoding="utf-8"))
    overview = h2_body(content, "Repository Overview").strip()
    errors = []
    if fallback_metadata(overview) or len(overview) < 20:
        errors.append("index: repository overview is missing or generic")
    metadata = re.search(r"\*\*Repository type:\*\*\s*`([^`]+)`.*?\*\*Technologies:\*\*\s*(.*?)\s*·\s*\*\*Architecture pattern:\*\*\s*([^\n]+)", content)
    if not metadata:
        return errors + ["index: repository metadata line is missing"]
    if fallback_metadata(metadata.group(1)):
        errors.append("index: repository type is a fallback value")
    technologies = re.findall(r"`([^`]+)`", metadata.group(2))
    if not technologies:
        errors.append("index: technologies are empty")
    if fallback_metadata(metadata.group(3)):
        errors.append("index: architecture pattern is not recorded")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("docs_root", type=Path)
    parser.add_argument("--inventory", type=Path, required=True)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--scan-report", type=Path)
    parser.add_argument("--packet", type=Path, action="append")
    parser.add_argument("--scope", help="v2 scope: module:<id>, project:<id>, or workspace")
    parser.add_argument("--state-only", action="store_true", help="validate canonical readiness, discovery, boundaries, and completed scope facts before index generation")
    args = parser.parse_args()
    root = args.docs_root.resolve(); inventory = load(args.inventory.resolve()); plan = load(args.plan.resolve())
    if args.state_only:
        report_path = args.scan_report or root / ".projectspec" / "project-scan-report.json"
        report = load(report_path.resolve()) if report_path.is_file() else {}
        errors = validate_state(root, plan, report)
        if errors:
            print("\n".join(f"ERROR: {error}" for error in errors), file=sys.stderr); return 1
        print("Validated ProjectSpec state"); return 0
    if args.scope:
        report_path = args.scan_report or root / ".projectspec" / "project-scan-report.json"
        report = load(report_path.resolve()) if report_path.is_file() else {}
        if report.get("schemaVersion") != 4:
            print("ERROR: v2 ledger is required for scoped validation", file=sys.stderr); return 1
        wanted = args.scope
        scopes = report.get("scopes", [])
        item = next((scope for scope in scopes if (wanted == "workspace" and scope.get("kind") == "workspace") or wanted == f"{scope.get('kind')}:{scope.get('id')}"), None)
        if wanted == "workspace":
            documents = [entry for entry in planned(plan)]
            scoped_errors = validate_state(root, plan, report)
        elif item:
            documents = [{"path": path, "kind": "constraints-and-limitations" if path.endswith("constraints-and-limitations.md") else "module-business" if (path.startswith("modules/") or "/modules/" in path) and path.endswith("business.md") else "project-business" if path.endswith("business.md") else "module-architecture" if (path.startswith("modules/") or "/modules/" in path) else "project-architecture"} for path in item.get("documents", [])]
            scoped_errors = []
        else:
            print(f"ERROR: unknown scope {wanted}", file=sys.stderr); return 1
        for entry in documents:
            path = root / entry["path"]
            if not path.is_file(): scoped_errors.append(f"missing document: {entry['path']}"); continue
            text = path.read_text(encoding="utf-8")
            if text.count(START) != 1 or text.count(END) != 1: scoped_errors.append(f"{entry['path']}: expected one balanced generated region")
            scoped_errors.extend(f"{entry['path']}: unresolved placeholder" for _ in ([0] if has_placeholder(text) else []))
            if entry["kind"] not in {"index", "constraints-and-limitations"} and not evidence_anchors(text): scoped_errors.append(f"{entry['path']}: Source Evidence lacks a concrete anchor")
            if entry["kind"] == "project-architecture" and not extract_project_metadata(text): scoped_errors.append(f"{entry['path']}: canonical Project metadata is missing or contains fallback values")
            scoped_errors.extend(validate_links(path, root) + validate_mermaid(path, text))
            required = required_diagrams(plan, entry["kind"], entry["path"])
            if len(mermaid_blocks(text)) < required:
                scoped_errors.append(f"{entry['path']}: requires {required} Mermaid diagram(s)")
            if wanted == "workspace":
                if entry["kind"] == "constraints-and-limitations": scoped_errors.extend(validate_governance(path, text))
        if wanted == "workspace": scoped_errors.extend(validate_index_metadata(root, plan))
        if scoped_errors:
            print("\n".join(f"ERROR: {error}" for error in scoped_errors), file=sys.stderr); return 1
        if item: item["status"] = "complete"
        report["validationStatus"] = "complete" if wanted == "workspace" else "in-progress"
        report_path.parent.mkdir(parents=True, exist_ok=True); report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(f"Validated {wanted}"); return 0
    errors = validate_plan(root, inventory, plan)
    if args.scan_report and args.scan_report.is_file():
        try:
            report = load(args.scan_report.resolve())
            for key in ("raw", "rawSource", "rawGraph", "sourceDump", "graphResponse"):
                if key in report:
                    errors.append(f"scan report: raw evidence field {key} is not allowed")
        except ValueError as error:
            errors.append(str(error))
    for item in planned(plan):
        path = root / item["path"]
        if not path.is_file(): errors.append(f"plan: missing planned document {item['path']}"); continue
        content = path.read_text(encoding="utf-8")
        errors += validate_markers(path, content) + validate_links(path, root) + validate_mermaid(path, content) + validate_evidence(path, content, item.get("kind", ""))
        kind = item.get("kind")
        if kind == "constraints-and-limitations": errors += validate_governance(path, content)
        required = required_diagrams(plan, kind or "", item.get("path", ""))
        if len(mermaid_blocks(content)) < required: errors.append(f"{path}: requires {required} Mermaid diagram(s)")
        if kind == "project-architecture" and not extract_project_metadata(content): errors.append(f"{path}: canonical Project metadata is missing or contains fallback values")
        if kind in {"project-architecture", "module-architecture"} and re.search(r"^##\s+(?:Architecture Constraints|Known Limitations|Change Checks)", region(content), re.MULTILINE | re.IGNORECASE): errors.append(f"{path}: Architecture contains governance section")
    if errors:
        print("\n".join(f"ERROR: {error}" for error in errors), file=sys.stderr); return 1
    print(f"Validated balanced ProjectSpec documents under {root}")
    return 0


if __name__ == "__main__": raise SystemExit(main())
