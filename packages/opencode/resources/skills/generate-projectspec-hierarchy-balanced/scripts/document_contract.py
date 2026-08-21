"""Shared structural contract for balanced ProjectSpec v2 documents."""
from __future__ import annotations

import re
from pathlib import Path

START = "<!-- PROJECTSPEC:GENERATED:START -->"
END = "<!-- PROJECTSPEC:GENERATED:END -->"
CONTRACT_VERSION = "2.0"
PLACEHOLDERS = ("<replace", "<path#", "Evidence pending", "TODO", "TBD")
FALLBACK_METADATA = {"", "—", "pending", "not recorded", "mixed or unclassified", "unknown", "see project business", "see the validated project documents for the repository overview and evidence-backed detail."}
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


def mermaid_blocks(text: str) -> list[str]:
    return re.findall(r"```mermaid\s*\n(.*?)\n```", generated_region(text), re.DOTALL | re.IGNORECASE)


def truncate_summary(value: str, limit: int = 240) -> str:
    value = re.sub(r"\s+", " ", value).strip()
    if len(value) <= limit:
        return value
    clipped = value[:limit].rsplit(" ", 1)[0].rstrip(" ,;:-")
    return clipped + ("." if clipped and clipped[-1] not in ".!?" else "")


def extract_summary(path: Path, text: str) -> str:
    for heading in ("Purpose and Observable Boundary", "Purpose and Responsibilities", "Role in the Product", "Repository Overview"):
        match = re.search(rf"^##\s+{re.escape(heading)}\s*$([\s\S]*?)(?=^##\s+|\Z)", generated_region(text), re.M)
        if match:
            value = re.sub(r"\s+", " ", match.group(1)).strip(" \n#")
            if value:
                return truncate_summary(value)
    return path.stem


def fallback_metadata(value: str) -> bool:
    return value.strip().casefold() in FALLBACK_METADATA


def extract_project_metadata(text: str) -> dict[str, object] | None:
    match = re.search(
        r"^>\s*Project metadata:\s*\*\*Type:\*\*\s*`([^`]+)`\s*·\s*\*\*Architecture pattern:\*\*\s*`([^`]+)`\s*·\s*\*\*Primary technologies:\*\*\s*(.+?)\s*·\s*\*\*Supersedes discovery:\*\*\s*`(yes|no)`\s*$",
        generated_region(text),
        re.M | re.I,
    )
    if not match:
        return None
    technologies = [value.strip() for value in re.findall(r"`([^`]+)`", match.group(3)) if value.strip()]
    if fallback_metadata(match.group(1)) or fallback_metadata(match.group(2)) or not technologies or any(fallback_metadata(value) for value in technologies):
        return None
    return {
        "projectType": match.group(1).strip(),
        "architecturePattern": match.group(2).strip(),
        "technologies": technologies,
        "supersedesDiscovery": match.group(4).casefold() == "yes",
    }
