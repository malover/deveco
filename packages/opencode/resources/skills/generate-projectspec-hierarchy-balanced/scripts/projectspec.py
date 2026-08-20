#!/usr/bin/env python3
"""Compact schema-v3 coordinator for streaming ProjectSpec generation."""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

from document_contract import END, START, evidence_anchors, extract_summary, generated_region, governance_ids, has_placeholder, HEADINGS


def load(path: Path, default: Any = None) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def atomic(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def paths(docs: Path) -> tuple[Path, Path, Path]:
    meta = docs / ".projectspec"
    return meta / "workspace-inventory.json", meta / "documentation-plan.json", meta / "project-scan-report.json"


def scopes(plan: dict[str, Any]) -> list[dict[str, Any]]:
    result = []
    for project in plan.get("projects", []):
        for module in project.get("modules", []):
            result.append({"id": module["id"], "kind": "module", "project": project["id"], "path": module["architectureDocument"], "documents": [module["architectureDocument"]] + ([module["businessOwnerDocument"]] if module.get("businessOwnerDocument") else []), "status": "pending"})
        result.append({"id": project["id"], "kind": "project", "path": project["architectureDocument"], "documents": [project["businessDocument"], project["architectureDocument"], project["governanceDocument"]], "status": "pending"})
    return result


def report_for(docs: Path, plan: dict[str, Any], inventory: dict[str, Any], old: dict[str, Any] | None = None) -> dict[str, Any]:
    report = old if isinstance(old, dict) and old.get("schemaVersion") == 3 else {}
    report.update({"schemaVersion": 3, "root": ".", "selectedRevision": plan.get("selectedRevision", inventory.get("selectedRevision", "HEAD")), "homegraph": report.get("homegraph", {"status": "pending", "files": "pending", "explore": "pending", "revision": "not-exposed"}), "scopes": report.get("scopes") or scopes(plan), "changedScopes": report.get("changedScopes", []), "unresolvedGaps": report.get("unresolvedGaps", []), "validationStatus": report.get("validationStatus", "pending"), "completed": report.get("completed", False)})
    return report


def check_document(docs: Path, item: dict[str, Any], strict: bool = False) -> tuple[list[str], dict[str, Any]]:
    errors: list[str] = []
    anchors: list[str] = []
    ids: list[str] = []
    summaries: list[str] = []
    for relative in item["documents"]:
        path = docs / relative
        if not path.is_file():
            errors.append(f"missing document: {relative}")
            continue
        text = path.read_text(encoding="utf-8")
        module_path = relative.startswith("modules/") or "/modules/" in relative
        kind = "constraints-and-limitations" if path.name == "constraints-and-limitations.md" else ("module-business" if path.name == "business.md" and module_path else "project-business" if path.name == "business.md" else "module-architecture" if module_path else "project-architecture")
        if text.count(START) != 1 or text.count(END) != 1:
            errors.append(f"{relative}: generated markers must occur exactly once")
        missing = HEADINGS.get(kind, set()) - {line[3:].strip() for line in generated_region(text).splitlines() if line.startswith("## ")}
        errors.extend(f"{relative}: missing heading {heading}" for heading in sorted(missing))
        if kind not in {"index", "constraints-and-limitations"} and not evidence_anchors(text):
            errors.append(f"{relative}: Source Evidence lacks a concrete anchor")
        if strict and has_placeholder(text):
            errors.append(f"{relative}: unresolved placeholder")
        if kind == "constraints-and-limitations" and not governance_ids(text):
            errors.append(f"{relative}: governance has no ARC-* or LIM-* entries")
        anchors.extend(evidence_anchors(text)); ids.extend(governance_ids(text)); summaries.append(extract_summary(path, text))
    return errors, {"documents": item["documents"], "summary": " ".join(summaries)[:300], "evidenceAnchors": sorted(set(anchors)), "governanceIds": sorted(set(ids)), "gaps": errors}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["start", "graph-ready", "next", "check", "finish"])
    parser.add_argument("docs_root", type=Path)
    parser.add_argument("--scope")
    parser.add_argument("--status")
    parser.add_argument("--revision")
    parser.add_argument("--files")
    parser.add_argument("--explore")
    parser.add_argument("--homegraph-revision", default="not-exposed")
    args = parser.parse_args()
    docs = args.docs_root.resolve(); inventory_path, plan_path, report_path = paths(docs)
    inventory = load(inventory_path, {}); plan = load(plan_path, {})
    if args.command == "start":
        report = report_for(docs, plan, inventory, load(report_path))
        atomic(report_path, report)
        pending = next((item for item in report["scopes"] if item["status"] != "complete"), None)
        print(json.dumps({"schemaVersion": 3, "projects": len(plan.get("projects", [])), "modules": sum(len(p.get("modules", [])) for p in plan.get("projects", [])), "firstPending": pending}, separators=(",", ":")))
        return 0
    report = report_for(docs, plan, inventory, load(report_path))
    if args.command == "graph-ready":
        if not all((args.status, args.files, args.explore)):
            print("ERROR: --status, --files, and --explore are all required", file=sys.stderr); return 1
        report["homegraph"].update({"status": args.status, "files": args.files, "explore": args.explore, "revision": args.homegraph_revision})
        if not all(report["homegraph"].get(key) not in {None, "pending", "failed"} for key in ("status", "files", "explore")):
            print("ERROR: all three HomeGraph readiness records are required", file=sys.stderr); return 1
        atomic(report_path, report); print(json.dumps(report["homegraph"], separators=(",", ":"))); return 0
    if args.command == "next":
        pending = next((item for item in report["scopes"] if item["status"] != "complete"), None)
        print(json.dumps(pending or {"status": "complete"}, separators=(",", ":"))); return 0
    if args.command == "check":
        if not args.scope or ":" not in args.scope: print("ERROR: --scope module:<id>|project:<id> is required", file=sys.stderr); return 2
        kind, identifier = args.scope.split(":", 1)
        item = next((scope for scope in report["scopes"] if scope["kind"] == kind and scope["id"] == identifier), None)
        if not item: print(f"ERROR: unknown scope {args.scope}", file=sys.stderr); return 1
        if kind == "project" and any(scope["kind"] == "module" and scope["project"] == identifier and scope["status"] != "complete" for scope in report["scopes"]):
            print(f"ERROR: child modules for {identifier} are incomplete", file=sys.stderr); return 1
        errors, facts = check_document(docs, item, strict=False)
        if errors: print("\n".join(f"ERROR: {error}" for error in errors), file=sys.stderr); return 1
        validator = Path(__file__).with_name("validate_docs.py")
        validation = subprocess.run([sys.executable, str(validator), str(docs), "--inventory", str(inventory_path), "--plan", str(plan_path), "--scan-report", str(report_path), "--scope", args.scope], capture_output=True, text=True)
        if validation.returncode:
            print(validation.stderr or "ERROR: scoped document validation failed", file=sys.stderr); return validation.returncode
        item.update({"status": "complete", "facts": facts}); atomic(report_path, report)
        print(json.dumps({"scope": args.scope, "status": "complete", "next": next((s for s in report["scopes"] if s["status"] != "complete"), None)}, separators=(",", ":"))); return 0
    if report["homegraph"].get("status") in {None, "pending", "failed"}: print("ERROR: HomeGraph readiness is incomplete", file=sys.stderr); return 1
    if any(scope["status"] != "complete" for scope in report["scopes"]): print("ERROR: incomplete scopes remain", file=sys.stderr); return 1
    report["validationStatus"] = "strict-pending"
    build_index = Path(__file__).with_name("build_index.py")
    result = subprocess.run([sys.executable, str(build_index), str(docs), "--plan", str(plan_path), "--inventory", str(inventory_path), "--scan-report", str(report_path)], capture_output=True, text=True)
    if result.returncode:
        print(result.stderr or "ERROR: index generation failed", file=sys.stderr); return result.returncode
    validator = Path(__file__).with_name("validate_docs.py")
    result = subprocess.run([sys.executable, str(validator), str(docs), "--inventory", str(inventory_path), "--plan", str(plan_path), "--scan-report", str(report_path), "--scope", "workspace"], capture_output=True, text=True)
    if result.returncode:
        print(result.stderr or "ERROR: strict workspace validation failed", file=sys.stderr); return result.returncode
    report["validationStatus"] = "complete"; report["completed"] = True; atomic(report_path, report)
    print(json.dumps({"status": "complete", "index": plan.get("indexDocument", "index.md")}, separators=(",", ":"))); return 0


if __name__ == "__main__":
    raise SystemExit(main())
