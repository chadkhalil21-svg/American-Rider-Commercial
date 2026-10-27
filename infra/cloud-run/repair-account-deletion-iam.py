#!/usr/bin/env python3
"""One-time least-privilege IAM repair for owner-initiated account deletion.

No account is deleted by this script. It never reads user records or secrets.
Audit is the default; --apply changes only a single project custom role and
one binding for the exact already commissioned production Cloud Run identity.
Run from authenticated Cloud Shell with an IAM administrator account.
"""
import argparse
import json
import subprocess
import sys

PROJECT = "american-rider-35688"
REGION = "us-east1"
SERVICE = "american-rider-api-production"
RUNTIME = f"ar-production-live-runtime@{PROJECT}.iam.gserviceaccount.com"
MEMBER = f"serviceAccount:{RUNTIME}"
ROLE_ID = "americanRiderAuthAccountDelete"
ROLE = f"projects/{PROJECT}/roles/{ROLE_ID}"
PERMISSIONS = ["firebaseauth.users.delete"]
BROADER_AUTH_ROLES = {
    "roles/firebaseauth.admin", "roles/firebaseauth.editor",
    "roles/firebase.admin", "roles/firebase.editor",
    "roles/identityplatform.admin",
}


def cli(*args):
    process = subprocess.run(
        ["gcloud", "--quiet", *args], capture_output=True, text=True, check=False
    )
    if process.returncode:
        raise RuntimeError("Google Cloud rejected the IAM preflight or change: " + args[0])
    return process.stdout


def doc(*args):
    return json.loads(cli(*args, "--format=json"))


def audit():
    project = cli("config", "get-value", "project").strip()
    if project != PROJECT:
        raise RuntimeError("Select the expected Google Cloud project before proceeding.")
    service = doc("run", "services", "describe", SERVICE,
                  "--region=" + REGION, "--project=" + PROJECT)
    identity = service.get("spec", {}).get("template", {}).get("spec", {}).get("serviceAccountName")
    if identity != RUNTIME:
        raise RuntimeError("Production service is running with a different identity; no IAM change allowed.")
    roles = doc("iam", "roles", "list", "--project=" + PROJECT)
    target = next((item for item in roles if item.get("name") == ROLE), None)
    if target and (
        sorted(target.get("includedPermissions", [])) != PERMISSIONS
        or target.get("deleted", False)
        or target.get("stage") == "DISABLED"
    ):
        raise RuntimeError("Custom role conflicts with expected delete-only permission; refuse to change it.")
    policy = doc("projects", "get-iam-policy", PROJECT)
    granted = {
        b.get("role") for b in policy.get("bindings", [])
        if MEMBER in b.get("members", [])
        and (not b.get("condition") or b["condition"].get("expression") in ("", "true"))
    }
    broad = BROADER_AUTH_ROLES.intersection(granted)
    if broad:
        raise RuntimeError("Runtime already has write-capable Firebase Auth role; investigate deletion logs instead.")
    return bool(target), ROLE in granted


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true",
                        help="Create the exact delete-only role/binding after verified preflight")
    args = parser.parse_args()
    existing, bound = audit()
    print("Verified Cloud Run production identity:", RUNTIME)
    print("Custom role present:", existing, "| delete permission bound:", bound)
    if not args.apply:
        print("Audit only. No changes made. Add --apply to grant account deletion permission.")
        return
    if not existing:
        cli("iam", "roles", "create", ROLE_ID, "--project=" + PROJECT,
            "--title=American Rider account removal",
            "--description=Allows the existing secured account deletion endpoint to remove Firebase Auth identities",
            "--permissions=firebaseauth.users.delete", "--stage=GA")
    if not bound:
        cli("projects", "add-iam-policy-binding", PROJECT,
            "--member=" + MEMBER, "--role=" + ROLE, "--condition=None")
    verified_role, verified_binding = audit()
    if not (verified_role and verified_binding):
        raise RuntimeError("Unable to verify exact IAM role and binding; do not claim repair complete.")
    print("Verified: the production runtime has the account-delete permission only.")
    print("No app binary, data, payment, scheduler, or service deployment was changed.")
    print("Next: retry deleting a fresh disposable account; inspect Cloud Run errors if it still fails.")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, ValueError, OSError, json.JSONDecodeError) as error:
        print("Account-deletion IAM repair stopped:", error, file=sys.stderr)
        sys.exit(1)
