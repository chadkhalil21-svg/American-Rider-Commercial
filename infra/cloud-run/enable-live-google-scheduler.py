#!/usr/bin/env python3
"""Resume EXACTLY one production Google sweep after Stripe/Render handoff.

NEVER run until the connected Render service has AR_EXTERNAL_SCHEDULER=1
and BOTH existing LIVE Stripe webhook endpoint URLs have been independently
verified pointing to the Google production service. This job has no Render/Stripe
credentials and cannot make that assertion itself. Owner must expressly confirm.
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

PROJECT = "american-rider-35688"
REGION = "us-east1"
SERVICE = "american-rider-api-production"
JOB = "ar-production-minute-sweeps"
CANONICAL = "https://american-rider-api-production-623854974930.us-east1.run.app"
EXPECTED_SCHEDULER = f"ar-production-scheduler@{PROJECT}.iam.gserviceaccount.com"


class Stop(RuntimeError):
    pass


def gcloud(*args, timeout=90):
    try:
        p = subprocess.run(["gcloud", "--quiet", *args],
                           stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                           check=False, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired):
        raise Stop("Google Scheduler command timed out or was unavailable.")
    if p.returncode:
        raise Stop("Missing Cloud Scheduler permission or failed Google command; dispatch not verified.")
    return p.stdout.decode("utf-8", "replace").strip()


def meta(*args):
    try:
        return json.loads(gcloud(*args, "--format=json"))
    except (ValueError, TypeError):
        raise Stop("Google Scheduler/service returned unexpected metadata.")


def verify_target(service, job):
    env = {e.get("name"): e for e in service.get("spec", {}).get(
        "template", {}).get("spec", {}).get("containers", [{}])[0].get("env", [])}
    if env.get("DEPLOYMENT_MODE", {}).get("value") != "production" or \
            env.get("AR_CLOUDRUN_CUTOVER_ACTIVE", {}).get("value") != "1":
        raise Stop("Real production API is not in paid operational mode.")
    if "STRIPE_SECRET_KEY" not in env or "SCHEDULER_TOKEN" not in env:
        raise Stop("Real production service lacks Stripe live or scheduled-dispatch key.")
    if env.get("AR_EXTERNAL_SCHEDULER", {}).get("value") != "1":
        raise Stop("Cloud Run's internal sweep must be disabled before external scheduling.")
    target = job.get("httpTarget", {})
    uri = target.get("uri", "")
    if uri not in (CANONICAL + "/scheduled/sweep",
                   service.get("status", {}).get("url", "").rstrip("/") + "/scheduled/sweep"):
        raise Stop("Google Scheduler destination does not match the actual final production API.")
    if target.get("httpMethod") not in ("POST", 1):
        raise Stop("Google Scheduler must invoke POST.")
    if target.get("oidcToken", {}).get("serviceAccountEmail") != EXPECTED_SCHEDULER:
        raise Stop("Google Scheduler OIDC identity differs from dedicated approved identity.")
    if not target.get("headers", {}).get("x-scheduler-token"):
        raise Stop("Google Scheduler header verification token is missing.")
    if job.get("state") != "PAUSED":
        raise Stop("Google minute dispatcher is not PAUSED; refuse duplicate activation.")


def public_paid_ready():
    def get_json(part):
        try:
            request = urllib.request.Request(
                CANONICAL + part, headers={"Accept": "application/json"})
            with urllib.request.urlopen(request, timeout=30) as rsp:
                if rsp.status != 200:
                    raise Stop(f"Paid Cloud Run {part} HTTP {rsp.status}")
                return json.loads(rsp.read(200_000))
        except (urllib.error.HTTPError, urllib.error.URLError,
                TimeoutError, ValueError) as exc:
            raise Stop(f"Paid Google API {part} unreachable: {type(exc).__name__}") from None
    health = get_json("/health")
    config = get_json("/config")
    # Platform money readiness is separate from each Operator's screening
    # and insurance. The server must still verify every Operator before duty.
    if (health.get("deployment") != "production" or health.get("stripe") != "live" or
        health.get("operationalReady") is not True or
        health.get("documents") != "on" or
        health.get("support", {}).get("firestore") != "on" or
        config.get("canTakePayment") is not True or config.get("mode") != "live" or
        not str(config.get("stripePublishableKey", "")).startswith("pk_live_")):
        raise Stop("Paid Google Cloud Run public service readiness was not proven.")
    return True


def activate():
    s = meta("run", "services", "describe", SERVICE,
             f"--project={PROJECT}", f"--region={REGION}")
    job = meta("scheduler", "jobs", "describe", JOB,
               f"--project={PROJECT}", f"--location={REGION}")
    verify_target(s, job)
    public_paid_ready()
    print("Verified paid Google Cloud Run and PAUSED signed/OIDC Google minute dispatcher.")
    print("Owner confirms both live Stripe endpoints now target Google AND Render sweep is disabled.")
    gcloud("scheduler", "jobs", "update", "http", JOB,
           f"--project={PROJECT}", f"--location={REGION}",
           "--schedule=* * * * *", "--time-zone=Etc/UTC", timeout=120)
    after = meta("scheduler", "jobs", "describe", JOB,
                 f"--project={PROJECT}", f"--location={REGION}")
    if after.get("schedule") != "* * * * *" or after.get("state") != "PAUSED":
        raise Stop("Google Scheduler update was not verified paused with once-per-minute cadence.")
    # verify_target validates OIDC header and exact URI without printing them
    verify_target(s, after)
    try:
        gcloud("scheduler", "jobs", "resume", JOB,
               f"--project={PROJECT}", f"--location={REGION}", timeout=120)
        now = meta("scheduler", "jobs", "describe", JOB,
                   f"--project={PROJECT}", f"--location={REGION}")
        if now.get("state") != "ENABLED" or now.get("schedule") != "* * * * *":
            raise Stop("Google live minute scheduler activation not confirmed.")
        if now.get("httpTarget", {}).get("uri") != after["httpTarget"]["uri"]:
            raise Stop("Google scheduler destination unexpectedly changed.")
    except Exception:
        try:
            gcloud("scheduler", "jobs", "pause", JOB,
                   f"--project={PROJECT}", f"--location={REGION}", timeout=120)
            print("ROLLBACK: Google scheduler paused again.")
        except Stop:
            print("URGENT: verify Google Scheduler job state manually; rollback was not confirmed.")
        raise
    print("LIVE: exactly one Google Cloud Scheduler job enabled, once per minute.")
    print("Cloud Run live money was enabled before this action. No Stripe endpoint changed by this job.")


def main():
    if os.environ.get("GITHUB_REF") != "refs/heads/release/current":
        raise Stop("Scheduler activation requires exact release/current branch.")
    import re
    if not re.fullmatch(r"[a-f0-9]{40}", os.environ.get("GITHUB_SHA", "")):
        raise Stop("Exact release SHA missing.")
    if os.environ.get("FOUNDER_CONFIRM") != "RENDER_DISABLED_STRIPE_GOOGLE_ENABLE_DISPATCH":
        raise Stop("Owner must expressly confirm Render clock disabled and both Stripe endpoints on Google.")
    activate()


if __name__ == "__main__":
    try:
        main()
    except Stop as exc:
        print("STOP:", str(exc), file=sys.stderr)
        sys.exit(1)
