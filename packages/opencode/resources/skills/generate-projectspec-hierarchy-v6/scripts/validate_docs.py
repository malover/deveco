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
DETAIL_HEADING_RE = re.compile(
    r"^(#{2,6})\s+((?:CAP|FLOW|RULE)-[A-Za-z0-9][A-Za-z0-9._-]*)\s+—\s+\S.*$", re.MULTILINE | re.I
)
EXAMPLE_START_RE = re.compile(r"^(#{1,6})\s+(EXAMPLE-.*)$", re.MULTILINE | re.I)
EXAMPLE_HEADING_RE = re.compile(
    r"^(#{3,6})\s+(EXAMPLE-[A-Za-z0-9][A-Za-z0-9._-]*)\s+—\s+((?:RULE|FLOW)-[A-Za-z0-9][A-Za-z0-9._-]*)\s*$",
    re.I,
)
MODULE_ID_RE = re.compile(r"^>\s*Module ID:\s*(\S.*?)\s*$", re.MULTILINE | re.I)
BUSINESS_ROLE_RE = re.compile(r"^>\s*Business role:\s*(\S.*?)\s*$", re.MULTILINE | re.I)
PARENT_BEHAVIOR_RE = re.compile(r"^>\s*Parent behavior:\s*(\S.*?)\s*$", re.MULTILINE | re.I)
MERMAID_DECLARATION_RE = re.compile(r"^(?:(?:flowchart|graph)\s+(?:TB|TD|BT|RL|LR)|stateDiagram-v2)\s*$", re.I)
ARCHITECTURE_REQUIRED = {
    "architectural constraints and invariants": r"^##\s+Architectural Constraints and Invariants\s*$",
    "known limitations and evidence gaps": r"^##\s+Known Limitations and Evidence Gaps\s*$",
    "change guardrails": r"^##\s+Change Guardrails\s*$",
}
BUSINESS_REQUIRED = {
    "capability coverage": r"^##\s+.*Capabilit",
    "process/flow": r"^##\s+.*(?:Process|Flow|Journey)",
    "UX or system journey": r"^##\s+.*(?:UX|Interaction|System/API/Operational|System Journey)",
    "rules/decisions": r"^##\s+.*(?:Rules|Decision)",
    "unknowns/limitations": r"^##\s+.*(?:Unknowns|Limitations)",
    "evidence": r"^##\s+.*Evidence",
}


def section_body(text: str, heading_pattern: str) -> str | None:
    match = re.search(heading_pattern, text, re.MULTILINE | re.I)
    if not match:
        return None
    rest = text[match.end():]
    end = re.search(r"^##\s+", rest, re.MULTILINE)
    return (rest[: end.start()] if end else rest).strip()


def read_json(path: Path, label: str) -> tuple[dict[str, Any] | None, list[str]]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        return None, [f"{label}: cannot read valid JSON from {path}: {error}"]
    if not isinstance(value, dict):
        return None, [f"{label}: expected a JSON object in {path}"]
    return value, []


def has_content(value: str) -> bool:
    normalized = re.sub(r"[`*_<>\[\](){}|]", "", value).strip(" \t\r\n:—-.?/\\")
    return bool(normalized) and normalized.casefold() not in {"todo", "tbd", "none", "n/a", "placeholder"}


def fenced_blocks(text: str) -> tuple[list[tuple[str, str, int, int]], list[int]]:
    lines = text.splitlines()
    blocks: list[tuple[str, str, int, int]] = []
    unclosed: list[int] = []
    index = 0
    while index < len(lines):
        opening = re.match(r"^\s*```(.*)$", lines[index])
        if not opening:
            index += 1
            continue
        start = index
        language = opening.group(1).casefold()
        index += 1
        body: list[str] = []
        while index < len(lines) and not re.match(r"^\s*```\s*$", lines[index]):
            body.append(lines[index])
            index += 1
        if index == len(lines):
            unclosed.append(start + 1)
            break
        blocks.append((language, "\n".join(body), start + 1, index + 1))
        index += 1
    return blocks, unclosed


def detailed_ids(text: str, prefix: str | None = None) -> list[str]:
    values = [match.group(2) for match in DETAIL_HEADING_RE.finditer(text)]
    if prefix is None:
        return values
    return [value for value in values if value.casefold().startswith(f"{prefix.casefold()}-")]


def explicitly_links(text: str, reference: str) -> bool:
    escaped = re.escape(reference)
    return bool(
        re.search(rf"\[[^\]]*\b{escaped}\b[^\]]*\]\([^)]+\)", text, re.I)
        or re.search(rf"\[[^\]]+\]\([^)]*#(?:[^)]*-)?{escaped}\b[^)]*\)", text, re.I)
    )


def validate_examples(text: str, rel: Path) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    example_ids: list[str] = []
    starts = list(EXAMPLE_START_RE.finditer(text))
    local_details = {value.casefold() for value in detailed_ids(text)}
    for index, start in enumerate(starts):
        heading = start.group(0)
        valid = EXAMPLE_HEADING_RE.fullmatch(heading)
        label = heading.strip()
        if not valid:
            errors.append(f"{rel}: malformed characterization example heading {label!r}")
        else:
            example_ids.append(valid.group(2))
            reference = valid.group(3)
            if reference.casefold() not in local_details and not explicitly_links(text, reference):
                errors.append(f"{rel}: characterization example {valid.group(2)} reference {reference} has no detailed owner or explicit link")
        block_end = starts[index + 1].start() if index + 1 < len(starts) else len(text)
        next_heading = re.search(r"^#{1,6}\s+", text[start.end():block_end], re.MULTILINE)
        if next_heading:
            block_end = start.end() + next_heading.start()
        block = text[start.end():block_end]
        values: dict[str, str] = {}
        for field in ("Given", "When", "Then", "Evidence status"):
            matches = re.findall(rf"^\s*-\s+\*\*{re.escape(field)}:\*\*\s*(.*?)\s*$", block, re.MULTILINE | re.I)
            if len(matches) != 1:
                errors.append(f"{rel}: characterization example {label!r} must contain {field} exactly once")
                continue
            values[field] = matches[0]
            if not has_content(matches[0]) or PLACEHOLDER_RE.search(matches[0]) or re.search(r"<[^>]+>", matches[0]):
                errors.append(f"{rel}: characterization example {label!r} has empty or placeholder {field}")
        evidence = values.get("Evidence status")
        if evidence:
            match = re.match(r"^(Observed|Declared|Inferred|Unavailable)\b\s*(?:—|:|at\b|from\b|beyond\b)\s*(.+)$", evidence, re.I)
            if not match:
                errors.append(f"{rel}: characterization example {label!r} has invalid evidence status or lacks an anchor/boundary")
            elif not has_content(match.group(2)) or re.search(r"<[^>]+>", match.group(2)):
                errors.append(f"{rel}: characterization example {label!r} lacks an evidence anchor/boundary")
    return errors, example_ids


def heading_section(text: str, identifier: str) -> str | None:
    match = re.search(
        rf"^(#{{2,6}})\s+{re.escape(identifier)}\s+—\s+\S.*$", text, re.MULTILINE | re.I
    )
    if not match:
        return None
    level = len(match.group(1))
    rest = text[match.end():]
    end = re.search(rf"^#{{1,{level}}}\s+", rest, re.MULTILINE)
    return rest[: end.start()] if end else rest


def validate_diagram_contract(section: str, identifier: str, rel: str) -> list[str]:
    errors: list[str] = []
    decisions = re.findall(r"^\*\*Diagram decision:\*\*\s*(\S.*?)\s*$", section, re.MULTILINE | re.I)
    if len(decisions) != 1:
        return [f"{rel}: flow {identifier} must contain exactly one Diagram decision"]
    match = re.match(r"^(required|not-useful)\s+—\s+(.+)$", decisions[0], re.I)
    if not match or not has_content(match.group(2)) or re.search(r"<[^>]+>", match.group(2)):
        return [f"{rel}: flow {identifier} has an unknown diagram decision or missing reason"]
    blocks, unclosed = fenced_blocks(section)
    mermaid = [block for block in blocks if block[0] == "mermaid"]
    if unclosed:
        errors.append(f"{rel}: flow {identifier} has an unclosed fenced block")
    if match.group(1).casefold() == "required":
        decision_match = re.search(r"^\*\*Diagram decision:\*\*[^\n]*\n", section, re.MULTILINE | re.I)
        following = section[decision_match.end():] if decision_match else ""
        if not re.match(r"^\s*```mermaid\s*$", following, re.MULTILINE | re.I):
            errors.append(f"{rel}: required flow {identifier} must be immediately followed by a Mermaid block")
        if len(mermaid) != 1:
            errors.append(f"{rel}: required flow {identifier} must contain exactly one Mermaid block")
    elif mermaid:
        errors.append(f"{rel}: not-useful flow {identifier} must not contain a Mermaid block")
    return errors


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
    blocks, unclosed = fenced_blocks(text)
    for line in unclosed:
        errors.append(f"{rel}: unclosed fenced code block at line {line}")

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

    if "architecture" in path.name.casefold():
        minimums = {
            "architectural constraints and invariants": 120,
            "known limitations and evidence gaps": 60,
            "change guardrails": 100,
        }
        for label, pattern in ARCHITECTURE_REQUIRED.items():
            body = section_body(text, pattern)
            if body is None:
                errors.append(f"{rel}: missing mandatory Architecture section: {label}")
            elif len(re.sub(r"[\s|#*`-]+", "", body)) < minimums[label]:
                errors.append(f"{rel}: Architecture section is too thin: {label}")

    if "business" in path.name.casefold():
        for label, pattern in BUSINESS_REQUIRED.items():
            if not re.search(pattern, text, re.MULTILINE | re.I):
                errors.append(f"{rel}: missing substantive Business section: {label}")
        example_errors, _ = validate_examples(text, rel)
        errors.extend(example_errors)
        for language, body, line, _ in blocks:
            if language.strip() == "mermaid" and language != "mermaid":
                errors.append(f"{rel}: invalid Mermaid fence syntax at line {line}")
                continue
            if language != "mermaid":
                continue
            meaningful = next((value.strip() for value in body.splitlines() if value.strip()), "")
            if not meaningful:
                errors.append(f"{rel}: empty Mermaid block at line {line}")
            elif not MERMAID_DECLARATION_RE.fullmatch(meaningful):
                errors.append(f"{rel}: unsupported Mermaid declaration at line {line}: {meaningful!r}")

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


def normalized_document(value: str) -> str:
    return value.replace("\\", "/").removeprefix("docs/").removeprefix("./")


def validate_inventory(docs_root: Path, inventory: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    combined = "\n".join(architecture_texts(docs_root).values()).casefold()
    projects = inventory.get("projects", [])
    if not isinstance(inventory.get("generatedBy"), str):
        errors.append("inventory: generatedBy is required for reproducibility")
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
    if plan.get("phase") == "structural-baseline" and plan.get("requiresSemanticEnrichment") is True:
        errors.append("plan: structural baseline was not semantically enriched before documentation completion")
    if not documents:
        errors.append("plan: documents must list every expected standalone output path")
    for relative in documents:
        candidate = docs_root / relative.removeprefix("docs/")
        if not candidate.is_file():
            errors.append(f"plan: missing planned document {relative}")

    architecture = architecture_texts(docs_root)
    business = business_texts(docs_root)
    planned = {normalized_document(value) for value in documents}
    valid_roles = {"behavior-owner", "supporting-behavior", "architecture-only"}
    module_owners: list[tuple[str, str]] = []
    supporting_parents: list[tuple[str, str]] = []
    for project in plan.get("projects", []):
        if not isinstance(project, dict):
            continue
        for module in project.get("modules", []):
            if not isinstance(module, dict):
                continue
            role = module.get("businessRole")
            owner = module.get("businessOwnerDocument")
            module_id = module.get("id", "?")
            if module.get("architecture") == "standalone" and role not in valid_roles:
                errors.append(f"plan: standalone module {module.get('id', '?')} lacks a resolved Business role")
                continue
            if role in {"behavior-owner", "supporting-behavior"}:
                if not isinstance(owner, str) or not owner.strip():
                    errors.append(f"plan: Business module role {role} requires an existing owner for {module_id}")
                    continue
                normalized = normalized_document(owner)
                module_owners.append((str(module_id), normalized))
                if normalized not in planned:
                    errors.append(f"plan: module {module_id} Business owner is not listed in plan.documents: {owner}")
                owner_path = docs_root / normalized
                if not owner_path.is_file():
                    errors.append(f"plan: Business module role {role} requires an existing owner for {module_id}")
                    continue
                if owner_path not in business:
                    errors.append(f"plan: module {module_id} owner is not a Business document: {owner}")
                text = owner_path.read_text(encoding="utf-8")
                ids = MODULE_ID_RE.findall(text)
                roles = BUSINESS_ROLE_RE.findall(text)
                parents = PARENT_BEHAVIOR_RE.findall(text)
                if ids != [str(module_id)]:
                    errors.append(f"{owner}: Module ID metadata must exactly match {module_id}")
                if roles != [role]:
                    errors.append(f"{owner}: Business role metadata must exactly match {role}")
                parent = module.get("parentBehavior")
                if role == "supporting-behavior":
                    if not isinstance(parent, str) or not re.fullmatch(r"(?:CAP|FLOW)-[A-Za-z0-9][A-Za-z0-9._-]*", parent, re.I):
                        errors.append(f"plan: supporting module {module_id} requires parentBehavior CAP-* or FLOW-*")
                    elif parents != [parent]:
                        errors.append(f"{owner}: Parent behavior metadata must exactly match {parent}")
                    else:
                        supporting_parents.append((str(module_id), parent))
                elif len(parents) != 1 or not re.match(r"^None\s+—\s+owns\s+(?:CAP|FLOW)-", parents[0], re.I):
                    errors.append(f"{owner}: behavior-owner Parent behavior must be 'None — owns CAP-* or FLOW-*'")
            elif isinstance(owner, str) and owner:
                errors.append(f"plan: module {module_id} with role {role!r} must not have a Business owner")
    duplicate_module_owners = Counter(owner for _, owner in module_owners)
    for owner, count in duplicate_module_owners.items():
        if count > 1:
            modules = ", ".join(module for module, candidate in module_owners if candidate == owner)
            errors.append(f"plan: module Business owner {owner} is assigned to multiple modules: {modules}")
    owned_behavior_ids = {identifier.casefold() for text in business.values() for identifier in detailed_ids(text)}
    for module_id, parent in supporting_parents:
        if parent.casefold() not in owned_behavior_ids:
            errors.append(f"plan: supporting module {module_id} parent behavior {parent} has no detailed Business owner")
    capabilities = plan.get("capabilities", [])
    if not isinstance(capabilities, list):
        return errors + ["plan: capabilities must be an array"]

    candidates = plan.get("capabilityCandidates", [])
    excluded = plan.get("excluded_capability_candidates", [])
    classified_ids = {
        str(item.get("candidate_id", item.get("id")))
        for item in capabilities + (excluded if isinstance(excluded, list) else [])
        if isinstance(item, dict) and item.get("candidate_id", item.get("id"))
    }
    if isinstance(candidates, list):
        for candidate in candidates:
            if isinstance(candidate, dict) and candidate.get("id") and str(candidate["id"]) not in classified_ids:
                errors.append(f"plan: capability candidate {candidate['id']} is not classified or excluded")

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
            if any(match.casefold() == capability_id.casefold() for match in detailed_ids(candidate, "CAP"))
        ]
        if len(detailed_owners) != 1:
            listed = ", ".join(str(path.relative_to(docs_root)) for path in detailed_owners) or "none"
            errors.append(f"plan: capability {capability_id} must have exactly one detailed owner heading; found {listed}")
        elif detailed_owners[0] != owner_path:
            errors.append(f"plan: capability {capability_id} detailed heading is not in owner_document {owner}")
        if not any(capability_id.casefold() in candidate.casefold() for candidate in architecture.values()):
            errors.append(f"plan: capability {capability_id} is not mapped in any Architecture document")

    flows = plan.get("flows", [])
    if not isinstance(flows, list):
        errors.append("plan: flows must be an array")
        flows = []
    for flow in flows:
        if not isinstance(flow, dict) or flow.get("major") is not True:
            continue
        identifier = flow.get("id")
        owner = flow.get("owner_document")
        decision = flow.get("diagram_decision")
        reason = flow.get("diagram_reason")
        if not isinstance(identifier, str) or not re.fullmatch(r"FLOW-[A-Za-z0-9][A-Za-z0-9._-]*", identifier, re.I):
            errors.append("plan: every major flow requires a stable FLOW-* id")
            continue
        if decision not in {"required", "not-useful"} or not isinstance(reason, str) or not has_content(reason):
            errors.append(f"plan: major flow {identifier} has an unknown diagram decision or missing reason")
            continue
        if not isinstance(owner, str) or not owner:
            errors.append(f"plan: major flow {identifier} lacks owner_document")
            continue
        normalized_owner = normalized_document(owner)
        if normalized_owner not in planned:
            errors.append(f"plan: major flow {identifier} owner is not listed in plan.documents: {owner}")
        owner_path = docs_root / normalized_owner
        if not owner_path.is_file():
            errors.append(f"plan: major flow {identifier} owner does not exist: {owner}")
            continue
        section = heading_section(owner_path.read_text(encoding="utf-8"), identifier)
        if section is None:
            errors.append(f"{owner}: detailed owner does not contain flow heading {identifier}")
            continue
        errors.extend(validate_diagram_contract(section, identifier, owner))
        recorded = re.search(r"^\*\*Diagram decision:\*\*\s*(required|not-useful)\s+—\s+(.+)$", section, re.MULTILINE | re.I)
        if recorded and recorded.group(1).casefold() != decision:
            errors.append(f"{owner}: flow {identifier} diagram decision does not match the plan")
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
    business = business_texts(docs_root)
    examples: list[tuple[str, Path]] = []
    owners: list[tuple[str, Path]] = []
    for path, text in business.items():
        _, identifiers = validate_examples(text, path.relative_to(docs_root))
        examples.extend((identifier.casefold(), path) for identifier in identifiers)
        owners.extend((identifier.casefold(), path) for identifier in detailed_ids(text))
    for identifier, count in Counter(identifier for identifier, _ in examples).items():
        if count > 1:
            paths = ", ".join(str(path.relative_to(docs_root)) for value, path in examples if value == identifier)
            errors.append(f"duplicate characterization example ID {identifier}: {paths}")
    for identifier, count in Counter(identifier for identifier, _ in owners).items():
        if count > 1:
            paths = ", ".join(str(path.relative_to(docs_root)) for value, path in owners if value == identifier)
            errors.append(f"detailed heading {identifier} must have exactly one Business owner; found {paths}")
    if inventory is not None:
        errors.extend(validate_inventory(docs_root, inventory))
    if plan is not None:
        errors.extend(validate_plan(docs_root, plan))
    return errors


def write_self_test_fixture(root: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    (root / "index.md").write_text(
        f"{START}\n# Index\n\n[Business](high-level-business.md) · [Architecture](high-level-architecture.md)\n{END}\n",
        encoding="utf-8",
    )
    (root / "high-level-business.md").write_text(
        f"{START}\n# Workspace Business\n\n## Capability portfolio\n\nCAP-browse is owned by the owner module.\n\n## System journey\n\nSee the detailed module owners.\n\n## Business rules and decisions\n\nRules remain with detailed owners.\n\n## Unknowns and limitations\n\nExternal behavior is unavailable.\n\n## Evidence register\n\nEvidence is registered by each owner.\n{END}\n",
        encoding="utf-8",
    )
    (root / "owner-business.md").write_text(
        f"{START}\n# Owner Module Business\n\n> Module ID: owner@entry\n> Business role: behavior-owner\n> Parent behavior: None — owns CAP-browse\n\n## CAP-browse — Browse capability\n\n## Capability catalog\n\n## System journey\n\n## FLOW-browse — Browse process\n\n**Trigger:** request\n**Preconditions:** valid input\n**Terminal outcome:** completion is returned\n**Outcome evidence:** Observed at `owner/run#complete`\n**Alternatives/failures:** invalid input is rejected\n**Participating units:** owner and support\n**Unknowns:** external rendering unavailable\n\n**Diagram decision:** required — flowchart shows the recovery branch\n```mermaid\nflowchart TD\n  start[\"Request\"] --> result[\"Result\"]\n```\n\n### EXAMPLE-browse-success — FLOW-browse\n\n- **Given:** a valid caller request\n- **When:** the handler completes the operation\n- **Then:** the caller receives the handler completion state\n- **Evidence status:** Observed — `owner/run#complete`\n\n## RULE-owner-ready — Business rules and decisions\n\nThe request must be ready.\n\n## Unknowns and limitations\n\nExternal rendering is unavailable.\n\n## Evidence register\n\nOwner evidence is recorded above.\n{END}\n",
        encoding="utf-8",
    )
    (root / "support-business.md").write_text(
        f"{START}\n# Support Module Business\n\n> Module ID: support@entry\n> Business role: supporting-behavior\n> Parent behavior: FLOW-browse\n\n## Capability contribution\n\nSupports the parent flow without a separate value proposition.\n\n## System journey\n\n## FLOW-support — Supporting process\n\n**Diagram decision:** not-useful — the contribution is a simple linear handoff\n\n## RULE-support-valid — Business rules and decisions\n\nThe input remains valid.\n\n## Unknowns and limitations\n\nExternal behavior is unavailable.\n\n## Evidence register\n\nSupport evidence is available at `support/check#valid`.\n{END}\n",
        encoding="utf-8",
    )
    (root / "high-level-architecture.md").write_text(
        f"{START}\n# Architecture\n\nowner@entry support@entry CAP-browse FLOW-browse\n"
        "## Architectural Constraints and Invariants\n"
        "The owner module controls routing and state mutation. Consumers depend on its public contract and must not bypass the owning facade. Evidence is `owner/run#complete`.\n"
        "## Known Limitations and Evidence Gaps\n"
        "External platform rendering behavior remains outside this fixture and is explicitly unavailable.\n"
        "## Change Guardrails\n"
        "Inspect consumers before changing the owner contract, preserve state ownership and dependency direction, then run representative route, result, and error checks.\n"
        f"{END}\n",
        encoding="utf-8",
    )
    inventory = {
        "generatedBy": "self-test",
        "projects": [{"id": "_root", "modules": [
            {"id": "owner@entry", "name": "owner", "path": "owner"},
            {"id": "support@entry", "name": "support", "path": "support"},
        ]}],
    }
    plan = {
        "documents": ["index.md", "high-level-business.md", "owner-business.md", "support-business.md", "high-level-architecture.md"],
        "projects": [{"id": "_root", "modules": [
            {"id": "owner@entry", "architecture": "standalone", "businessRole": "behavior-owner", "businessOwnerDocument": "owner-business.md"},
            {"id": "support@entry", "architecture": "standalone", "businessRole": "supporting-behavior", "parentBehavior": "FLOW-browse", "businessOwnerDocument": "support-business.md"},
        ]}],
        "capabilities": [{"id": "CAP-browse", "major": True, "owner_document": "owner-business.md"}],
        "flows": [
            {"id": "FLOW-browse", "major": True, "owner_document": "owner-business.md", "diagram_decision": "required", "diagram_reason": "shows recovery"},
            {"id": "FLOW-support", "major": True, "owner_document": "support-business.md", "diagram_decision": "not-useful", "diagram_reason": "simple handoff"},
        ],
    }
    return inventory, plan


def self_test() -> int:
    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp)
        inventory, plan = write_self_test_fixture(root)
        fixture_errors = validate_tree(root, inventory, plan)
        if fixture_errors:
            print("self-test failed: valid role/example/diagram fixture rejected", file=sys.stderr)
            print("; ".join(fixture_errors), file=sys.stderr)
            return 1

    cases: list[tuple[str, str, str, str]] = [
        ("malformed example heading", "owner-business.md", "### EXAMPLE-browse-success — FLOW-browse", "### EXAMPLE-browse-success FLOW-browse"),
        ("missing Given", "owner-business.md", "- **Given:** a valid caller request\n", ""),
        ("placeholder Then", "owner-business.md", "- **Then:** the caller receives the handler completion state", "- **Then:** <observable outcome>"),
        ("missing evidence boundary", "owner-business.md", "- **Evidence status:** Observed — `owner/run#complete`", "- **Evidence status:** Observed"),
        ("duplicate FLOW owner", "support-business.md", "## FLOW-support — Supporting process", "## FLOW-browse — Duplicate process\n\n## FLOW-support — Supporting process"),
        ("duplicate RULE owner", "support-business.md", "## RULE-support-valid — Business rules and decisions", "## RULE-owner-ready — Duplicate rule\n\n## RULE-support-valid — Business rules and decisions"),
        ("role mismatch", "support-business.md", "> Business role: supporting-behavior", "> Business role: behavior-owner"),
        ("parent metadata mismatch", "support-business.md", "> Parent behavior: FLOW-browse", "> Parent behavior: FLOW-other"),
        ("unclosed Mermaid", "owner-business.md", "```\n\n### EXAMPLE", "\n\n### EXAMPLE"),
        ("empty Mermaid", "owner-business.md", "flowchart TD\n  start[\"Request\"] --> result[\"Result\"]", ""),
        ("unsupported Mermaid", "owner-business.md", "flowchart TD", "sequenceDiagram"),
        ("invalid Mermaid fence", "owner-business.md", "```mermaid", "``` mermaid"),
        ("required diagram absent", "owner-business.md", "```mermaid\nflowchart TD\n  start[\"Request\"] --> result[\"Result\"]\n```", ""),
    ]
    for label, filename, before, after in cases:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            inventory, plan = write_self_test_fixture(root)
            path = root / filename
            text = path.read_text(encoding="utf-8")
            path.write_text(text.replace(before, after, 1), encoding="utf-8")
            if not validate_tree(root, inventory, plan):
                print(f"self-test failed: {label} not detected", file=sys.stderr)
                return 1

    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp)
        inventory, plan = write_self_test_fixture(root)
        owner = (root / "owner-business.md").read_text(encoding="utf-8")
        example = re.search(r"### EXAMPLE-browse-success.*?(?=\n## )", owner, re.DOTALL)
        support = root / "support-business.md"
        support.write_text(support.read_text(encoding="utf-8").replace("\n## Unknowns", f"\n{example.group(0)}\n\n## Unknowns", 1), encoding="utf-8")
        if not any("duplicate characterization example ID" in error for error in validate_tree(root, inventory, plan)):
            print("self-test failed: duplicate example ID not detected", file=sys.stderr)
            return 1

    plan_cases: list[tuple[str, Any, str]] = [
        ("pending role", lambda plan: plan["projects"][0]["modules"][0].update({"businessRole": "pending"}), "resolved Business role"),
        ("duplicate module owner", lambda plan: plan["projects"][0]["modules"][1].update({"businessOwnerDocument": "owner-business.md"}), "assigned to multiple modules"),
        ("unplanned module owner", lambda plan: plan["documents"].remove("support-business.md"), "not listed in plan.documents"),
        ("supporting parent absent", lambda plan: plan["projects"][0]["modules"][1].pop("parentBehavior"), "requires parentBehavior"),
        ("architecture-only owner", lambda plan: plan["projects"][0]["modules"][0].update({"businessRole": "architecture-only"}), "must not have a Business owner"),
        ("unknown diagram decision", lambda plan: plan["flows"][0].update({"diagram_decision": "maybe"}), "unknown diagram decision"),
        ("missing diagram reason", lambda plan: plan["flows"][0].update({"diagram_reason": ""}), "missing reason"),
    ]
    for label, mutate, expected in plan_cases:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            inventory, plan = write_self_test_fixture(root)
            mutate(plan)
            if not any(expected in error for error in validate_tree(root, inventory, plan)):
                print(f"self-test failed: {label} not detected", file=sys.stderr)
                return 1

    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp)
        write_self_test_fixture(root)
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
