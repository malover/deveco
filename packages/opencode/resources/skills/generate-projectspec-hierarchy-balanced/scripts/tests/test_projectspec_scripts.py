from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BOOTSTRAP = ROOT / "bootstrap_projectspec.mjs"
PACKET = ROOT / "validate_packet.py"
RENDER = ROOT / "render_documents.py"
INDEX = ROOT / "build_index.py"
VALIDATE = ROOT / "validate_docs.py"


def write(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value, encoding="utf-8")


class ProjectSpecScriptsTest(unittest.TestCase):
    def fixture(self) -> Path:
        directory = Path(tempfile.mkdtemp(prefix="projectspec-balanced-"))
        write(directory / "build-profile.json5", "{ modules: [{ name: 'entry', srcPath: 'entry' }, { name: 'data', srcPath: 'data' }] }")
        write(directory / "package.json", '{ "workspaces": ["entry", "data"] }')
        write(directory / "entry" / "build-profile.json5", "{ modules: [] }")
        write(directory / "entry" / "module.json5", "{ module: { name: 'entry', type: 'entry', abilities: [{ name: 'EntryAbility', srcEntry: './ets/entryability/EntryAbility.ets' }], requestPermissions: [{ name: 'ohos.permission.INTERNET' }] } }")
        write(directory / "data" / "module.json5", "{ module: { name: 'data', type: 'har' } }")
        write(directory / "entry" / "oh-package.json5", "{ name: '@fixture/entry', dependencies: { '@fixture/data': '../data' } }")
        write(directory / "data" / "oh-package.json5", "{ name: '@fixture/data' }")
        write(directory / "entry" / "src" / "main" / "ets" / "Entry.ets", "export function entry() { return 1 }\n")
        write(directory / "data" / "src" / "main" / "ets" / "Repository.ets", "export class Repository {}\n")
        return directory

    def bootstrap(self, directory: Path) -> dict:
        result = subprocess.run(["node", str(BOOTSTRAP), str(directory), "--output-root", "docs", "--revision", "test-revision", "--scan-level", "deep"], capture_output=True, text=True, check=True)
        return json.loads(result.stdout)

    def test_nested_modules_and_resume_checkpoint(self) -> None:
        directory = self.fixture()
        self.bootstrap(directory)
        metadata = directory / "docs" / ".projectspec"
        inventory = json.loads((metadata / "workspace-inventory.json").read_text(encoding="utf-8"))
        self.assertEqual(inventory["workspaceMode"], "single-project")
        self.assertEqual(len(inventory["projects"]), 1)
        self.assertEqual({module["path"] for module in inventory["projects"][0]["modules"]}, {"data", "entry"})
        self.assertEqual(len(inventory["dependencies"]), 1)
        self.assertEqual(inventory["dependencies"][0]["providerModule"].split("@", 1)[0], "data")
        evidence_plan = json.loads((metadata / "evidence-plan.json").read_text(encoding="utf-8"))
        self.assertEqual({item["selectedDepth"] for item in evidence_plan["modules"]}, {"focused", "standard"})
        self.bootstrap(directory)
        report = json.loads((metadata / "project-scan-report.json").read_text(encoding="utf-8"))
        self.assertTrue(report["resume"]["reusedCheckpoint"])
        self.assertEqual(report["resume"]["changedModules"], [])

    def test_packet_renderer_index_and_validation_are_deterministic(self) -> None:
        directory = self.fixture()
        self.bootstrap(directory)
        metadata = directory / "docs" / ".projectspec"
        plan_path = metadata / "documentation-plan.json"
        inventory_path = metadata / "workspace-inventory.json"
        plan = json.loads(plan_path.read_text(encoding="utf-8"))
        plan["requiresHomeGraphVerification"] = False
        for project in plan["projects"]:
            project["boundaryStatus"] = "verified"
        plan_path.write_text(json.dumps(plan, indent=2), encoding="utf-8")
        modules = []
        for project in plan["projects"]:
            for module in project["modules"]:
                modules.append({
                    "moduleId": module["id"],
                    "responsibility": f"Responsibility for {module['path']}",
                    "nonResponsibilities": [],
                    "businessRole": module["businessRole"],
                    "businessDetail": module["businessDetail"],
                    "businessRationale": ["fixture"],
                    "analysisDepth": module["analysisDepth"],
                    "analysisPasses": [{"kind": "ownership-runtime", "anchors": [module["path"]], "resolved": ["boundary"]}],
                    "entrySurfaces": module["entrySurfaces"],
                    "dependencies": module["dependencies"],
                    "consumers": module["consumers"],
                    "flows": [],
                    "detectedTopics": [],
                    "stateDataOwners": [],
                    "integrations": [],
                    "referenceSearchPerformed": False,
                    "referencePatterns": [],
                    "scopeMatrix": {"ownership": "fixture", "runtime": "fixture", "stateData": "fixture", "contract": "fixture"},
                    "diagramDecision": {"architecture": "not-useful", "business": "not-useful", "reason": "fixture"},
                    "arcLimCandidates": [],
                    "evidence": [{"claim": "fixture boundary", "status": "observed", "anchor": module["path"], "scope": "module"}],
                    "unknowns": [],
                    "completeness": {"boundary": "complete", "runtime": "complete", "stateData": "not-applicable", "business": "complete", "extension": "complete", "evidence": "complete"},
                })
        packet_path = metadata / "analysis" / "fixture.json"
        packet_path.parent.mkdir(parents=True, exist_ok=True)
        packet_path.write_text(json.dumps({"schemaVersion": 2, "projectId": plan["projects"][0]["id"], "modules": modules}, indent=2), encoding="utf-8")
        valid = subprocess.run([sys.executable, str(PACKET), str(packet_path), "--plan", str(plan_path)], capture_output=True, text=True)
        self.assertEqual(valid.returncode, 0, valid.stderr)
        subprocess.run([sys.executable, str(RENDER), str(directory / "docs"), "--plan", str(plan_path), "--inventory", str(inventory_path), "--packet", str(packet_path)], check=True)
        index_path = directory / "docs" / "index.md"
        index_path.write_text(index_path.read_text(encoding="utf-8").replace("# Documentation Index", "# Preserved narrative"), encoding="utf-8")
        subprocess.run([sys.executable, str(RENDER), str(directory / "docs"), "--plan", str(plan_path), "--inventory", str(inventory_path), "--packet", str(packet_path)], check=True)
        self.assertIn("# Preserved narrative", index_path.read_text(encoding="utf-8"))
        subprocess.run([sys.executable, str(INDEX), str(directory / "docs"), "--plan", str(plan_path), "--inventory", str(inventory_path), "--packet", str(packet_path)], check=True)
        checked = subprocess.run([sys.executable, str(VALIDATE), str(directory / "docs"), "--plan", str(plan_path), "--inventory", str(inventory_path), "--packet", str(packet_path)], capture_output=True, text=True)
        self.assertEqual(checked.returncode, 0, checked.stderr)
        index = (directory / "docs" / "index.md").read_text(encoding="utf-8")
        self.assertEqual(index.count("PROJECTSPEC:GENERATED:START"), 1)
        self.assertNotIn("broken", index)

    def test_malformed_packet_fails_without_silent_fallback(self) -> None:
        directory = Path(tempfile.mkdtemp(prefix="projectspec-packet-"))
        packet = directory / "packet.json"
        packet.write_text("{", encoding="utf-8")
        result = subprocess.run([sys.executable, str(PACKET), str(packet)], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("invalid JSON", result.stderr)


if __name__ == "__main__":
    unittest.main()
