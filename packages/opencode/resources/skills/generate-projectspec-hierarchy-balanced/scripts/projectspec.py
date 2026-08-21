#!/usr/bin/env python3
"""Root-safe coordinator for ProjectSpec v2 streaming generation."""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

from document_contract import (
    END,
    START,
    HEADINGS,
    evidence_anchors,
    extract_project_metadata,
    extract_summary,
    fallback_metadata,
    generated_region,
    governance_ids,
    has_placeholder,
)

CONTRACT_VERSION = "2.0"
READINESS = {"ready", "reduced-confidence"}
EVIDENCE_STATUS = {"observed", "declared", "inferred"}


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


def metadata_paths(docs: Path) -> tuple[Path, Path, Path]:
    meta = docs / ".projectspec"
    return meta / "workspace-inventory.json", meta / "documentation-plan.json", meta / "project-scan-report.json"


def derive_plan(inventory: dict[str, Any], root: Path, output: str, revision: str) -> dict[str, Any]:
    projects = []
    documents = []
    for project in inventory.get("projects", []):
        pid = str(project.get("id"))
        slug = str(project.get("outputSlug") or pid.replace("/", "-").replace("@", "-"))
        modules = []
        for module in project.get("modules", []):
            mid = str(module.get("id") or f"{pid}@{module.get('name')}")
            path = str(module.get("path") or module.get("sourcePath") or module.get("name") or "module")
            kind = str(module.get("kind") or module.get("type") or "").casefold()
            role = module.get("businessRole") or ("behavior-owner" if kind in {"entry", "app", "hap"} or "entry" in kind else "supporting-behavior")
            detail = "standalone" if role == "behavior-owner" else "none" if role == "architecture-only" else "project-grouped"
            module_slug = str(module.get("name") or path.replace("/", "-"))
            arch = f"projects/{slug}/modules/{module_slug}/architecture.md"
            business = f"projects/{slug}/modules/{module_slug}/business.md" if detail == "standalone" else None
            modules.append({"id": mid, "name": module.get("name", path), "path": path, "type": module.get("kind") or module.get("type"), "architectureDocument": arch, "businessOwnerDocument": business, "businessRole": role, "businessDetail": detail, "analysisDepth": "standard", "entrySurfaces": module.get("entrySurfaces", []), "dependencies": [], "consumers": [], "diagramRequired": role == "behavior-owner"})
            documents.append({"path": arch, "kind": "module-architecture", "scope": mid})
            if business:
                documents.append({"path": business, "kind": "module-business", "scope": mid})
        project_record = {"id": pid, "name": project.get("name") or pid, "path": project.get("path", "."), "modules": modules, "architectureDocument": f"projects/{slug}/architecture.md", "businessDocument": f"projects/{slug}/business.md", "governanceDocument": f"projects/{slug}/constraints-and-limitations.md", "boundaryStatus": "verified", "deterministicProfile": project.get("deterministicProfile", {"structuralKind": project.get("type", "project"), "primaryTechnologies": project.get("technologies", [])})}
        projects.append(project_record)
        documents.extend([{ "path": project_record["architectureDocument"], "kind": "project-architecture", "scope": pid }, { "path": project_record["businessDocument"], "kind": "project-business", "scope": pid }, { "path": project_record["governanceDocument"], "kind": "constraints-and-limitations", "scope": pid }])
    documents.append({"path": "index.md", "kind": "index", "scope": "workspace"})
    return {"contractVersion": CONTRACT_VERSION, "repositoryRoot": str(root), "outputRoot": output, "selectedRevision": inventory.get("selectedRevision", revision), "workspaceMode": inventory.get("workspaceMode"), "projects": projects, "documents": documents, "indexDocument": "index.md", "requiresHomeGraphVerification": True}


def canonical_homegraph(value: Any) -> dict[str, str]:
    graph = value if isinstance(value, dict) else {}
    readiness = next((item for item in (graph.get("readiness"), graph.get("status")) if item in READINESS), "pending")
    status_summary = graph.get("statusSummary")
    if not status_summary and graph.get("status") not in READINESS | {"pending", None}:
        status_summary = graph.get("status")
    return {
        "readiness": readiness,
        "statusSummary": str(status_summary or ("ready" if readiness in READINESS else "pending")),
        "filesSummary": str(graph.get("filesSummary") or graph.get("files") or "pending"),
        "exploreAnchor": str(graph.get("exploreAnchor") or graph.get("explore") or "pending"),
        "revision": str(graph.get("revision") or "not-exposed"),
    }


def scopes(plan: dict[str, Any]) -> list[dict[str, Any]]:
    result = []
    for project in plan.get("projects", []):
        for module in project.get("modules", []):
            result.append({
                "id": module["id"],
                "kind": "module",
                "project": project["id"],
                "path": module["architectureDocument"],
                "documents": [module["architectureDocument"]] + ([module["businessOwnerDocument"]] if module.get("businessOwnerDocument") else []),
                "status": "pending",
            })
        result.append({
            "id": project["id"],
            "kind": "project",
            "path": project["architectureDocument"],
            "documents": [project["businessDocument"], project["architectureDocument"], project["governanceDocument"]],
            "status": "pending",
        })
    return result


def report_for(plan: dict[str, Any], inventory: dict[str, Any], old: dict[str, Any] | None = None) -> dict[str, Any]:
    report = dict(old) if isinstance(old, dict) and old.get("schemaVersion") == 4 else {}
    report.update({
        "schemaVersion": 4,
        "root": ".",
        "repositoryRoot": plan.get("repositoryRoot", inventory.get("repositoryRoot")),
        "outputRoot": plan.get("outputRoot", inventory.get("outputRoot", "docs")),
        "selectedRevision": plan.get("selectedRevision", inventory.get("selectedRevision", "HEAD")),
        "homegraph": canonical_homegraph(report.get("homegraph")),
        "scopes": report.get("scopes") or scopes(plan),
        "changedScopes": report.get("changedScopes", []),
        "unresolvedGaps": report.get("unresolvedGaps", []),
        "validationStatus": report.get("validationStatus", "pending"),
        "completed": report.get("completed", False),
    })
    return report


def resolve_roots(args: argparse.Namespace) -> tuple[Path, Path, bool]:
    if args.docs_root:
        raise ValueError("--docs-root is not supported by ProjectSpec v2; pass repository root plus --output-root")
    if not args.repository_root:
        raise ValueError("repository root is required")
    if args.output_root.is_absolute() or ".." in args.output_root.parts:
        raise ValueError("--output-root must be a repository-relative path without '..'")
    root = args.repository_root.resolve()
    docs = (root / args.output_root).resolve()
    try:
        docs.relative_to(root)
    except ValueError as error:
        raise ValueError("--output-root must resolve inside the repository root") from error
    return root, docs, False


def verify_roots(root: Path, docs: Path, *records: dict[str, Any]) -> None:
    expected_output = docs.relative_to(root).as_posix()
    for name, record in zip(("inventory", "plan", "report"), records):
        recorded_root = record.get("repositoryRoot")
        if recorded_root and Path(recorded_root).resolve() != root:
            raise ValueError(f"{name} repositoryRoot does not match requested repository root")
        if record.get("outputRoot") and str(record["outputRoot"]).replace("\\", "/") != expected_output:
            raise ValueError(f"{name} outputRoot does not match requested output root")


def project_for(plan: dict[str, Any], identifier: str) -> dict[str, Any] | None:
    return next((project for project in plan.get("projects", []) if project.get("id") == identifier), None)


def scope_for(report: dict[str, Any], kind: str, identifier: str) -> dict[str, Any] | None:
    return next((scope for scope in report.get("scopes", []) if scope.get("kind") == kind and scope.get("id") == identifier), None)


def compact_item(item: dict[str, Any], plan: dict[str, Any]) -> dict[str, Any]:
    project = project_for(plan, str(item.get("project") or item.get("id"))) or {}
    if item.get("kind") == "project":
        return {
            **item,
            "sourcePath": project.get("path"),
            "anchors": [project.get("path"), *project.get("descriptors", [])],
            "templatePath": "templates/project-architecture.md",
            "queryBudget": {"explore": 1, "fallback": 1},
            "diagramRequirement": "Project ownership and runtime Mermaid diagrams",
        }
    module = next((module for module in project.get("modules", []) if module.get("id") == item.get("id")), {})
    signals = module.get("candidateSignals", {})
    activated_topics = [
        "ownership",
        "runtime",
        *project.get("deterministicProfile", {}).get("csvBaseline", {}).get("activatedTopics", []),
        *(["state-management", "data-models"] if signals.get("stateCandidate") else []),
        *(["ui-components", "ux-navigation"] if signals.get("uxCandidate") else []),
        *(["persistence", "cache-invalidation"] if signals.get("repositoryCandidate") else []),
        *(["platform-boundary"] if signals.get("native") else []),
        *(["tests"] if signals.get("tests") else []),
    ]
    return {
        **item,
        "sourcePath": module.get("path"),
        "analysisDepth": module.get("analysisDepth"),
        "businessRole": module.get("businessRole"),
        "businessDetail": module.get("businessDetail"),
        "anchors": [module.get("path"), *module.get("entrySurfaces", [])],
        "templatePath": "templates/module-architecture.md",
        "queryBudget": {"explore": 1, "fallback": 1},
        "diagramRequirement": "One relevant Mermaid diagram" if module.get("businessRole") == "behavior-owner" else "Optional Mermaid diagram",
        "dependencies": module.get("dependencies", []),
        "consumers": module.get("consumers", []),
        "unresolvedGaps": item.get("gaps", []),
        "selfReview": ["constants and named thresholds", "implemented branches versus declarations", "lifecycle and initialization order", "failure ownership", "state ownership", "external claims"],
    }


def next_item(report: dict[str, Any], plan: dict[str, Any]) -> dict[str, Any]:
    graph = report.get("homegraph", {})
    if graph.get("readiness") not in READINESS:
        return {"kind": "homegraph-readiness", "status": "required", "anchor": first_source_anchor(plan)}
    for project in plan.get("projects", []):
        item = scope_for(report, "project", str(project.get("id")))
        if item and not complete_discovery(item.get("discovery")):
            profile = project.get("deterministicProfile", {})
            return {
                "kind": "project-discovery",
                "status": "required",
                "projectId": project.get("id"),
                "projectName": project.get("name"),
                "sourcePath": project.get("path"),
                "candidateType": profile.get("structuralKind"),
                "candidateTechnologies": profile.get("primaryTechnologies", []),
                "anchors": profile.get("evidenceAnchors", []),
                "selectedCsvFlags": profile.get("csvBaseline", {}).get("selectedFlags", []),
                "activatedTopics": profile.get("csvBaseline", {}).get("activatedTopics", []),
            }
    pending = next((item for item in report.get("scopes", []) if item.get("status") != "complete"), None)
    return compact_item(pending, plan) if pending else {"status": "complete"}


def first_source_anchor(plan: dict[str, Any]) -> str | None:
    for project in plan.get("projects", []):
        for module in project.get("modules", []):
            if module.get("path"):
                return str(module["path"])
        if project.get("path"):
            return str(project["path"])
    return None


def complete_discovery(value: Any) -> bool:
    return isinstance(value, dict) and value.get("status") == "complete" and all(value.get(key) for key in ("summary", "projectType", "architecturePattern", "technologies", "evidenceAnchors", "evidenceStatus"))


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
        if not generated_region(text).strip():
            errors.append(f"{relative}: generated region is empty")
        if kind not in {"index", "constraints-and-limitations"} and not evidence_anchors(text):
            errors.append(f"{relative}: Source Evidence lacks a concrete anchor")
        if strict and has_placeholder(text):
            errors.append(f"{relative}: unresolved placeholder")
        anchors.extend(evidence_anchors(text))
        ids.extend(governance_ids(text))
        summaries.append(extract_summary(path, text))
    return errors, {"documents": item["documents"], "summary": " ".join(summaries)[:300], "evidenceAnchors": sorted(set(anchors)), "governanceIds": sorted(set(ids)), "gaps": errors}


def reconcile_project(docs: Path, project: dict[str, Any], discovery: dict[str, Any]) -> tuple[list[str], dict[str, Any]]:
    architecture = docs / str(project.get("architectureDocument", ""))
    business = docs / str(project.get("businessDocument", ""))
    metadata = extract_project_metadata(architecture.read_text(encoding="utf-8")) if architecture.is_file() else None
    if not metadata:
        return [f"{project.get('architectureDocument')}: missing canonical Project metadata line"], {}
    conflicts = []
    if metadata["projectType"].casefold() != str(discovery.get("projectType", "")).casefold():
        conflicts.append("Project type")
    if metadata["architecturePattern"].casefold() != str(discovery.get("architecturePattern", "")).casefold():
        conflicts.append("architecture pattern")
    discovered_technologies = {str(value).casefold() for value in discovery.get("technologies", [])}
    if not discovered_technologies.issubset({value.casefold() for value in metadata["technologies"]}):
        conflicts.append("primary technologies")
    if conflicts and not metadata["supersedesDiscovery"]:
        return [f"{project.get('architectureDocument')}: metadata conflicts with discovery ({', '.join(conflicts)}); set Supersedes discovery to yes only for an evidence-backed correction"], {}
    summary = extract_summary(business, business.read_text(encoding="utf-8")) if business.is_file() else ""
    if not summary or summary == business.stem:
        return [f"{project.get('businessDocument')}: Project summary is missing or generic"], {}
    return [], {
        "summary": summary,
        "projectType": metadata["projectType"],
        "architecturePattern": metadata["architecturePattern"],
        "technologies": metadata["technologies"],
        "evidenceAnchors": sorted(set(discovery.get("evidenceAnchors", []) + evidence_anchors(architecture.read_text(encoding="utf-8")))),
        "evidenceStatus": discovery.get("evidenceStatus"),
        "source": "completed-project-documents",
        "supersededDiscovery": bool(conflicts),
    }


def run(args: argparse.Namespace) -> int:
    root, docs, legacy = resolve_roots(args)
    inventory_path, plan_path, report_path = metadata_paths(docs)
    inventory = load(inventory_path, {})
    plan = load(plan_path, {})
    if args.command == "start" and not legacy:
        if not inventory:
            print("ERROR: canonical workspace inventory is missing; rerun project_spec_analyze with the v2 output path", file=sys.stderr)
            return 1
        if not plan:
            plan = derive_plan(inventory, root, args.output_root.as_posix(), args.revision)
            atomic(plan_path, plan)
        elif plan.get("contractVersion") != CONTRACT_VERSION:
            print("ERROR: existing ProjectSpec plan is from an older contract; regenerate under v2", file=sys.stderr)
            return 1
    if legacy:
        migrated_output = docs.relative_to(root).as_posix()
        for path, record in ((inventory_path, inventory), (plan_path, plan)):
            changed = False
            if not record.get("repositoryRoot"):
                record["repositoryRoot"] = str(root)
                changed = True
            if not record.get("outputRoot"):
                record["outputRoot"] = migrated_output
                changed = True
            if changed:
                atomic(path, record)
    loaded_report = load(report_path, {})
    verify_roots(root, docs, inventory, plan, loaded_report)
    report = report_for(plan, inventory, loaded_report)
    verify_roots(root, docs, inventory, plan, report)
    if report.get("homegraph", {}).get("readiness") in READINESS and plan.get("requiresHomeGraphVerification") is True:
        plan["requiresHomeGraphVerification"] = False
        for project in plan.get("projects", []):
            if project.get("boundaryStatus") not in {"verified", "corrected-and-verified"}:
                project["boundaryStatus"] = "corrected-and-verified" if "correct" in str(project.get("boundaryStatus", "")).casefold() else "verified"
        atomic(plan_path, plan)
    if loaded_report and loaded_report.get("homegraph") != report.get("homegraph"):
        atomic(report_path, report)
    if args.command == "start":
        if not plan.get("projects"):
            print("ERROR: canonical inventory contains zero Projects", file=sys.stderr)
            return 1
        atomic(report_path, report)
        print(json.dumps({
            "schemaVersion": 4,
            "projects": len(plan.get("projects", [])),
            "modules": sum(len(project.get("modules", [])) for project in plan.get("projects", [])),
            "workspaceMode": plan.get("workspaceMode"),
            "sourceAnchor": first_source_anchor(plan),
            "nextPhase": next_item(report, plan).get("kind"),
        }, separators=(",", ":")))
        return 0
    if args.command == "graph-ready":
        if args.status not in READINESS or not all((args.status_summary, args.explore)):
            print("ERROR: --status ready|reduced-confidence, --status-summary, and --explore are all required", file=sys.stderr)
            return 1
        report["homegraph"] = {"readiness": args.status, "statusSummary": args.status_summary, "filesSummary": "not-run-by-v2", "exploreAnchor": args.explore, "revision": args.homegraph_revision}
        report["currentStep"] = "project-discovery"
        report["completedSteps"] = list(dict.fromkeys([*report.get("completedSteps", []), "homegraph-readiness"]))
        plan["requiresHomeGraphVerification"] = False
        for project in plan.get("projects", []):
            if project.get("boundaryStatus") not in {"corrected-and-verified", "verified"}:
                project["boundaryStatus"] = "corrected-and-verified" if "correct" in str(project.get("boundaryStatus", "")).casefold() else "verified"
        atomic(plan_path, plan)
        atomic(report_path, report)
        print(json.dumps({"homegraph": report["homegraph"], "nextPhase": "project-discovery"}, separators=(",", ":")))
        return 0
    if args.command == "discover":
        if report["homegraph"].get("readiness") not in READINESS:
            print("ERROR: HomeGraph readiness must complete before Project discovery", file=sys.stderr)
            return 1
        if not all((args.project, args.summary, args.project_type, args.architecture_pattern, args.evidence)) or args.evidence_status not in EVIDENCE_STATUS:
            print("ERROR: --project, --summary, --type, --architecture-pattern, --evidence, and a valid --evidence-status are required", file=sys.stderr)
            return 2
        if any(fallback_metadata(value) for value in (args.summary, args.project_type, args.architecture_pattern)) or any(fallback_metadata(value) for value in (args.technology or [])):
            print("ERROR: Project discovery fields must contain verified non-fallback metadata", file=sys.stderr)
            return 1
        project = project_for(plan, args.project)
        item = scope_for(report, "project", args.project)
        if not project or not item:
            print(f"ERROR: unknown Project {args.project}", file=sys.stderr)
            return 1
        technologies = list(dict.fromkeys([*project.get("deterministicProfile", {}).get("primaryTechnologies", []), *(args.technology or [])]))
        if not technologies:
            print("ERROR: Project discovery requires at least one verified technology", file=sys.stderr)
            return 1
        candidate_type = str(project.get("deterministicProfile", {}).get("structuralKind", ""))
        correction = args.correction or (f"{candidate_type} -> {args.project_type.strip()}" if candidate_type and candidate_type.casefold() != args.project_type.strip().casefold() else None)
        item["discovery"] = {
            "status": "complete",
            "summary": args.summary.strip(),
            "projectType": args.project_type.strip(),
            "architecturePattern": args.architecture_pattern.strip(),
            "technologies": technologies,
            "evidenceAnchors": list(dict.fromkeys(args.evidence)),
            "evidenceStatus": args.evidence_status,
            "classificationCorrection": correction,
            "deterministicProfile": project.get("deterministicProfile", {}),
        }
        if correction:
            project["boundaryStatus"] = "corrected-and-verified"
            atomic(plan_path, plan)
        report["currentStep"] = "module-documentation" if all(complete_discovery(scope.get("discovery")) for scope in report["scopes"] if scope.get("kind") == "project") else "project-discovery"
        atomic(report_path, report)
        print(json.dumps({"project": args.project, "status": "complete", "next": next_item(report, plan)}, separators=(",", ":")))
        return 0
    if args.command == "next":
        print(json.dumps(next_item(report, plan), separators=(",", ":")))
        return 0
    if args.command == "check":
        if not args.scope or ":" not in args.scope:
            print("ERROR: --scope module:<id>|project:<id> is required", file=sys.stderr)
            return 2
        kind, identifier = args.scope.split(":", 1)
        item = scope_for(report, kind, identifier)
        if not item:
            print(f"ERROR: unknown scope {args.scope}", file=sys.stderr)
            return 1
        if any(not complete_discovery(scope.get("discovery")) for scope in report["scopes"] if scope.get("kind") == "project"):
            print("ERROR: all Project discovery items must complete before document checks", file=sys.stderr)
            return 1
        if kind == "project" and any(scope.get("kind") == "module" and scope.get("project") == identifier and scope.get("status") != "complete" for scope in report["scopes"]):
            print(f"ERROR: child modules for {identifier} are incomplete", file=sys.stderr)
            return 1
        errors, facts = check_document(docs, item)
        if kind == "project" and not errors:
            project_errors, project_facts = reconcile_project(docs, project_for(plan, identifier) or {}, item.get("discovery", {}))
            errors.extend(project_errors)
            facts["project"] = project_facts
        if errors:
            print("\n".join(f"ERROR: {error}" for error in errors), file=sys.stderr)
            return 1
        validator = Path(__file__).with_name("validate_docs.py")
        validation = subprocess.run([sys.executable, str(validator), str(docs), "--inventory", str(inventory_path), "--plan", str(plan_path), "--scan-report", str(report_path), "--scope", args.scope], capture_output=True, text=True)
        if validation.returncode:
            print(validation.stderr or "ERROR: scoped document validation failed", file=sys.stderr)
            return validation.returncode
        item.update({"status": "complete", "facts": facts})
        atomic(report_path, report)
        print(json.dumps({"scope": args.scope, "status": "complete", "next": next_item(report, plan)}, separators=(",", ":")))
        return 0
    validator = Path(__file__).with_name("validate_docs.py")
    preflight = subprocess.run([sys.executable, str(validator), str(docs), "--inventory", str(inventory_path), "--plan", str(plan_path), "--scan-report", str(report_path), "--state-only"], capture_output=True, text=True)
    if preflight.returncode:
        print(preflight.stderr or "ERROR: ProjectSpec state is incomplete", file=sys.stderr)
        return preflight.returncode
    report["validationStatus"] = "pending-final"
    atomic(report_path, report)
    build_index = Path(__file__).with_name("build_index.py")
    result = subprocess.run([sys.executable, str(build_index), str(docs), "--plan", str(plan_path), "--inventory", str(inventory_path), "--scan-report", str(report_path)], capture_output=True, text=True)
    if result.returncode:
        print(result.stderr or "ERROR: index generation failed", file=sys.stderr)
        return result.returncode
    result = subprocess.run([sys.executable, str(validator), str(docs), "--inventory", str(inventory_path), "--plan", str(plan_path), "--scan-report", str(report_path), "--scope", "workspace"], capture_output=True, text=True)
    if result.returncode:
        print(result.stderr or "ERROR: strict workspace validation failed", file=sys.stderr)
        return result.returncode
    report = load(report_path, report)
    report["validationStatus"] = "complete"
    report["currentStep"] = "complete"
    report["completedSteps"] = list(dict.fromkeys([*report.get("completedSteps", []), "finish"]))
    report["changedScopes"] = []
    report["missingOutputs"] = []
    report["completed"] = True
    atomic(report_path, report)
    print(json.dumps({"status": "complete", "index": plan.get("indexDocument", "index.md")}, separators=(",", ":")))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["start", "graph-ready", "next", "discover", "check", "finish"])
    parser.add_argument("repository_root", nargs="?", type=Path)
    parser.add_argument("--output-root", type=Path, default=Path("docs"))
    parser.add_argument("--docs-root", type=Path, help=argparse.SUPPRESS)
    parser.add_argument("--revision", default="HEAD")
    parser.add_argument("--scan-level", choices=["quick", "deep", "exhaustive", "adaptive"], default="deep", help=argparse.SUPPRESS)
    parser.add_argument("--scope")
    parser.add_argument("--status")
    parser.add_argument("--status-summary")
    parser.add_argument("--files")
    parser.add_argument("--explore")
    parser.add_argument("--homegraph-revision", default="not-exposed")
    parser.add_argument("--project")
    parser.add_argument("--summary")
    parser.add_argument("--type", dest="project_type")
    parser.add_argument("--architecture-pattern")
    parser.add_argument("--technology", action="append")
    parser.add_argument("--evidence", action="append")
    parser.add_argument("--evidence-status", default="observed")
    parser.add_argument("--correction")
    args = parser.parse_args()
    try:
        return run(args)
    except (OSError, ValueError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
