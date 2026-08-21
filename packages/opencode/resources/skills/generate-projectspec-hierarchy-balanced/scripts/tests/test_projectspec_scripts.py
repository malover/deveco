from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COORDINATOR = ROOT / "projectspec.py"


class TestProjectSpecV2(unittest.TestCase):
    def fixture(self) -> Path:
        root = Path(tempfile.mkdtemp(prefix="projectspec-v2-"))
        inventory = {
            "contractVersion": "2.0",
            "workspaceMode": "single-project",
            "selectedRevision": "fixture",
            "projects": [{
                "id": "_root",
                "name": "Fixture",
                "path": ".",
                "modules": [
                    {"id": "_root@entry", "name": "entry", "path": "entry", "type": "entry", "entrySurfaces": ["entry/MainAbility"]},
                    {"id": "_root@data", "name": "data", "path": "data", "type": "har"},
                ],
            }],
        }
        metadata = root / "docs" / ".projectspec"
        metadata.mkdir(parents=True)
        (metadata / "workspace-inventory.json").write_text(json.dumps(inventory), encoding="utf-8")
        return root

    def invoke(self, root: Path, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run([sys.executable, str(COORDINATOR), *args, str(root), "--output-root", "docs"], capture_output=True, text=True)

    def test_start_consumes_inventory_without_bootstrap(self) -> None:
        root = self.fixture()
        result = self.invoke(root, "start")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("bootstrap", result.stdout.lower())
        plan = json.loads((root / "docs/.projectspec/documentation-plan.json").read_text(encoding="utf-8"))
        self.assertEqual(plan["contractVersion"], "2.0")
        self.assertEqual([m["id"] for m in plan["projects"][0]["modules"]], ["_root@entry", "_root@data"])

    def test_missing_inventory_is_actionable(self) -> None:
        root = Path(tempfile.mkdtemp(prefix="projectspec-v2-missing-"))
        result = self.invoke(root, "start")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("project_spec_analyze", result.stderr)

    def test_graph_ready_has_no_files_discovery_requirement(self) -> None:
        root = self.fixture()
        self.assertEqual(self.invoke(root, "start").returncode, 0)
        result = self.invoke(root, "graph-ready", "--status", "ready", "--status-summary", "healthy", "--explore", "entry/MainAbility")
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads((root / "docs/.projectspec/project-scan-report.json").read_text(encoding="utf-8"))
        self.assertEqual(report["homegraph"]["filesSummary"], "not-run-by-v2")


if __name__ == "__main__":
    unittest.main()
