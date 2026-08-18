#!/usr/bin/env python3
"""Validate ProjectSpec v6 Markdown, frozen inventory, and documentation plan."""

from __future__ import annotations

import argparse
import json
import re
import sys
import tempfile
from collections import Counter
from pathlib import Path
from typing import Any

START = "<!-- PROJECTSPEC:GENERATED:START -->"
END = "<!-- PROJECTSPEC:GENERATED:END -->"
LINK_RE = re.compile(r"(?<!!)\[[^\]]+\]\(([^)]+)\)")
TITLE_RE = re.compile(r"^#\s+(.+?)\s*$", re.MULTILINE)
PLACEHOLDER_RE = re.compile(
    r"<(?:revision|relative|workspace|project|module|system|subsystem|capability)[^>]*>|"
    r"\{\{[^}]+\}\}|\bTODO\b",
    re.I,
)
CAP_HEADING_RE = re.compile(r"^#{2,6}\s+.*\b(CAP-[A-Za-z0-9._-]+)\b", re.MULTILINE | re.I)


def read_json(path: Path, label: str) -> tuple[dict[str, Any] | None, list[str]]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        return None, [f"{label}: cannot read valid JSON from {path}: {error}"]
    if not isinstance(value, dict):
        return None, [f"{label}: expected a JSON object in {path}"]
    return value, []


def validate_file(path: Path, docs_root: Path) -> tuple[list[str], str | None]:
    errors: list[str] = []
    text = path.read_text(encoding="utf-8")
    rel = path.relative_to(docs_root)

    if text.count(START) != text.count(END):
        errors.append(f"{rel}: unmatched ProjectSpec generated markers")
    if text.count(START) > 1 or text.count(END) > 1:
        errors.append(f"{rel}: expected at most one generated region")
    if START in text and END in text and text.index(START) > text.index(END):
        errors.append(f"{rel}: generated markers are reversed")
    if text.count("```") % 2:
        errors.append(f"{rel}: unbalanced fenced code block")

    match = PLACEHOLDER_RE.search(text)
    if match:
        errors.append(f"{rel}: unresolved placeholder {match.group(0)!r}")

    for raw_target in LINK_RE.findall(text):
        target = raw_target.strip().split("#", 1)[0].strip()
        if not target or target.startswith(("http://", "https://", "mailto:", "#")):
            continue
        target = target.split(" ", 1)[0].strip("<>")
        resolved = (path.parent / target).resolve()
        try:
            resolved.relative_to(docs_root.resolve())
        except ValueError:
            continue
        if not resolved.exists():
            errors.append(f"{rel}: broken local link -> {raw_target}")

    for line in re.findall(r"^\*\*Outcome evidence:\*\*\s*(.+)$", text, re.MULTILINE | re.I):
        if re.match(r"Observed\b", line, re.I) and not re.search(r"[`/]\S+|\bat\s+`?[^`\s]+[#:]", line, re.I):
            errors.append(f"{rel}: observed terminal outcome lacks a path/symbol evidence anchor")

    title = TITLE_RE.search(text)
    if not title:
        errors.append(f"{rel}: missing H1 title")
        return errors, None
    return errors, title.group(1).strip()


def architecture_texts(docs_root: Path) -> dict[Path, str]:
    return {
        path: path.read_text(encoding="utf-8")
        for path in docs_root.rglob("*.md")
        if "architecture" in path.name.casefold()
    }


def business_texts(docs_root: Path) -> dict[Path, str]:
    return {
        path: path.read_text(encoding="utf-8")
        for path in docs_root.rglob("*.md")
        if "business" in path.name.casefold()
    }


def planned_documents(plan: dict[str, Any]) -> list[str]:
    values = plan.get("documents", [])
    if not isinstance(values, list):
        return []
    output: list[str] = []
    for value in values:
        if isinstance(value, str):
            output.append(value)
        elif isinstance(value, dict) and isinstance(value.get("path"), str):
            output.append(value["path"])
    return output


def validate_inventory(docs_root: Path, inventory: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    combined = "\n".join(architecture_texts(docs_root).values()).casefold()
    projects = inventory.get("projects", [])
    if not isinstance(projects, list):
        return ["inventory: projects must be an array"]
    for project in projects:
        if not isinstance(project, dict):
            continue
        modules = project.get("modules", [])
        if not isinstance(modules, list):
            errors.append(f"inventory: project {project.get('id', '?')} modules must be an array")
            continue
        for module in modules:
            if not isinstance(module, dict):
                continue
            candidates = [module.get("id"), module.get("path"), module.get("name")]
            anchors = [str(item).casefold() for item in candidates if isinstance(item, str) and item.strip()]
            if anchors and not any(anchor in combined for anchor in anchors):
                errors.append(
                    f"inventory: physical unit {module.get('id', module.get('name', '?'))!r} "
                    "is missing from architecture inventories"
                )
    return errors


def validate_plan(docs_root: Path, plan: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    documents = planned_documents(plan)
    if not documents:
        errors.append("plan: documents must list every expected standalone output path")
    for relative in documents:
        candidate = docs_root / relative.removeprefix("docs/")
        if not candidate.is_file():
            errors.append(f"plan: missing planned document {relative}")

    architecture = architecture_texts(docs_root)
    business = business_texts(docs_root)
    capabilities = plan.get("capabilities", [])
    if not isinstance(capabilities, list):
        return errors + ["plan: capabilities must be an array"]

    for capability in capabilities:
        if not isinstance(capability, dict) or capability.get("major") is not True:
            continue
        capability_id = capability.get("id")
        owner = capability.get("owner_document")
        if not isinstance(capability_id, str) or not capability_id:
            errors.append("plan: every major capability requires a stable id")
            continue
        if not isinstance(owner, str) or not owner:
            errors.append(f"plan: major capability {capability_id} lacks owner_document")
            continue
        owner_path = docs_root / owner.removeprefix("docs/")
        if not owner_path.is_file():
            errors.append(f"plan: major capability {capability_id} owner does not exist: {owner}")
            continue
        text = owner_path.read_text(encoding="utf-8")
        required = {
            "trigger": r"\bTrigger\b",
            "preconditions": r"\bPreconditions?\b",
            "terminal outcome": r"\bTerminal outcome\b|\bOutcome evidence\b",
            "alternatives/failures": r"\bAlternatives?\b|\bFailures?\b",
            "participating units": r"\bParticipating\b",
            "evidence": r"\bEvidence\b",
            "unknowns": r"\bUnknowns?\b|\bUnavailable\b",
        }
        if capability_id.casefold() not in text.casefold():
            errors.append(f"{owner}: detailed owner does not contain capability ID {capability_id}")
        for label, pattern in required.items():
            if not re.search(pattern, text, re.I):
                errors.append(f"{owner}: major capability {capability_id} lacks {label}")

        detailed_owners = [
            path
            for path, candidate in business.items()
            if any(match.casefold() == capability_id.casefold() for match in CAP_HEADING_RE.findall(candidate))
        ]
        if len(detailed_owners) != 1:
            listed = ", ".join(str(path.relative_to(docs_root)) for path in detailed_owners) or "none"
            errors.append(f"plan: capability {capability_id} must have exactly one detailed owner heading; found {listed}")
        if not any(capability_id.casefold() in candidate.casefold() for candidate in architecture.values()):
            errors.append(f"plan: capability {capability_id} is not mapped in any Architecture document")
    return errors


def validate_tree(
    docs_root: Path,
    inventory: dict[str, Any] | None = None,
    plan: dict[str, Any] | None = None,
) -> list[str]:
    errors: list[str] = []
    if not docs_root.is_dir():
        return [f"not a directory: {docs_root}"]

    for required in ("index.md", "high-level-business.md", "high-level-architecture.md"):
        if not (docs_root / required).is_file():
            errors.append(f"missing required document: {required}")

    titles: list[tuple[str, Path]] = []
    files = sorted(docs_root.rglob("*.md"))
    if not files:
        return errors + ["no Markdown documents found"]
    for path in files:
        file_errors, title = validate_file(path, docs_root)
        errors.extend(file_errors)
        if title:
            titles.append((title.casefold(), path))

    counts = Counter(title for title, _ in titles)
    for normalized, count in counts.items():
        if count > 1:
            paths = ", ".join(str(path.relative_to(docs_root)) for title, path in titles if title == normalized)
            errors.append(f"duplicate H1 title {normalized!r}: {paths}")
    if inventory is not None:
        errors.extend(validate_inventory(docs_root, inventory))
    if plan is not None:
        errors.extend(validate_plan(docs_root, plan))
    return errors


def self_test() -> int:
    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp)
        common = f"{START}\n# {{title}}\n\n> Scope: `.`\n\n{END}\n"
        (root / "index.md").write_text(
            common.format(title="Index") + "\n[Architecture](high-level-architecture.md)\n", encoding="utf-8"
        )
        (root / "high-level-business.md").write_text(
            f"{START}\n# Business\n\n## CAP-browse — Browse\nTrigger Preconditions Terminal outcome Outcome evidence: Unavailable Alternatives Participating Evidence Unknowns\n{END}\n",
            encoding="utf-8",
        )
        (root / "high-level-architecture.md").write_text(
            f"{START}\n# Architecture\n\nentry@entry CAP-browse\n{END}\n", encoding="utf-8"
        )
        inventory = {
            "projects": [{"id": "_root", "modules": [{"id": "entry@entry", "name": "entry", "path": "entry"}]}]
        }
        plan = {
            "documents": ["index.md", "high-level-business.md", "high-level-architecture.md"],
            "capabilities": [{"id": "CAP-browse", "major": True, "owner_document": "high-level-business.md"}],
        }
        if validate_tree(root, inventory, plan):
            print("self-test failed: valid fixture rejected", file=sys.stderr)
            return 1
        (root / "index.md").write_text("# Index\n[Missing](missing.md)\n", encoding="utf-8")
        if not any("broken local link" in error for error in validate_tree(root)):
            print("self-test failed: broken link not detected", file=sys.stderr)
            return 1
    print("ProjectSpec validator self-test passed")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("docs_root", nargs="?", type=Path)
    parser.add_argument("--inventory", type=Path)
    parser.add_argument("--plan", type=Path)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        return self_test()
    if args.docs_root is None:
        parser.error("docs_root is required unless --self-test is used")

    errors: list[str] = []
    inventory = None
    plan = None
    if args.inventory:
        inventory, load_errors = read_json(args.inventory, "inventory")
        errors.extend(load_errors)
    if args.plan:
        plan, load_errors = read_json(args.plan, "plan")
        errors.extend(load_errors)
    if not errors:
        errors.extend(validate_tree(args.docs_root.resolve(), inventory, plan))
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(f"ProjectSpec validation passed: {args.docs_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
