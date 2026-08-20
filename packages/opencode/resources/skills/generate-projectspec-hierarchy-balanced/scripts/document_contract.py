"""Shared, deliberately small contract for balanced ProjectSpec documents."""
from __future__ import annotations

import re
from pathlib import Path

START = "<!-- PROJECTSPEC:GENERATED:START -->"
END = "<!-- PROJECTSPEC:GENERATED:END -->"
PLACEHOLDERS = ("<replace", "<path#", "Evidence pending", "TODO", "TBD")
GOVERNANCE_FIELDS = {
    "Scope", "Implementation impact / blast radius", "Evidence", "How to work with it",
    "When it applies", "What to check", "Constraint / invariant", "Basis",
    "Category", "Limitation / evidence gap", "Current handling / unknown",
}

HEADINGS = {
    "index": {"Repository Overview", "Projects", "Modules", "Start here / how to use this documentation for feature work"},
    "project-business": {"Purpose and Observable Boundary", "Actors and Main Journeys", "Module Contributions", "Business Concepts and Data", "Rules, States, Failures, and Outcomes", "Architecture and Governance Traceability", "Source Evidence"},
    "project-architecture": {"Project Boundary and Architecture", "Physical Modules and Ownership Map", "Module Responsibilities and Dependency Direction", "Cross-Module Runtime and Data Flows", "Scope Matrix", "Extension and Modification Points", "Source Evidence"},
    "module-business": {"Role in the Product", "User / Domain Flows", "Business Concepts and Data", "Rules, States, and Outcomes", "Source Evidence"},
    "module-architecture": {"Purpose and Responsibilities", "Entry, Lifecycle, and Public Contracts", "Architecture and Dependencies", "Runtime and Data Flow", "Scope Matrix", "Extension and Modification Points", "Source Evidence"},
    "constraints-and-limitations": {"Architecture Constraints and Limitations"},
}


def generated_region(text: str) -> str:
    if START in text and END in text:
        return text.split(START, 1)[1].split(END, 1)[0]
    return text


def headings(text: str) -> set[str]:
    return {m.group(1).strip() for m in re.finditer(r"^##\s+(.+?)\s*$", generated_region(text), re.M)}


def evidence_anchors(text: str) -> list[str]:
    body = re.search(r"^##\s+Source Evidence\s*$([\s\S]*?)(?=^##\s+|\Z)", generated_region(text), re.M)
    if not body:
        return []
    return re.findall(r"`([^`\n]+)`", body.group(1))


def governance_ids(text: str) -> list[str]:
    return re.findall(r"^###\s+((?:ARC|LIM)-[A-Za-z0-9][A-Za-z0-9._-]*)\b", generated_region(text), re.M)


def has_placeholder(text: str) -> bool:
    return any(value.casefold() in text.casefold() for value in PLACEHOLDERS)


def extract_summary(path: Path, text: str) -> str:
    for heading in ("Purpose and Observable Boundary", "Purpose and Responsibilities", "Role in the Product", "Repository Overview"):
        match = re.search(rf"^##\s+{re.escape(heading)}\s*$([\s\S]*?)(?=^##\s+|\Z)", generated_region(text), re.M)
        if match:
            value = re.sub(r"\s+", " ", match.group(1)).strip(" \n#")
            if value:
                return value[:240]
    return path.stem
