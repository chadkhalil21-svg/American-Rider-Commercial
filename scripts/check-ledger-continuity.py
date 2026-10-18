#!/usr/bin/env python3
"""Fail PRs that alter major American Rider authority without updating its ledger.

Evidence-sensitive, offline. Does NOT claim GitHub can automatically discover
new provider activity or running deployments outside a PR.
"""
from __future__ import annotations
import re
import subprocess
import sys
from pathlib import Path

CRITICAL_EXACT = {
    "AGENTS.md", ".github/copilot-instructions.md", "firestore.rules",
    "firestore.indexes.json", "backend/server.js", "backend/booking.js",
    "backend/place-search.js", "backend/official-toll-pricing.js",
    "backend/tolls.js", "backend/regions.js", "backend/economics.js",
    "backend/fareauthority.js", "backend/matching.js",
    "backend/qualification.js", "backend/geooperators.js",
}
CRITICAL_PREFIXES = (
    "infra/photon/", ".github/workflows/cloud-run",
    "backend/insurance-", "backend/screening-",
    "backend/external-screening", "backend/market-readiness",
    "backend/stripe-", "backend/payments", "backend/payout",
    "backend/scheduled", "backend/dispatch",
)
STATUS_TABLE_START = "## CURRENT COMMERCIAL REPOSITORY: VERIFIED STATUS SNAPSHOT"
TABLE_END = "**Binding maintenance instruction:**"


def affects_major_area(path: str) -> bool:
    return path in CRITICAL_EXACT or path.startswith(CRITICAL_PREFIXES)


def ledger_has_required_records(base_text: str, updated_text: str) -> bool:
    """Require a fresh dated entry AND a changed current-status table, not only history."""
    if STATUS_TABLE_START not in updated_text or TABLE_END not in updated_text:
        return False
    if base_text == updated_text:
        return False
    old_before = base_text.split(STATUS_TABLE_START, 1)[0]
    new_before = updated_text.split(STATUS_TABLE_START, 1)[0]
    if new_before == old_before:
        return False
    old_table = (base_text.split(STATUS_TABLE_START, 1)[1]
                 .split(TABLE_END, 1)[0]) if STATUS_TABLE_START in base_text and TABLE_END in base_text else ""
    new_table = updated_text.split(STATUS_TABLE_START, 1)[1].split(TABLE_END, 1)[0]
    return old_table != new_table and any(line.startswith("| ") for line in new_table.splitlines())


def git(*args: str) -> str:
    return subprocess.check_output(("git", *args), text=True, stderr=subprocess.STDOUT)


def main(base: str, head: str) -> int:
    try:
        changed = [p for p in git("diff", "--name-only", base, head).splitlines() if p]
        material = sorted(p for p in changed if affects_major_area(p))
        if not material:
            print("Ledger continuity: no critical authority files changed; no required update.")
            return 0
        if "PROJECT-LEDGER.md" not in changed:
            print("ERROR: Major authority changed, but PROJECT-LEDGER.md did not.", file=sys.stderr)
            print("\n".join(material), file=sys.stderr)
            return 1
        old = git("show", f"{base}:PROJECT-LEDGER.md")
        new = git("show", f"{head}:PROJECT-LEDGER.md")
        if not ledger_has_required_records(old, new):
            print("ERROR: Update BOTH newest ledger entry and CURRENT STATUS TABLE.", file=sys.stderr)
            return 1
        print(f"PASS: ledger newest record + current status reconciled for {len(material)} critical paths")
        return 0
    except (subprocess.CalledProcessError, OSError) as exc:
        print(f"ERROR: Could not verify ledger continuity: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    if len(sys.argv) != 3 or not all(re.fullmatch(r"[0-9a-f]{40}", x) for x in sys.argv[1:]):
        print("Usage: check-ledger-continuity.py BASE_SHA HEAD_SHA", file=sys.stderr)
        sys.exit(2)
    sys.exit(main(sys.argv[1], sys.argv[2]))
