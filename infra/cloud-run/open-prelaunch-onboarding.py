#!/usr/bin/env python3
"""Controlled FIRST PUBLIC ONBOARDING on the EXISTING real Google production API.

A founder-triggered GitHub Actions job calls this with OPEN_ONBOARDING.
Only production onboarding is allowed: STRICT no live Stripe key, no paid Travel,
no money, no scheduled dispatch. Stripe endpoints still point to Render.
The final paid-travel cutover is a distinct, later reviewed action.
"""
import json
import subprocess
import sys
import urllib.error
import urllib.request

PROJECT = "american-rider-35688"
REGION = "us-east1"
SERVICE = "american-rider-api-production"
RUNTIME = f"ar-production-live-runtime@{PROJECT}.iam.gserviceaccount.com"
CANONICAL_URL = "https://american-rider-api-production-623854974930.us-east1.run.app"
EXPECTED_BRANCH = "release/current"


def run(*args, timeout=1100):
    # Never print Google CLI stderr, env payloads, identity tokens or keys.
    try:
        p = subprocess.run(["gcloud", "--quiet", *args], stdout=subprocess.PIPE,
                           stderr=subprocess.PIPE, timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise RuntimeError("Google Cloud command unavailable or timed out (no payment activation).")
    if p.returncode:
        raise RuntimeError("Google Cloud operation failed: " + " ".join(args[:3]) +
                           ". Inspect IAM permissions via Cloud Console; no Stripe activated.")
    return p.stdout.decode("utf-8", "replace")


def meta(*args):
    try:
        return json.loads(run(*args, "--format=json"))
    except (ValueError, TypeError):
        raise RuntimeError("Google metadata cannot be verified safely.")


def inspect(info, *, expecting_public=False):
    if not isinstance(info, dict):
        raise RuntimeError("Expected the existing real Cloud Run service.")
    spec = info.get("spec", {}).get("template", {}).get("spec", {})
    if spec.get("serviceAccountName") != RUNTIME:
        raise RuntimeError("Cloud Run runtime service identity changed.")
    env = {i.get("name"): i for i in spec.get("containers", [{}])[0].get("env", [])}
    if "STRIPE_SECRET_KEY" in env:
        raise RuntimeError("Live Stripe key mounted; refuse PRELAUNCH onboarding workflow.")
    if env.get("AR_CLOUDRUN_CUTOVER_ACTIVE", {}).get("value") == "1":
        raise RuntimeError("Commercial cutover already active; refuse PRELAUNCH workflow.")
    if env.get("AR_EXTERNAL_SCHEDULER", {}).get("value") != "1":
        raise RuntimeError("In-process dispatch clock not disabled.")
    if not all(i in env for i in (
        "STRIPE_WEBHOOK_SECRET", "STRIPE_CONNECT_WEBHOOK_SECRET",
        "RESEND_WEBHOOK_SECRET", "SCHEDULER_TOKEN")):
        raise RuntimeError("Existing provider signatures/scheduler token not fully configured.")
    if expecting_public and (
        env.get("DEPLOYMENT_MODE", {}).get("value") != "production"
        or env.get("AR_PRELAUNCH_PUBLIC", {}).get("value") != "1"):
        raise RuntimeError("Prelaunch source/runtime flags not installed.")
    return info.get("status", {}).get("url", "")


def http_json(base_url, path):
    request = urllib.request.Request(
        base_url.rstrip("/") + path, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            if response.status != 200:
                raise RuntimeError("Public Google API " + path + " did not return 200.")
            return json.loads(response.read(250_000))
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError) as exc:
        raise RuntimeError("Public Google API " + path + " did not pass: " +
                           type(exc).__name__) from None


def verify_public():
    candidates = [CANONICAL_URL]
    advertised = meta("run", "services", "describe", SERVICE,
                      f"--project={PROJECT}", f"--region={REGION}")
    target = inspect(advertised, expecting_public=True)
    if target and target not in candidates:
        candidates.append(target)
    reasons = []
    for url in candidates:
        try:
            live = http_json(url, "/live")
            health = http_json(url, "/health")
            config = http_json(url, "/config")
            if live.get("ok") is not True:
                raise RuntimeError("Liveness not confirmed")
            if health.get("deployment") != "production" or health.get("stripe") != "no-key":
                raise RuntimeError("PRELAUNCH payment mode not disabled")
            if health.get("support", {}).get("firestore") != "on":
                raise RuntimeError("Firebase/Firestore not connected")
            if not isinstance(health.get("fleet", {}).get("operators"), int):
                raise RuntimeError("Firestore operator count missing")
            if health.get("scheduler") != "authenticated":
                raise RuntimeError("External scheduler secret missing")
            if config.get("mode") != "no-key" or config.get("canTakePayment") is not False:
                raise RuntimeError("Payment endpoints must remain disabled")
            print("PASS: actual public Google backend /live, /health and /config")
            print("PASS: Firebase connected, real operator count readable")
            print("PASS: paid Travel is DISABLED; Stripe LIVE and dispatch not activated")
            print("Google public API:", url)
            return
        except RuntimeError as exc:
            reasons.append(str(exc))
    raise RuntimeError("Public onboarding health checks did not pass; " + "; ".join(reasons))


def main():
    if len(sys.argv) != 2 or sys.argv[1] != "OPEN_ONBOARDING":
        raise RuntimeError("Explicit founder confirmation OPEN_ONBOARDING required.")
    if not (sys.platform == "linux"):
        raise RuntimeError("Use the audited GitHub Actions workflow on Linux.")
    import os
    if os.environ.get("GITHUB_REF") != "refs/heads/" + EXPECTED_BRANCH:
        raise RuntimeError("Production changes require exact release/current branch.")
    if os.environ.get("GITHUB_SHA") != os.environ.get("VERIFIED_RELEASE_SHA"):
        raise RuntimeError("GitHub commit changed during the prelaunch authorization.")
    info = meta("run", "services", "describe", SERVICE,
                f"--project={PROJECT}", f"--region={REGION}")
    inspect(info)
    # Also verify existing service is READY and on the correct Google project.
    if not info.get("status", {}).get("latestReadyRevisionName"):
        raise RuntimeError("Actual final Google API is not serving a ready revision.")
    print("CHECK: exact existing real production API, runtime identity, safe payment-off state")
    print("STEP: update exact final service source privately, with production route checks ON")
    # Deploy new code privately, retaining existing Secret Manager bindings.
    run("run", "deploy", SERVICE,
        f"--project={PROJECT}", f"--region={REGION}",
        "--source=./backend",
        f"--service-account={RUNTIME}",
        "--min-instances=0", "--max-instances=2",
        "--cpu=1", "--memory=1Gi", "--concurrency=20",
        "--update-env-vars=DEPLOYMENT_MODE=production,AR_PRELAUNCH_PUBLIC=1,AR_EXTERNAL_SCHEDULER=1",
        timeout=1200)
    info = meta("run", "services", "describe", SERVICE,
                f"--project={PROJECT}", f"--region={REGION}")
    inspect(info, expecting_public=True)
    print("CHECK: guarded production onboarding code deployed, NO live Stripe, no dispatch")
    # Google currently recommends disabling the Cloud Run invoker IAM check for public
    # API access, leaving application Firebase authorization enabled.
    # If this deployer lacks permission, stop without changing public access.
    run("run", "services", "update", SERVICE,
        f"--project={PROJECT}", f"--region={REGION}",
        "--no-invoker-iam-check", timeout=380)
    print("CHECK: public Cloud Run invocation enabled on real service")
    try:
        verify_public()
    except Exception:
        # Restore IAM protection if live probes fail, never conceal rollback failure.
        try:
            run("run", "services", "update", SERVICE,
                f"--project={PROJECT}", f"--region={REGION}",
                "--invoker-iam-check", timeout=380)
            print("ROLLBACK: service returned to IAM-private; no money/dispatch enabled")
        except RuntimeError:
            print("URGENT: could not confirm public IAM rollback; review Google Cloud Run Security tab")
        raise
    print("DONE: secure public production ONBOARDING backend only.")
    print("NEXT: internal mobile device validation and independent Stripe LIVE cutover.")
    print("NOT PUBLISHED: no App Store/Play approval; NO paid Travels until final cutover.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("STOP:", str(exc))
        sys.exit(1)
