#!/usr/bin/env python3
"""Mechanical validation for combined-doc-generation output.

This validator intentionally checks structure and consistency, not factual truth.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import unquote

START = "<!-- PROJECTSPEC:GENERATED:START -->"
END = "<!-- PROJECTSPEC:GENERATED:END -->"

VALID_BUSINESS_ROLES = {"behavior-owner", "supporting-behavior", "architecture-only"}
VALID_BUSINESS_DETAILS = {"standalone", "project-grouped", "none"}
SUPPORTED_MERMAID = {
    "flowchart", "graph", "stateDiagram-v2", "sequenceDiagram", "classDiagram", "erDiagram"
}

CORE_HEADINGS = {
    "module-architecture": [
        "Purpose and Responsibilities",
        "Architecture and Dependencies",
        "Runtime and Data Flow",
        "Extension Guidance",
        "Source Evidence",
    ],
    "module-business": [
        "Role in the Product",
        "User / Domain Flows",
        "Business Concepts and Data",
        "Rules, States, and Outcomes",
        "Source Evidence",
    ],
    "project-architecture": [
        "Project Boundary and Architecture",
        "Module Responsibilities and Dependency Direction",
        "Cross-Module Runtime and Data Flows",
        "Change Ownership Map",
        "Source Evidence",
    ],
    "project-business": [
        "Purpose and Observable Boundary",
        "Actors and Main Journeys",
        "Module Contributions",
        "Business Concepts and Data",
        "Rules, States, Failures, and Outcomes",
        "Source Evidence",
    ],
    "capability-business": [
        "Purpose and Boundary",
        "End-to-End Journey",
        "Participating Modules and Domain Concepts",
        "Source Evidence",
    ],
    "constraints-and-limitations": [
        "Architecture Constraints",
        "Change Checks",
    ],
}

FORBIDDEN_ARCH_HEADINGS = {
    "Architecture Constraints",
    "Architectural Constraints and Invariants",
    "Change Checks",
    "Known Limitations",
    "Known Limitations and Evidence Gaps",
}

PLACEHOLDER_RE = re.compile(
    r"<[^>]*(?:module|project|revision|relative|flow|journey|anchor|claim|scope|capability|change|"
    r"short rule|name|id|actor|caller|precondition|evidence|boundary|owner)[^>]*>",
    re.IGNORECASE,
)

LINK_RE = re.compile(r"(?<!!)\[[^\]]+\]\(([^)]+)\)")
HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$", re.MULTILINE)
MERMAID_BLOCK_RE = re.compile(r"```mermaid\s*\n(.*?)\n```", re.DOTALL)
ANY_MERMAID_OPEN_RE = re.compile(r"```\s*mermaid\b", re.IGNORECASE)

ID_RE = re.compile(r"^###\s+((?:ARC|CHK|LIM)-[A-Za-z0-9][A-Za-z0-9._-]*)\b", re.MULTILINE)


def load_json(path: Path | None) -> dict[str, Any]:
    if path is None:
        return {}
    with path.open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError(f"{path}: expected JSON object")
    return value


def relative_display(path: Path, root: Path) -> str:
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return path.as_posix()


def generated_region(text: str) -> str:
    if START not in text or END not in text:
        return text
    return text.split(START, 1)[1].split(END, 1)[0]


def headings(text: str) -> list[tuple[int, str]]:
    result: list[tuple[int, str]] = []
    for match in HEADING_RE.finditer(text):
        title = re.sub(r"\s+#*$", "", match.group(2)).strip()
        result.append((len(match.group(1)), title))
    return result


def section_text(text: str, heading: str) -> str | None:
    pattern = re.compile(rf"^##\s+{re.escape(heading)}\s*$", re.MULTILINE)
    match = pattern.search(text)
    if not match:
        return None
    start = match.end()
    next_heading = re.search(r"^##\s+", text[start:], re.MULTILINE)
    end = start + next_heading.start() if next_heading else len(text)
    return text[start:end].strip()


def visible_content_length(value: str) -> int:
    value = re.sub(r"<!--.*?-->", "", value, flags=re.DOTALL)
    value = re.sub(r"```.*?```", "", value, flags=re.DOTALL)
    value = re.sub(r"\|[- :|]+\|", "", value)
    value = re.sub(r"\s+", " ", value).strip()
    return len(value)


def validate_markers(path: Path, text: str, root: Path) -> list[str]:
    errors: list[str] = []
    label = relative_display(path, root)
    starts = text.count(START)
    ends = text.count(END)
    if starts != 1 or ends != 1:
        errors.append(f"{label}: expected exactly one generated START/END marker; found {starts}/{ends}")
    elif text.index(START) > text.index(END):
        errors.append(f"{label}: generated END marker appears before START marker")
    return errors


def validate_fences(path: Path, text: str, root: Path) -> list[str]:
    label = relative_display(path, root)
    count = len(re.findall(r"^```", text, re.MULTILINE))
    return [] if count % 2 == 0 else [f"{label}: unclosed Markdown code fence"]


def validate_placeholders(path: Path, text: str, root: Path) -> list[str]:
    errors: list[str] = []
    label = relative_display(path, root)
    region = generated_region(text)
    for match in PLACEHOLDER_RE.finditer(region):
        errors.append(f"{label}: unresolved template placeholder {match.group(0)}")
    for token in ("TODO: fill", "TBD: fill", "<...>"):
        if token.casefold() in region.casefold():
            errors.append(f"{label}: unresolved placeholder token {token}")
    return errors


def validate_links(path: Path, text: str, root: Path) -> list[str]:
    errors: list[str] = []
    label = relative_display(path, root)
    for raw in LINK_RE.findall(text):
        target = raw.strip().split()[0].strip("<>")
        if not target or target.startswith(("http://", "https://", "mailto:", "#")):
            continue
        target = unquote(target.split("#", 1)[0].split("?", 1)[0])
        if not target:
            continue
        resolved = (path.parent / target).resolve()
        try:
            resolved.relative_to(root.resolve())
        except ValueError:
            errors.append(f"{label}: local link escapes docs root: {raw}")
            continue
        if not resolved.exists():
            errors.append(f"{label}: broken local link: {raw}")
    return errors


def _quoted(value: str) -> bool:
    value = value.strip()
    return len(value) >= 2 and value[0] == '"' and value[-1] == '"'


def validate_mermaid(path: Path, text: str, root: Path) -> list[str]:
    errors: list[str] = []
    label = relative_display(path, root)
    all_open = len(ANY_MERMAID_OPEN_RE.findall(text))
    blocks = MERMAID_BLOCK_RE.findall(text)
    if all_open != len(blocks):
        errors.append(f"{label}: malformed/unclosed Mermaid fence or fence must be exactly ```mermaid")

    for index, block in enumerate(blocks, start=1):
        lines = [line.rstrip() for line in block.splitlines() if line.strip()]
        if not lines:
            errors.append(f"{label}: Mermaid block {index} is empty")
            continue
        declaration = lines[0].strip().split()[0]
        if declaration not in SUPPORTED_MERMAID:
            errors.append(f"{label}: Mermaid block {index} has unsupported declaration {declaration!r}")
            continue
        if "<" in block and ">" in block:
            if PLACEHOLDER_RE.search(block):
                errors.append(f"{label}: Mermaid block {index} contains a placeholder label")

        if declaration in {"flowchart", "graph"}:
            for lineno, line in enumerate(lines[1:], start=2):
                stripped = line.strip()
                if stripped.startswith("%%"):
                    continue

                # Edge labels must be quoted: -->|"label"|
                for edge_match in re.finditer(r"(?:-->|---|-.->|==>)\|([^|]+)\|", line):
                    edge_label = edge_match.group(1).strip()
                    if not _quoted(edge_label):
                        errors.append(
                            f"{label}: Mermaid block {index} line {lineno} edge label must be quoted: {edge_label!r}"
                        )

                # Subgraph human label must be quoted: subgraph id["Label"]
                subgraph_match = re.match(r"\s*subgraph\s+[A-Za-z][A-Za-z0-9_]*\s*\[([^\]]+)\]\s*$", line)
                if subgraph_match and not _quoted(subgraph_match.group(1)):
                    errors.append(
                        f"{label}: Mermaid block {index} line {lineno} subgraph label must be quoted"
                    )

                # Square and decision node labels. Ignore empty shape syntax.
                for node_match in re.finditer(r"\b[A-Za-z][A-Za-z0-9_]*\s*\[([^\]\n]+)\]", line):
                    content = node_match.group(1).strip()
                    if content and not _quoted(content):
                        errors.append(
                            f"{label}: Mermaid block {index} line {lineno} node label must be quoted: {content!r}"
                        )
                for node_match in re.finditer(r"\b[A-Za-z][A-Za-z0-9_]*\s*\{([^}\n]+)\}", line):
                    content = node_match.group(1).strip()
                    if content and not _quoted(content):
                        errors.append(
                            f"{label}: Mermaid block {index} line {lineno} decision label must be quoted: {content!r}"
                        )
    return errors


def validate_core_headings(path: Path, text: str, kind: str, root: Path) -> list[str]:
    errors: list[str] = []
    label = relative_display(path, root)
    region = generated_region(text)
    titles = {title for level, title in headings(region) if level == 2}
    for required in CORE_HEADINGS.get(kind, []):
        if required not in titles:
            errors.append(f"{label}: missing required section '## {required}'")
            continue
        body = section_text(region, required) or ""
        min_len = 60 if kind != "constraints-and-limitations" else 20
        if visible_content_length(body) < min_len:
            errors.append(f"{label}: section '## {required}' is too shallow to be useful")

    if kind in {"module-architecture", "project-architecture"}:
        for title in titles & FORBIDDEN_ARCH_HEADINGS:
            errors.append(f"{label}: governance section '## {title}' belongs in constraints-and-limitations.md")
    return errors


def validate_evidence_section(path: Path, text: str, kind: str, root: Path) -> list[str]:
    if kind == "constraints-and-limitations":
        return []
    label = relative_display(path, root)
    region = generated_region(text)
    body = section_text(region, "Source Evidence")
    if body is None:
        return []
    # Require a concrete-looking repository anchor, not prose alone.
    if not re.search(r"`[^`]+(?:/|#|\.json5?\b|\.ets\b|\.ts\b|\.gn\b|\.xml\b|\.ya?ml\b|\.toml\b)[^`]*`", body):
        return [f"{label}: Source Evidence lacks a concrete path/symbol/descriptor anchor"]
    return []


def split_h3_entries(section: str) -> list[tuple[str, str]]:
    matches = list(re.finditer(r"^###\s+([^\n]+)\s*$", section, re.MULTILINE))
    result: list[tuple[str, str]] = []
    for index, match in enumerate(matches):
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(section)
        result.append((match.group(1).strip(), section[start:end].strip()))
    return result


def has_field(body: str, field: str) -> bool:
    return re.search(rf"^-\s*\*\*{re.escape(field)}:\*\*\s*\S", body, re.MULTILINE | re.IGNORECASE) is not None


def validate_governance(path: Path, text: str, root: Path) -> list[str]:
    errors: list[str] = []
    label = relative_display(path, root)
    region = generated_region(text)
    found_ids = ID_RE.findall(region)
    duplicates = sorted({item for item in found_ids if found_ids.count(item) > 1})
    for item in duplicates:
        errors.append(f"{label}: duplicate governance ID {item}")

    arc_section = section_text(region, "Architecture Constraints") or ""
    chk_section = section_text(region, "Change Checks") or ""
    lim_section = section_text(region, "Known Limitations")

    arc_entries = [(title, body) for title, body in split_h3_entries(arc_section) if title.startswith("ARC-")]
    chk_entries = [(title, body) for title, body in split_h3_entries(chk_section) if title.startswith("CHK-")]
    lim_entries = [] if lim_section is None else [(title, body) for title, body in split_h3_entries(lim_section) if title.startswith("LIM-")]

    if not arc_entries:
        errors.append(f"{label}: Architecture Constraints must contain at least one ARC-* entry")
    if not chk_entries:
        errors.append(f"{label}: Change Checks must contain at least one CHK-* entry")

    for title, body in arc_entries:
        entry_id = title.split()[0]
        for field in ("Scope", "Constraint", "Basis", "Implementation impact", "Evidence", "Verification"):
            if not has_field(body, field):
                errors.append(f"{label}: {entry_id} missing field '{field}'")
        basis_match = re.search(r"^-\s*\*\*Basis:\*\*\s*(.+)$", body, re.MULTILINE | re.IGNORECASE)
        if basis_match and not any(value.casefold() in basis_match.group(1).casefold() for value in (
            "enforced", "declared policy", "observed pattern", "inferred guardrail"
        )):
            errors.append(f"{label}: {entry_id} has unsupported Basis value")

    for title, body in chk_entries:
        entry_id = title.split()[0]
        for field in ("Scope", "Applies when", "Evidence"):
            if not has_field(body, field):
                errors.append(f"{label}: {entry_id} missing field '{field}'")
        if not re.search(r"^-\s*\*\*Check:\*\*\s*$", body, re.MULTILINE | re.IGNORECASE):
            errors.append(f"{label}: {entry_id} missing '**Check:**' block")
        if not re.search(r"^\s+1\.\s+\S", body, re.MULTILINE):
            errors.append(f"{label}: {entry_id} Check must contain actionable numbered steps")

    for title, body in lim_entries:
        entry_id = title.split()[0]
        for field in ("Scope", "Limitation / gap", "Implementation impact", "Evidence", "Current handling / unknown"):
            if not has_field(body, field):
                errors.append(f"{label}: {entry_id} missing field '{field}'")
        if re.search(r"could\s+(?:be\s+)?improv", body, re.IGNORECASE):
            errors.append(f"{label}: {entry_id} appears speculative rather than implementation-specific")

    return errors


def iter_planned_documents(plan: dict[str, Any]) -> list[dict[str, Any]]:
    documents = plan.get("documents", [])
    return [item for item in documents if isinstance(item, dict) and isinstance(item.get("path"), str)]


def plan_document_map(plan: dict[str, Any]) -> dict[str, str]:
    return {item["path"]: str(item.get("kind", "")) for item in iter_planned_documents(plan)}


def validate_plan(root: Path, inventory: dict[str, Any], plan: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if not plan:
        return ["plan: documentation plan is required for combined-doc-generation validation"]

    phase = plan.get("phase")
    if phase in {"structural-candidates", "structural-baseline", None} or plan.get("requiresSemanticEnrichment") is True:
        errors.append("plan: semantic enrichment is still pending; module Business roles/details and verified hierarchy must be frozen before validation")
    if plan.get("requiresHomeGraphVerification") is True:
        errors.append("plan: HomeGraph hierarchy verification is still pending")

    documents = plan_document_map(plan)
    for relative in documents:
        if not (root / relative).is_file():
            errors.append(f"plan: planned document does not exist: {relative}")

    plan_projects = [item for item in plan.get("projects", []) if isinstance(item, dict)]
    inventory_projects = [item for item in inventory.get("projects", []) if isinstance(item, dict)] if inventory else []
    plan_by_id = {item.get("id"): item for item in plan_projects}

    for inv_project in inventory_projects:
        project_id = inv_project.get("id")
        if project_id not in plan_by_id:
            errors.append(f"plan: inventory Project missing from plan after verification: {project_id}")
            continue
        plan_project = plan_by_id[project_id]
        plan_modules = {item.get("id"): item for item in plan_project.get("modules", []) if isinstance(item, dict)}
        for inv_module in inv_project.get("modules", []):
            if isinstance(inv_module, dict) and inv_module.get("id") not in plan_modules:
                errors.append(f"plan: inventory module missing from Project {project_id}: {inv_module.get('id')}")

    for project in plan_projects:
        project_id = str(project.get("id", "<unknown>"))
        if project.get("boundaryStatus") not in {"verified", "corrected-and-verified"}:
            errors.append(f"plan: Project {project_id} boundaryStatus must be verified after HomeGraph review")

        for field, expected_kind in (
            ("architectureDocument", "project-architecture"),
            ("businessDocument", "project-business"),
            ("governanceDocument", "constraints-and-limitations"),
        ):
            relative = project.get(field)
            if not isinstance(relative, str) or not relative:
                errors.append(f"plan: Project {project_id} missing {field}")
            elif documents.get(relative) != expected_kind:
                errors.append(f"plan: Project {project_id} {field} is not listed as {expected_kind}: {relative}")

        project_business_path = root / str(project.get("businessDocument", ""))
        project_business_text = project_business_path.read_text(encoding="utf-8") if project_business_path.is_file() else ""

        for module in [item for item in project.get("modules", []) if isinstance(item, dict)]:
            module_id = str(module.get("id", "<unknown>"))
            role = module.get("businessRole")
            detail = module.get("businessDetail")
            arch_doc = module.get("architectureDocument")
            business_doc = module.get("businessOwnerDocument")

            if role not in VALID_BUSINESS_ROLES:
                errors.append(f"plan: module {module_id} has unresolved/invalid businessRole {role!r}")
            if detail not in VALID_BUSINESS_DETAILS:
                errors.append(f"plan: module {module_id} has unresolved/invalid businessDetail {detail!r}")

            if not isinstance(arch_doc, str) or documents.get(arch_doc) != "module-architecture":
                errors.append(f"plan: module {module_id} lacks a planned module Architecture document")

            if role == "behavior-owner" and detail != "standalone":
                errors.append(f"plan: behavior-owner module {module_id} must use businessDetail=standalone")
            if role == "architecture-only" and detail != "none":
                errors.append(f"plan: architecture-only module {module_id} must use businessDetail=none")
            if role == "supporting-behavior" and detail not in {"standalone", "project-grouped"}:
                errors.append(f"plan: supporting-behavior module {module_id} must be standalone or project-grouped")

            if detail == "standalone":
                if not isinstance(business_doc, str) or not business_doc:
                    errors.append(f"plan: standalone Business module {module_id} lacks businessOwnerDocument")
                elif documents.get(business_doc) != "module-business":
                    errors.append(f"plan: module {module_id} businessOwnerDocument is not listed as module-business: {business_doc}")
            else:
                if business_doc not in {None, ""}:
                    errors.append(f"plan: non-standalone module {module_id} must not set businessOwnerDocument")

            rationale = module.get("businessRationale")
            if role in {"behavior-owner", "supporting-behavior"} and (not isinstance(rationale, list) or not rationale):
                errors.append(f"plan: behavioral module {module_id} lacks evidence-based businessRationale")

            if detail == "project-grouped" and project_business_text:
                needles = [str(module.get("name", "")), str(module.get("path", "")), module_id.split("@", 1)[0]]
                if not any(needle and needle.casefold() in project_business_text.casefold() for needle in needles):
                    errors.append(f"{project.get('businessDocument')}: project-grouped module {module_id} is not visibly covered in Project Business")

    return errors


def validate_project_module_mentions(root: Path, plan: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for project in [item for item in plan.get("projects", []) if isinstance(item, dict)]:
        arch_rel = project.get("architectureDocument")
        business_rel = project.get("businessDocument")
        arch_text = (root / arch_rel).read_text(encoding="utf-8") if isinstance(arch_rel, str) and (root / arch_rel).is_file() else ""
        business_text = (root / business_rel).read_text(encoding="utf-8") if isinstance(business_rel, str) and (root / business_rel).is_file() else ""
        for module in [item for item in project.get("modules", []) if isinstance(item, dict)]:
            needles = [str(module.get("name", "")), str(module.get("path", "")), str(module.get("outputSlug", ""))]
            if arch_text and not any(needle and needle.casefold() in arch_text.casefold() for needle in needles):
                errors.append(f"{arch_rel}: does not mention module {module.get('id')} in Project module composition")
            if business_text and not any(needle and needle.casefold() in business_text.casefold() for needle in needles):
                errors.append(f"{business_rel}: does not mention module {module.get('id')} in Module Contributions")
    return errors


def validate_document(path: Path, kind: str, root: Path) -> list[str]:
    text = path.read_text(encoding="utf-8")
    errors: list[str] = []
    errors.extend(validate_markers(path, text, root))
    errors.extend(validate_fences(path, text, root))
    errors.extend(validate_placeholders(path, text, root))
    errors.extend(validate_links(path, text, root))
    errors.extend(validate_mermaid(path, text, root))
    errors.extend(validate_core_headings(path, text, kind, root))
    errors.extend(validate_evidence_section(path, text, kind, root))
    if kind == "constraints-and-limitations":
        errors.extend(validate_governance(path, text, root))
    return errors


def validate(root: Path, inventory: dict[str, Any], plan: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if not root.is_dir():
        return [f"docs root does not exist: {root}"]

    errors.extend(validate_plan(root, inventory, plan))
    document_map = plan_document_map(plan)
    for relative, kind in document_map.items():
        path = root / relative
        if path.is_file() and kind in CORE_HEADINGS:
            errors.extend(validate_document(path, kind, root))

    if plan:
        errors.extend(validate_project_module_mentions(root, plan))

    # Catch malformed generated markdown that is present even if the enriched plan accidentally omitted it.
    for path in root.rglob("*.md"):
        if ".projectspec" in path.parts:
            continue
        text = path.read_text(encoding="utf-8")
        if START in text or END in text:
            errors.extend(validate_fences(path, text, root))
            errors.extend(validate_mermaid(path, text, root))

    return sorted(set(errors))


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate combined-doc-generation documentation mechanics")
    parser.add_argument("docs_root", type=Path)
    parser.add_argument("--inventory", type=Path)
    parser.add_argument("--plan", type=Path)
    args = parser.parse_args()

    root = args.docs_root.resolve()
    try:
        inventory = load_json(args.inventory.resolve() if args.inventory else None)
        plan = load_json(args.plan.resolve() if args.plan else None)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"validation input error: {exc}", file=sys.stderr)
        return 2

    errors = validate(root, inventory, plan)
    if errors:
        print(f"combined-doc-generation validation failed with {len(errors)} issue(s):", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    planned = len(iter_planned_documents(plan))
    projects = len([item for item in plan.get("projects", []) if isinstance(item, dict)])
    modules = sum(len([item for item in project.get("modules", []) if isinstance(item, dict)]) for project in plan.get("projects", []) if isinstance(project, dict))
    print(f"combined-doc-generation validation passed: {projects} project(s), {modules} module(s), {planned} planned document(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
