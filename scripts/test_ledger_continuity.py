"""Offline regressions for critical-change ledger record requirements."""
import importlib.util
from pathlib import Path
import unittest

SCRIPT = Path(__file__).parent / "check-ledger-continuity.py"
spec = importlib.util.spec_from_file_location("ledger_check", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

ORIGINAL = """# AMERICAN RIDER — CANONICAL PROJECT LEDGER
old progress
## CURRENT COMMERCIAL REPOSITORY: VERIFIED STATUS SNAPSHOT
| Function / release item | Proven status | What remains |
| --- | --- | --- |
| Cloud Run staging | source only | auth pending |
**Binding maintenance instruction:** Keep statuses current.
"""
NEW = """# AMERICAN RIDER — CANONICAL PROJECT LEDGER
## Current commissioning update — 2026-10-18
Project selected; billing enabled; API enable succeeded; not a running service.
old progress
## CURRENT COMMERCIAL REPOSITORY: VERIFIED STATUS SNAPSHOT
| Function / release item | Proven status | What remains |
| --- | --- | --- |
| Cloud Run staging | APIs enabled | Workload Identity + deployment pending |
**Binding maintenance instruction:** Keep statuses current.
"""
HISTORY_ONLY = """# AMERICAN RIDER — CANONICAL PROJECT LEDGER
## New decision
old progress
## CURRENT COMMERCIAL REPOSITORY: VERIFIED STATUS SNAPSHOT
| Function / release item | Proven status | What remains |
| --- | --- | --- |
| Cloud Run staging | source only | auth pending |
**Binding maintenance instruction:** Keep statuses current.
"""
TABLE_ONLY = """# AMERICAN RIDER — CANONICAL PROJECT LEDGER
old progress
## CURRENT COMMERCIAL REPOSITORY: VERIFIED STATUS SNAPSHOT
| Function / release item | Proven status | What remains |
| --- | --- | --- |
| Cloud Run staging | APIs enabled | auth pending |
**Binding maintenance instruction:** Keep statuses current.
"""

class LedgerContinuityTest(unittest.TestCase):
    def test_critical_paths(self):
        for p in ["backend/server.js", "backend/tolls.js", "backend/official-toll-pricing.js",
                  "infra/photon/connect-cloudrun.sh", ".github/workflows/cloud-run-staging.yml",
                  "firestore.indexes.json", "AGENTS.md", "backend/insurance-jurisdictions.js"]:
            self.assertTrue(module.affects_major_area(p), p)

    def test_noncritical_paths(self):
        for p in ["docs/audits/old-note.md", "README.md", "app/temporary-caption.tsx",
                  ".github/workflows/ledger-continuity.yml", "scripts/README.md"]:
            self.assertFalse(module.affects_major_area(p), p)

    def test_newest_and_status_both_required(self):
        self.assertTrue(module.ledger_has_required_records(ORIGINAL, NEW))
        self.assertFalse(module.ledger_has_required_records(ORIGINAL, HISTORY_ONLY))
        self.assertFalse(module.ledger_has_required_records(ORIGINAL, TABLE_ONLY))
        self.assertFalse(module.ledger_has_required_records(ORIGINAL, ORIGINAL))
        self.assertFalse(module.ledger_has_required_records(ORIGINAL, "No ledger"))

if __name__ == "__main__":
    unittest.main()
