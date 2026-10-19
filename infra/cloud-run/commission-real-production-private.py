#!/usr/bin/env python3
"""Commission the FINAL American Rider Cloud Run API service in a PRIVATE, non-money state.

One founder-authenticated Cloud Shell action. The service is named
american-rider-api-production (distinct from the old staging/candidate).
This first revision is IAM-private, has NO Stripe live secret, is NOT authorized
to receive customer requests, and has NO active Cloud Scheduler job.
Render remains the single live booking/payment/dispatch authority.

Only metadata is printed. The generated scheduler token never goes to logs,
source, environment variables, local files or ChatGPT. Secret versions are pinned.
"""
import json
import os
import re
import secrets
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

PROJECT = "american-rider-35688"
REGION = "us-east1"
SERVICE = "american-rider-api-production"
CANDIDATE = "american-rider-api-production-candidate"
SA_NAME = "ar-production-live-runtime"
SA_EMAIL = f"{SA_NAME}@{PROJECT}.iam.gserviceaccount.com"
MEMBER = f"serviceAccount:{SA_EMAIL}"
SCHEDULER_SECRET = "ar-production-live-scheduler-token"
REPO_URLS = {
    "https://github.com/chadkhalil21-svg/American-Rider-Commercial",
    "https://github.com/chadkhalil21-svg/American-Rider-Commercial.git",
    "git@github.com:chadkhalil21-svg/American-Rider-Commercial.git",
}
# These are ALL of the staged values except the live Stripe secret. No Render
# webhook signing secret or old scheduler token is carried to the new service.
SAFE_IMPORTS = (
    "CORS_ORIGINS", "HERE_API_KEY", "MAIL_FROM", "OPS_MFA_SECRETS",
    "OPS_SESSION_SECRET", "OPS_USERS", "R2_ACCESS_KEY_ID", "R2_ACCOUNT_ID",
    "R2_BUCKET", "R2_SECRET_ACCESS_KEY", "RESEND_API_KEY",
    "STRIPE_PUBLISHABLE_KEY", "SUPPORT_EMAIL",
)
FIREBASE_ROLES = ("roles/datastore.user", "roles/firebaseauth.viewer")


def stop(message):
    raise RuntimeError(message)


def run(args, *, timeout=50, input_data=None, visible=False):
    cmd = list(args)
    try:
        result = subprocess.run(
            cmd, check=False, input=input_data, timeout=timeout,
            stdout=None if visible else subprocess.PIPE,
            stderr=None if visible else subprocess.PIPE,
            text=False,
        )
    except subprocess.TimeoutExpired:
        stop(f"Google command timed out after {timeout}s: {cmd[1] if len(cmd)>1 else 'unknown'}; do not repeat blindly.")
    if result.returncode != 0:
        # Do not echo raw CLI error responses, because credentials occasionally
        # appear in provider diagnostics. Only command name and status are shown.
        stop(f"Google command failed ({result.returncode}): {' '.join(cmd[:3])}. No payment/traffic cutover.")
    return result.stdout.decode("utf-8", "replace").strip() if result.stdout is not None else ""


def gc(*args, timeout=50, input_data=None, visible=False):
    return run(("gcloud", "--quiet", *args), timeout=timeout,
               input_data=input_data, visible=visible)


def gjson(*args, timeout=50):
    content = gc(*args, "--format=json", timeout=timeout)
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        stop("Google command returned unexpected data (no service changed).")


def inspect_repo():
    base = Path(__file__).resolve().parents[2]
    if Path.cwd().resolve() != base:
        stop("Run from ~/American-Rider-Commercial repository root.")
    if run(("git", "branch", "--show-current")) != "release/current":
        stop("Expected branch release/current. Run git pull --ff-only.")
    if run(("git", "remote", "get-url", "origin")) not in REPO_URLS:
        stop("Wrong GitHub repository; refusing production-project changes.")
    if run(("git", "status", "--porcelain")):
        stop("Uncommitted local source changes. Refusing an unreviewed build.")
    head = run(("git", "rev-parse", "HEAD"))
    remote = run(("git", "rev-parse", "refs/remotes/origin/release/current"))
    if head != remote:
        stop("Local release differs from tracked origin. Run git pull --ff-only.")
    if not (base / "backend" / "Dockerfile").exists():
        stop("Backend Dockerfile is not present.")
    return head


def existing_services():
    rows = gjson("run", "services", "list", f"--project={PROJECT}", f"--region={REGION}")
    return {r.get("metadata", {}).get("name") for r in rows}


def validate_candidate():
    info = gjson("run", "services", "describe", CANDIDATE,
                 f"--project={PROJECT}", f"--region={REGION}")
    env = info.get("spec", {}).get("template", {}).get("spec", {}).get("containers", [{}])[0].get("env", [])
    names = {e.get("name") for e in env}
    if "STRIPE_SECRET_KEY" in names:
        stop("STOP: the private candidate still has a Stripe key. Remove it before further Cloud Run work.")
    print("Existing private candidate: no bound STRIPE_SECRET_KEY. Verified.")


def check_project():
    result = gjson("projects", "describe", PROJECT)
    if result.get("projectId") != PROJECT:
        stop("Wrong Google project.")
    billing = gc("billing", "projects", "describe", PROJECT,
                 "--format=value(billingEnabled)")
    if billing.lower() != "true":
        stop("Production project billing is not active.")
    db = gjson("firestore", "databases", "describe",
               "--database=(default)", f"--project={PROJECT}")
    if not str(db.get("name", "")).endswith("/databases/(default)"):
        stop("Production Firebase/Firestore default database is not present.")
    if db.get("state") not in (None, "READY"):
        stop("Firestore database is not READY.")
    print("Production Google and Firebase project: verified (same project).")


def list_accounts():
    rows = gjson("iam", "service-accounts", "list", f"--project={PROJECT}")
    return {r.get("email") for r in rows}


def ensure_runtime_account():
    if SA_EMAIL not in list_accounts():
        print("Creating distinct least-privilege production runtime identity...")
        gc("iam", "service-accounts", "create", SA_NAME,
           f"--project={PROJECT}", "--display-name=American Rider Production API runtime",
           timeout=70)
    policy = gjson("projects", "get-iam-policy", PROJECT)
    granted = {b.get("role") for b in policy.get("bindings", [])
               if MEMBER in b.get("members", [])}
    for role in FIREBASE_ROLES:
        if role not in granted:
            print("Granting only Firebase role:", role)
            gc("projects", "add-iam-policy-binding", PROJECT,
               f"--member={MEMBER}", f"--role={role}", "--condition=None", timeout=75)
    print("Runtime identity prepared:", SA_EMAIL)


def secret_index():
    return {entry.get("name", "").rsplit("/", 1)[-1]
            for entry in gjson("secrets", "list", f"--project={PROJECT}")}


def checked_version(name):
    obj = gjson("secrets", "versions", "describe", "latest",
                f"--secret={name}", f"--project={PROJECT}")
    if obj.get("state") != "ENABLED":
        stop(f"Secret {name} has no enabled latest version.")
    version = str(obj.get("name", "")).rsplit("/", 1)[-1]
    if not re.fullmatch(r"[0-9]+", version):
        stop(f"Secret {name} has no numeric version to pin.")
    return version


def ensure_scheduler_secret(names):
    if SCHEDULER_SECRET not in names:
        print("Creating production-only scheduler token in Secret Manager (job remains OFF)...")
        gc("secrets", "create", SCHEDULER_SECRET,
           f"--project={PROJECT}", "--replication-policy=automatic", timeout=80)
    try:
        return checked_version(SCHEDULER_SECRET)
    except RuntimeError:
        # A just-created secret exists without a version; we do not silently
        # replace versions of an established secret after another kind of error.
        if SCHEDULER_SECRET in names:
            raise
    generated = secrets.token_hex(32).encode("ascii")
    gc("secrets", "versions", "add", SCHEDULER_SECRET,
       f"--project={PROJECT}", "--data-file=-", input_data=generated, timeout=80)
    return checked_version(SCHEDULER_SECRET)


def grant_secrets(secret_names):
    for i, name in enumerate(secret_names, 1):
        print(f"Authorizing production runtime on named secret {i}/{len(secret_names)}: {name}")
        policy = gjson("secrets", "get-iam-policy", name, f"--project={PROJECT}")
        if any(b.get("role") == "roles/secretmanager.secretAccessor"
               and MEMBER in b.get("members", []) for b in policy.get("bindings", [])):
            continue
        gc("secrets", "add-iam-policy-binding", name, f"--project={PROJECT}",
           f"--member={MEMBER}", "--role=roles/secretmanager.secretAccessor", timeout=70)


def deploy(versions, release):
    references = ",".join(
        f"{key}={f'ar-render-import-{key.lower().replace(chr(95), chr(45))}'}:{versions[key]}"
        for key in SAFE_IMPORTS
    )
    references += f",SCHEDULER_TOKEN={SCHEDULER_SECRET}:{versions['SCHEDULER_TOKEN']}"
    print("Deploying the actual production API service as IAM-PRIVATE and NON-MONEY.")
    print("Build from release:", release[:12])
    # This creates a distinct FINAL service, not another staging candidate.
    # No money key, live webhook secrets, customer API origin, or Cloud Scheduler.
    gc(
        "run", "deploy", SERVICE, f"--project={PROJECT}", f"--region={REGION}",
        "--source=./backend", "--no-allow-unauthenticated", "--ingress=all",
        "--min-instances=0", "--max-instances=2", "--cpu=1", "--memory=1Gi",
        "--concurrency=20", f"--service-account={SA_EMAIL}",
        f"--set-env-vars=NODE_ENV=production,DEPLOYMENT_MODE=development,AR_EXTERNAL_SCHEDULER=1,GOOGLE_CLOUD_PROJECT={PROJECT},AR_RELEASE_COMMIT={release}",
        f"--set-secrets={references}", timeout=1200, visible=True,
    )


def authenticated_get(url, path, token):
    req = urllib.request.Request(
        url.rstrip("/") + path,
        headers={"Authorization": "Bearer " + token, "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as response:
            raw = response.read(200_000)
            return response.status, json.loads(raw)
    except urllib.error.HTTPError as err:
        return err.code, {}
    except (urllib.error.URLError, TimeoutError, ValueError):
        return 0, {}


def verify():
    info = gjson("run", "services", "describe", SERVICE,
                 f"--project={PROJECT}", f"--region={REGION}")
    spec = info.get("spec", {}).get("template", {}).get("spec", {})
    if spec.get("serviceAccountName") != SA_EMAIL:
        stop("Deployed runtime account differs from commissioned account.")
    env = spec.get("containers", [{}])[0].get("env", [])
    names = {item.get("name") for item in env}
    if "STRIPE_SECRET_KEY" in names or "STRIPE_WEBHOOK_SECRET" in names:
        stop("Unsafe Stripe secret appeared on the private production revision.")
    if any(item.get("name") == "DEPLOYMENT_MODE" and item.get("value") != "development"
           for item in env):
        stop("Wrong deployment mode: do not forward payments.")
    iam = gjson("run", "services", "get-iam-policy", SERVICE,
                f"--project={PROJECT}", f"--region={REGION}")
    if any(m in ("allUsers", "allAuthenticatedUsers")
           for b in iam.get("bindings", []) for m in b.get("members", [])):
        stop("Production preflight must be IAM-private; unexpected public invoker.")
    url = info.get("status", {}).get("url", "")
    if not url.startswith("https://") or ".run.app" not in url:
        stop("Production service URL missing.")
    token = gc("auth", "print-identity-token", timeout=30)
    code, _ = authenticated_get(url, "/live", token)
    print("Private /live HTTP:", code)
    if code != 200:
        stop("Container not responding to authenticated /live.")
    code, health = authenticated_get(url, "/health", token)
    print("Private /health HTTP:", code)
    if code != 200:
        stop("Detailed readiness probe failed; service remains private.")
    print("Readiness: mode=", health.get("deployment"), "; Stripe=", health.get("stripe"),
          "; Firestore=", health.get("support", {}).get("firestore"),
          "; provider email=", health.get("support", {}).get("email"))
    if health.get("stripe") != "no-key" or health.get("deployment") != "development":
        stop("Private service must not have real-money capability.")
    if health.get("support", {}).get("firestore") != "on":
        stop("Firebase Admin not initialized. Check IAM/project; private service remains deployed.")
    if not isinstance(health.get("fleet", {}).get("operators"), int):
        stop("Firestore read has NOT been verified. Private service remains deployed; investigate before cutover.")
    print("Verified authenticated Firestore count query.")
    print("DONE: Actual production Cloud Run API exists privately, with 13 provider/config")
    print("values, a separate scheduler secret, and Google-managed Firebase identity.")
    print("NOT LIVE: Stripe live key/webhooks, scheduler job, customer mobile/web API origin")
    print("and Render remain untouched. No payment or dispatch was attempted.")
    print("Production API service:", SERVICE)
    print("Next gate: signed Stripe webhooks + once-per-minute scheduler, then one-authority cutover.")


def main():
    print("AMERICAN RIDER | Real production API commissioning | no paid activity")
    release = inspect_repo()
    print("Release/current SHA:", release[:12])
    print("Project:", PROJECT, "| Region:", REGION, "| New service:", SERVICE)
    check_project()
    services = existing_services()
    if CANDIDATE not in services:
        stop("The verified private candidate is absent; investigate before proceeding.")
    validate_candidate()
    if SERVICE in services:
        stop("The final production API already exists; refusing to redeploy or reset its configuration.")
    found = secret_index()
    required = {
        f"ar-render-import-{key.lower().replace('_', '-')}" for key in SAFE_IMPORTS
    }
    missing = sorted(required - found)
    if missing:
        stop("Production Secret Manager import incomplete: " + ", ".join(missing))
    print("Found all 13 imported NON-MONEY settings. Live STRIPE_SECRET_KEY is excluded.")
    print("Planned changes: one dedicated service account, Firebase read/write + auth viewer")
    print("roles, named-secret-only IAM grants, a fresh uncalled scheduler credential,")
    print("and ONE private production Cloud Run service. Cloud Build/Run/Secret Manager may bill.")
    print("No Stripe charges, webhooks, live dispatch or Render/mobile cutover will occur.")
    if input("Type COMMISSION to create the real PRIVATE production service: ").strip() != "COMMISSION":
        print("Cancelled before making GCP changes.")
        return
    ensure_runtime_account()
    versions = {}
    for key in SAFE_IMPORTS:
        secret_name = "ar-render-import-" + key.lower().replace("_", "-")
        versions[key] = checked_version(secret_name)
    versions["SCHEDULER_TOKEN"] = ensure_scheduler_secret(found)
    all_secret_names = [
        "ar-render-import-" + key.lower().replace("_", "-") for key in SAFE_IMPORTS
    ] + [SCHEDULER_SECRET]
    grant_secrets(all_secret_names)
    deploy(versions, release)
    verify()


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, KeyboardInterrupt) as exc:
        # Generic gcloud wrapper never includes token or secret output.
        print("STOP:", str(exc) if not isinstance(exc, KeyboardInterrupt)
              else "Cancelled by operator.", file=sys.stderr)
        sys.exit(1)
