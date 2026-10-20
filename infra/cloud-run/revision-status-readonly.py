#!/usr/bin/env python3
"""READ-ONLY Cloud Run revision diagnostic. Never print environment values, raw
condition messages, user data, service credentials, or Google CLI stderr.
Does not build, redeploy, shift traffic, touch scheduler or move money.
"""
import json
import os
import re
import subprocess

PROJECT = "american-rider-35688"
REGION = "us-east1"
SERVICE = "american-rider-api-production"


def safe_name(value):
    value = str(value or "")
    return value if re.fullmatch(r"[a-zA-Z0-9_.-]{1,140}", value) else "unavailable"


def cmd_json(*args):
    try:
        p = subprocess.run(["gcloud", "--quiet", *args, "--format=json"],
                           stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                           timeout=55, check=False)
        if p.returncode:
            return None
        return json.loads(p.stdout.decode("utf-8", "replace"))
    except (OSError, subprocess.TimeoutExpired, ValueError, TypeError):
        return None


def summarize(service, revisions):
    """Pure, synthetic-testable, strictly nonsecret revision health output."""
    if not isinstance(service, dict):
        return ["Cloud Run production metadata: UNAVAILABLE; verify deployer read access."]
    status = service.get("status") or {}
    created = safe_name(status.get("latestCreatedRevisionName"))
    ready = safe_name(status.get("latestReadyRevisionName"))
    rows = [
        "Google Cloud Run production revision diagnosis (read-only)",
        "Latest CREATED revision: " + created,
        "Latest READY revision: " + ready,
    ]
    traffic = status.get("traffic") or []
    for row in traffic:
        if row.get("percent") == 100:
            rows.append("Current 100% traffic: " + safe_name(row.get("revisionName")))
    if created != "unavailable" and ready != "unavailable" and created != ready:
        rows.append("Newer revision not yet READY; review its condition reason and Cloud Run revision logs.")
    elif created == ready and created != "unavailable":
        rows.append("Created/ready service pointer agrees; separate deploy readiness check may be stale.")
    if not isinstance(revisions, list):
        rows.append("Revision list UNAVAILABLE (permission/CLI); no readiness inference.")
        return rows
    # The Google API may not order revisions consistently. Sort by existing timestamps.
    newest = sorted([r for r in revisions if isinstance(r, dict)],
                    key=lambda r: str((r.get("metadata") or {}).get("creationTimestamp") or ""),
                    reverse=True)[:6]
    for item in newest:
        metadata = item.get("metadata") or {}
        name = safe_name(metadata.get("name"))
        conditions = (item.get("status") or {}).get("conditions") or []
        summary = []
        for condition in conditions:
            if condition.get("type") not in ("Ready", "ContainerHealthy", "ResourcesAvailable", "Active"):
                continue
            typ = safe_name(condition.get("type"))
            state = safe_name(condition.get("status"))
            reason = safe_name(condition.get("reason") or "unspecified")
            summary.append(typ + "=" + state + "(" + reason + ")")
        rows.append("Revision " + name + ": " + (", ".join(summary) if summary else "no classified conditions"))
    rows.append("No traffic, secrets, Scheduler settings or Stripe operations changed.")
    return rows


def main():
    service = cmd_json("run", "services", "describe", SERVICE,
                       "--project=" + PROJECT, "--region=" + REGION)
    revisions = cmd_json("run", "revisions", "list",
                         "--service=" + SERVICE,
                         "--project=" + PROJECT, "--region=" + REGION,
                         "--limit=10")
    rows = summarize(service, revisions)
    print("\n".join(rows))
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with open(path, "a", encoding="utf-8") as f:
            f.write("\n### Production Cloud Run revision diagnosis (read-only)\n\n")
            for row in rows:
                f.write("- " + row.replace("|", "/").replace("\n", " ") + "\n")
    # Auditing must not mark service as safely deployable without evidence.
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
