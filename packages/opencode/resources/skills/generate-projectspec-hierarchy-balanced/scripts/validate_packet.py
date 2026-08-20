#!/usr/bin/env python3
"""Validate the compact evidence packet used by document generation."""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

STATUSES = {"observed", "declared", "inferred", "unavailable", "not inspected", "llm-only", "csv-baseline-only"}
ROLES = {"behavior-owner", "supporting-behavior", "architecture-only"}
DETAILS = {"standalone", "project-grouped", "none"}
DEPTHS = {"focused", "standard", "deep"}
RAW_KEYS = {"raw", "rawsource", "rawgraph", "sourcedump", "graphresponse", "sourcepayload", "graphpayload", "source", "graph", "response"}
SECRET_KEYS = re.compile(r"(?:secret|token|password|credential|private[_-]?key|signing[_-]?material)", re.IGNORECASE)


def load(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"{path}: invalid JSON: {error}") from error
    if not isinstance(value, dict):
        raise ValueError(f"{path}: expected a JSON object")
    return value


def walk_values(value: Any, location: str = "$"):
    if isinstance(value, dict):
        for key, child in value.items():
            yield location, str(key), child
            yield from walk_values(child, f"{location}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from walk_values(child, f"{location}[{index}]")


def validate_claims(value: Any, location: str) -> list[str]:
    errors: list[str] = []
    if not isinstance(value, list):
        return [f"{location}: expected an array"]
    for index, claim in enumerate(value):
        at = f"{location}[{index}]"
        if not isinstance(claim, dict):
            errors.append(f"{at}: expected an object")
            continue
        for field in ("claim", "status", "anchor", "scope"):
            if not isinstance(claim.get(field), str) or not claim[field].strip():
                errors.append(f"{at}: {field} must be a non-empty string")
        if claim.get("status") not in STATUSES:
            errors.append(f"{at}: status must be one of {sorted(STATUSES)}")
    return errors


def validate_module(module: dict[str, Any], location: str) -> list[str]:
    errors: list[str] = []
    for field in ("moduleId", "responsibility", "businessRole", "businessDetail", "analysisDepth"):
        if not isinstance(module.get(field), str) or not module[field].strip():
            errors.append(f"{location}: {field} must be a non-empty string")
    if module.get("businessRole") not in ROLES:
        errors.append(f"{location}: invalid businessRole {module.get('businessRole')!r}")
    if module.get("businessDetail") not in DETAILS:
        errors.append(f"{location}: invalid businessDetail {module.get('businessDetail')!r}")
    if module.get("analysisDepth") not in DEPTHS:
        errors.append(f"{location}: invalid analysisDepth {module.get('analysisDepth')!r}")
    for field in ("nonResponsibilities", "entrySurfaces", "dependencies", "consumers", "flows", "detectedTopics", "stateDataOwners", "integrations", "referencePatterns", "arcLimCandidates", "unknowns"):
        if field in module and not isinstance(module[field], list):
            errors.append(f"{location}: {field} must be an array")
    errors.extend(validate_claims(module.get("evidence"), f"{location}.evidence"))
    completeness = module.get("completeness")
    if not isinstance(completeness, dict):
        errors.append(f"{location}: completeness must be an object")
    return errors


def validate_packet(packet: dict[str, Any], plan: dict[str, Any] | None = None) -> list[str]:
    errors: list[str] = []
    if packet.get("schemaVersion") not in {1, 2}:
        errors.append("packet: schemaVersion must be 1 or 2")
    modules = packet.get("modules")
    if modules is None:
        modules = [packet]
    if not isinstance(modules, list) or not modules:
        errors.append("packet: modules must be a non-empty array")
        modules = []
    for index, module in enumerate(modules):
        if isinstance(module, dict):
            errors.extend(validate_module(module, f"packet.modules[{index}]"))
        else:
            errors.append(f"packet.modules[{index}]: expected an object")
    if "modules" in packet and (not isinstance(packet.get("projectId"), str) or not packet["projectId"].strip()):
        errors.append("packet: projectId must identify a project packet")
    for location, key, value in walk_values(packet):
        if key.casefold() in RAW_KEYS:
            errors.append(f"{location}.{key}: raw graph/source payloads are not allowed")
        if SECRET_KEYS.search(key):
            errors.append(f"{location}.{key}: secret-like fields are not allowed")
        if isinstance(value, str) and SECRET_KEYS.search(value):
            errors.append(f"{location}.{key}: secret-like content is not allowed")
    if plan:
        projects = {str(project.get("id")): project for project in plan.get("projects", []) if isinstance(project, dict)}
        packet_project = packet.get("projectId")
        if packet_project and packet_project not in projects:
            errors.append(f"packet: projectId {packet_project!r} is not present in plan")
        allowed = {str(module.get("id")) for project in projects.values() for module in project.get("modules", []) if isinstance(module, dict)}
        for index, module in enumerate(modules):
            if isinstance(module, dict) and module.get("moduleId") not in allowed:
                errors.append(f"packet.modules[{index}]: moduleId {module.get('moduleId')!r} is not present in plan")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("packet", type=Path)
    parser.add_argument("--plan", type=Path)
    args = parser.parse_args()
    try:
        packet = load(args.packet.resolve())
        plan = load(args.plan.resolve()) if args.plan else None
    except ValueError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    errors = validate_packet(packet, plan)
    if errors:
        print("\n".join(f"ERROR: {error}" for error in errors), file=sys.stderr)
        return 1
    print(f"Validated evidence packet {args.packet}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
