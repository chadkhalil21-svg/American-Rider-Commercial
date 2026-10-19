#!/usr/bin/env python3
"""One GitHub Actions control for EXISTING production Cloud Run, first paid launch.

VERIFY: read real GCP status and list remaining evidence/permissions, no changes.
ACTIVATE: requires explicit founder confirmation, verified screening workflow and
paused scheduler. Mount live Stripe key + production flags in one PRIVATE Cloud
Run revision, then open that actual service and independently verify HTTP health.
Do not change Stripe webhook URLs, Render clock, scheduler job or app builds here.
Those are distinct, ordered external authority handoffs after this gate.

No secret values/ID tokens, customer data or full IAM policies are printed.
"""
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request

PROJECT = "american-rider-35688"
REGION = "us-east1"
SERVICE = "american-rider-api-production"
RUNTIME = f"ar-production-live-runtime@{PROJECT}.iam.gserviceaccount.com"
JOB = "ar-production-minute-sweeps"
STRIPE_SECRET = "ar-render-import-stripe-secret-key"
URL = "https://american-rider-api-production-623854974930.us-east1.run.app"
REQUIRED_SIGNERS = ("STRIPE_WEBHOOK_SECRET", "STRIPE_CONNECT_WEBHOOK_SECRET", "RESEND_WEBHOOK_SECRET")
EXPECTED_BRANCH = "refs/heads/release/current"


class Stop(RuntimeError):
    pass


def gcloud(*args, timeout=70):
    command = ("gcloud", "--quiet", *args)
    try:
        result = subprocess.run(command, capture_output=True, check=False, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired):
        raise Stop("Google Cloud command unavailable or timed out, no traffic switch confirmed.")
    if result.returncode:
        # CLI stderr might contain sensitive provider info; never echo it.
        raise Stop(f"Google Cloud permission/command failure in {args[0]} {args[1] if len(args)>1 else ''}; no Stripe webhook URLs changed.")
    return result.stdout.decode("utf-8", errors="replace").strip()


def meta(*args, timeout=70):
    try:
        return json.loads(gcloud(*args, "--format=json", timeout=timeout))
    except (ValueError, TypeError):
        raise Stop("Google returned unexpected metadata.")


def env_map(service):
    spec = service.get("spec", {}).get("template", {}).get("spec", {})
    return {r.get("name"): r for r in spec.get("containers", [{}])[0].get("env", [])}


def inspect(service, scheduler, secret, *, private_expected=True):
    blockers = []
    spec = service.get("spec", {}).get("template", {}).get("spec", {})
    env = env_map(service)
    if not service.get("status", {}).get("latestReadyRevisionName"):
        blockers.append("real production revision not READY")
    if spec.get("serviceAccountName") != RUNTIME:
        blockers.append("production runtime identity unexpected")
    if any(name not in env for name in REQUIRED_SIGNERS):
        blockers.append("three existing webhook signing-key BINDINGS incomplete")
    if "SCHEDULER_TOKEN" not in env or env.get("AR_EXTERNAL_SCHEDULER", {}).get("value") != "1":
        blockers.append("external scheduler credential/mode missing")
    if "STRIPE_PUBLISHABLE_KEY" not in env:
        blockers.append("Stripe publishable key not bound to production API")
    if env.get("SCREENING_EVIDENCE_WORKFLOW_VERIFIED", {}).get("value") != "true":
        blockers.append("external CRA screening evidence pilot not founder-verified")
    if private_expected and str(service.get("metadata", {}).get("annotations", {}).get(
        "run.googleapis.com/invoker-iam-disabled", "")).lower() == "true":
        blockers.append("API is unexpectedly public before controlled cutover")
    if private_expected and ("STRIPE_SECRET_KEY" in env or
                             env.get("AR_CLOUDRUN_CUTOVER_ACTIVE", {}).get("value") == "1"):
        blockers.append("Cloud Run already has live money or cutover activated")
    # An invoker-IAM annotation alone does not reveal legacy allUsers bindings.
    # Fail closed unless the precise service IAM state is independently readable.
    try:
        iam = meta("run", "services", "get-iam-policy", SERVICE,
                   f"--project={PROJECT}", f"--region={REGION}")
    except Stop:
        iam = None
    if not isinstance(iam, dict):
        blockers.append("Cloud Run invoker IAM policy unreadable; grant read access for paid activation")
    elif private_expected and any(
        principal in ("allUsers", "allAuthenticatedUsers")
        for binding in iam.get("bindings", [])
        if binding.get("role") == "roles/run.invoker"
        for principal in binding.get("members", [])
    ):
        blockers.append("Cloud Run unexpectedly exposes public invoker before activation")
    if isinstance(scheduler, dict):
        if scheduler.get("state") != "PAUSED":
            blockers.append("Google scheduler is not PAUSED")
        if not (scheduler.get("httpTarget", {}).get("uri", "").endswith("/scheduled/sweep") and
                SERVICE in scheduler.get("httpTarget", {}).get("uri", "")):
            blockers.append("Google scheduler targets unexpected destination")
    else:
        blockers.append("Google scheduler state unreadable; grant viewer permission before paid activation")
    if not isinstance(secret, dict) or secret.get("state") != "ENABLED":
        blockers.append("imported live Stripe key has no enabled secret version")
    if not re.fullmatch(r"[0-9]+", str(secret.get("name", "")).rsplit("/", 1)[-1]):
        blockers.append("live Stripe secret version cannot be pinned")
    return blockers


def read_state():
    service = meta("run", "services", "describe", SERVICE,
                   f"--project={PROJECT}", f"--region={REGION}")
    try:
        scheduler = meta("scheduler", "jobs", "describe", JOB,
                         f"--project={PROJECT}", f"--location={REGION}")
    except Stop:
        scheduler = None
    try:
        secret = meta("secrets", "versions", "describe", "latest",
                      f"--secret={STRIPE_SECRET}", f"--project={PROJECT}")
    except Stop:
        secret = None
    return service, scheduler, secret


def require_exact_release():
    if os.environ.get("GITHUB_REF") != EXPECTED_BRANCH:
        raise Stop("Only approved release/current can commission paid production.")
    sha = os.environ.get("GITHUB_SHA", "")
    if not re.fullmatch(r"[a-f0-9]{40}", sha):
        raise Stop("Exact immutable GitHub release SHA not available.")
    if gcloud("config", "get-value", "project") not in (PROJECT, ""):
        raise Stop("Google CLI has an unexpected default project.")
    return sha


def print_preflight(service, blockers):
    env = env_map(service)
    print("Existing GCP production service:", SERVICE)
    print("Ready revision:", service.get("status", {}).get("latestReadyRevisionName", "unknown"))
    print("Live Stripe key binding:", "PRESENT" if "STRIPE_SECRET_KEY" in env else "not yet mounted")
    print("Screening provider evidence attested:",
          "yes" if env.get("SCREENING_EVIDENCE_WORKFLOW_VERIFIED", {}).get("value") == "true" else "NO")
    print("Scheduled dispatcher:", "must remain PAUSED until old Render clock retired")
    if blockers:
        for b in blockers:
            print("BLOCKED:", b)
    else:
        print("READY: existing production backend can be activated WITHOUT staging.")
    print("No credentials, payment, booking, Stripe webhook or app-store changes from VERIFY.")


def grant_live_secret_access():
    member = "serviceAccount:" + RUNTIME
    policy = meta("secrets", "get-iam-policy", STRIPE_SECRET, f"--project={PROJECT}")
    bound = any(b.get("role") == "roles/secretmanager.secretAccessor" and
                member in b.get("members", []) for b in policy.get("bindings", []))
    if not bound:
        gcloud("secrets", "add-iam-policy-binding", STRIPE_SECRET,
               f"--project={PROJECT}", f"--member={member}",
               "--role=roles/secretmanager.secretAccessor", timeout=90)
    print("Runtime access to the single existing live Stripe secret verified.")


def get_public(path):
    req = urllib.request.Request(URL + path, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=35) as rsp:
            if rsp.status != 200:
                raise Stop(f"Google production {path} HTTP {rsp.status}; cutover not verified.")
            return json.loads(rsp.read(150_000))
    except (TimeoutError, urllib.error.HTTPError, urllib.error.URLError, ValueError) as exc:
        raise Stop(f"Google production {path} not reachable ({type(exc).__name__}).") from None


def verify_paid_public(health, config, live):
    if live.get("ok") is not True:
        raise Stop("Google API /live does not report healthy.")
    if health.get("stripe") != "live" or health.get("deployment") != "production":
        raise Stop("Google API must report PRODUCTION with real live Stripe.")
    if health.get("screening") != "on" or health.get("documents") != "on":
        raise Stop("Screening/document qualification process not verified for live launch.")
    if health.get("support", {}).get("firestore") != "on" or not isinstance(
        health.get("fleet", {}).get("operators"), int
    ):
        raise Stop("Production Firestore count is unavailable.")
    if health.get("scheduler") != "authenticated":
        raise Stop("Cloud Run lacks scheduler token.")
    if health.get("operationalReady") is not True or config.get("canTakePayment") is not True:
        raise Stop("Public Google API still blocks paid booking; inspect /health operationalMissing.")
    if config.get("mode") != "live" or not str(config.get("stripePublishableKey", "")).startswith("pk_live_"):
        raise Stop("Live Stripe publishable key does not match real money mode.")
    if not str(health.get("commit", "")).strip():
        raise Stop("Deployed source release SHA cannot be independently verified.")
    print("VERIFIED: public Google production API, Firebase, live Stripe key pair, signed providers, paid-booking readiness.")


def rollback_private():
    # Existing Stripe endpoints / Render scheduler remain untouched throughout.
    issues = []
    try:
        gcloud("run", "services", "update", SERVICE, f"--project={PROJECT}",
               f"--region={REGION}", "--invoker-iam-check", timeout=240)
    except Stop as exc:
        issues.append("public IAM rollback")
    try:
        gcloud("run", "services", "update", SERVICE, f"--project={PROJECT}",
               f"--region={REGION}",
               "--remove-secrets=STRIPE_SECRET_KEY",
               "--update-env-vars=DEPLOYMENT_MODE=development,AR_CLOUDRUN_CUTOVER_ACTIVE=0",
               timeout=420)
    except Stop:
        issues.append("live Stripe runtime rollback")
    if issues:
        print("URGENT: rollback needs founder review:", ", ".join(issues))
    else:
        print("ROLLBACK: actual Cloud Run service returned to IAM-private and no live Stripe key.")


def activate(sha, secret):
    grant_live_secret_access()
    version = str(secret["name"]).rsplit("/", 1)[-1]
    print("Deploying real paid backend to PRIVATE Cloud Run first. No store or Stripe URL switch.")
    attempted = False
    try:
        attempted = True
        gcloud("run", "deploy", SERVICE, f"--project={PROJECT}", f"--region={REGION}",
               "--source=./backend", f"--service-account={RUNTIME}",
               "--invoker-iam-check", "--ingress=all",
               "--min-instances=0", "--max-instances=2",
               "--cpu=1", "--memory=1Gi", "--concurrency=20",
               f"--update-secrets=STRIPE_SECRET_KEY={STRIPE_SECRET}:{version}",
               f"--update-env-vars=DEPLOYMENT_MODE=production,AR_CLOUDRUN_CUTOVER_ACTIVE=1,AR_EXTERNAL_SCHEDULER=1,AR_RELEASE_COMMIT={sha}",
               timeout=1500)
        s = meta("run", "services", "describe", SERVICE, f"--project={PROJECT}", f"--region={REGION}")
        env = env_map(s)
        if (env.get("DEPLOYMENT_MODE", {}).get("value") != "production" or
            env.get("AR_CLOUDRUN_CUTOVER_ACTIVE", {}).get("value") != "1" or
            "STRIPE_SECRET_KEY" not in env or
            env.get("AR_RELEASE_COMMIT", {}).get("value") != sha):
            raise Stop("Private paid revision did not match the approved release.")

        print("PRIVATE live-money revision created; opening public API only for final read-only readiness checks.")
        gcloud("run", "services", "update", SERVICE,
               f"--project={PROJECT}", f"--region={REGION}",
               "--no-invoker-iam-check", timeout=420)
        live = get_public("/live")
        health = get_public("/health")
        config = get_public("/config")
        verify_paid_public(health, config, live)
        if health["commit"] != sha[:7]:
            raise Stop("Cloud Run revision source SHA mismatch.")
        print("VERIFIED: real public backend accepts live Stripe payments but no app-store build has switched yet.")
        print("NEXT: point existing TWO Stripe webhooks to Google, disable Render sweeps,")
        print("then update/resume exactly one Google Scheduler job. Do not submit native apps before.")
    except Exception:
        if attempted:
            rollback_private()
        raise


def main():
    release = require_exact_release()
    if len(sys.argv) != 2 or sys.argv[1] not in ("VERIFY", "ACTIVATE_PAID"):
        raise Stop("Use VERIFY or ACTIVATE_PAID from the approved GitHub workflow.")
    svc, scheduler, secret = read_state()
    blockers = inspect(svc, scheduler, secret)
    print_preflight(svc, blockers)
    if sys.argv[1] == "VERIFY":
        return
    if os.environ.get("FOUNDER_APPROVAL") != "ACTIVATE_PAID_CLOUDRUN":
        raise Stop("Explicit owner approval ACTIVATE_PAID_CLOUDRUN is required.")
    if blockers:
        raise Stop("Founder-approved activation was BLOCKED by prerequisites listed above. No payment or endpoint changed.")
    activate(release, secret)


if __name__ == "__main__":
    try:
        main()
    except Stop as exc:
        print("STOP:", str(exc), file=sys.stderr)
        sys.exit(1)
