#!/usr/bin/env python3
"""Prepare the REAL Cloud Run API for a controlled Render cutover.

Creates three endpoint signing-secret bindings and a PAUSED scheduler.
Rebuilds the already-commissioned REAL production service with the final
source guard. Does NOT bind live Stripe payment credentials, open public access,
change Stripe endpoints, turn on scheduled work, change a phone build or Render.
Never prints or saves plaintext secrets. Run in authenticated Cloud Shell.
"""
import base64
import getpass
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.error
import urllib.request

PROJECT = "american-rider-35688"
REGION = "us-east1"
SERVICE = "american-rider-api-production"
RUNTIME = f"ar-production-live-runtime@{PROJECT}.iam.gserviceaccount.com"
SCHEDULER_SA = f"ar-production-scheduler@{PROJECT}.iam.gserviceaccount.com"
SCHEDULER_SECRET = "ar-production-live-scheduler-token"
SCHEDULER_JOB = "ar-production-minute-sweeps"
WEBHOOKS = (
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_CONNECT_WEBHOOK_SECRET",
    "RESEND_WEBHOOK_SECRET",
)
SAFE_SOURCE = Path(__file__).with_name("stage-render-secrets.py")
spec = importlib.util.spec_from_file_location("stage_render_secrets", SAFE_SOURCE)
render_stage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(render_stage)
EXPECTED_REPO = render_stage.EXPECTED_REPO
SERVICE_ID = render_stage.SERVICE_ID


def stop(msg):
    raise RuntimeError(msg)


def shell(args, timeout=70, *, verbose=False):
    # Credentials are never passed in command-line arguments.
    try:
        p = subprocess.run(args, check=False, timeout=timeout,
                           stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except subprocess.TimeoutExpired:
        stop("Google CLI timeout. No payment/traffic cutover attempted.")
    if p.returncode:
        # Do not print command stderr; it may contain provider configuration.
        stop("Google CLI failed at " + " ".join(args[:3]) + "; no cutover.")
    if verbose:
        print("Cloud operation completed:", " ".join(args[:3]))
    return p.stdout.decode().strip()


def google(*args, timeout=70):
    return shell(["gcloud", "--quiet", *args], timeout=timeout)


def google_json(*args):
    try:
        return json.loads(google(*args, "--format=json"))
    except ValueError:
        stop("Unexpected Google API metadata; no cutover.")


def github_head():
    repo = Path(__file__).resolve().parents[2]
    if Path.cwd().resolve() != repo:
        stop("Run from the Commercial repository root.")
    branch = shell(["git", "branch", "--show-current"])
    remote = shell(["git", "remote", "get-url", "origin"])
    if branch != "release/current" or EXPECTED_REPO not in remote:
        stop("Wrong repository or release branch.")
    if shell(["git", "status", "--porcelain"]):
        stop("Working directory has uncommitted changes.")
    local = shell(["git", "rev-parse", "HEAD"])
    tracked = shell(["git", "rev-parse", "refs/remotes/origin/release/current"])
    if local != tracked:
        stop("Run git pull --ff-only before commissioning.")
    return local


def service_info():
    return google_json("run", "services", "describe", SERVICE,
                       f"--project={PROJECT}", f"--region={REGION}")


def service_env(info):
    return {x.get("name"): x for x in info.get("spec", {}).get(
        "template", {}).get("spec", {}).get("containers", [{}])[0].get("env", [])}


def verify_safe_private(info):
    env = service_env(info)
    if info.get("spec", {}).get("template", {}).get("spec", {}).get(
            "serviceAccountName") != RUNTIME:
        stop("Production API runtime identity differs from the verified commissioning account.")
    if any(x in env for x in ("STRIPE_SECRET_KEY", "STRIPE_CONNECT_WEBHOOK_SECRET")):
        # A signing key can be present later, but never accept an actual money key.
        if "STRIPE_SECRET_KEY" in env:
            stop("STOP: real production API already has the LIVE Stripe key. Do not prepare twice.")
    if env.get("DEPLOYMENT_MODE", {}).get("value") != "development":
        stop("Live mode already selected; do not run preparation while operational.")
    if "AR_CLOUDRUN_CUTOVER_ACTIVE" in env and env[
        "AR_CLOUDRUN_CUTOVER_ACTIVE"].get("value") == "1":
        stop("Commercial cutover already enabled; refusing preparation.")
    policy = google_json("run", "services", "get-iam-policy", SERVICE,
                         f"--project={PROJECT}", f"--region={REGION}")
    if any(m in ("allUsers", "allAuthenticatedUsers") for b in policy.get(
            "bindings", []) for m in b.get("members", [])):
        stop("Service is already public. This script requires IAM-private preflight.")
    url = info.get("status", {}).get("url", "")
    if not re.fullmatch(r"https://[A-Za-z0-9.-]+\.run\.app", url):
        stop("Google Cloud Run URL was not verified.")
    return url


def find_secrets():
    rows = google_json("secrets", "list", f"--project={PROJECT}")
    result = {x.get("name", "").rsplit("/", 1)[-1] for x in rows}
    if SCHEDULER_SECRET not in result:
        stop("The earlier actual production commissioning scheduler credential is missing.")
    return result


def versions_of(keys):
    versions = {}
    for key in keys:
        name = "ar-render-import-" + key.lower().replace("_", "-")
        version = google_json("secrets", "versions", "describe", "latest",
                              f"--secret={name}", f"--project={PROJECT}")
        number = str(version.get("name", "")).rsplit("/", 1)[-1]
        if version.get("state") != "ENABLED" or not number.isdecimal():
            stop(f"Secret {name} has no enabled, pinned version.")
        versions[key] = (name, number)
    return versions


def grant_secret_access(names):
    member = "serviceAccount:" + RUNTIME
    for name in names:
        policy = google_json("secrets", "get-iam-policy", name, f"--project={PROJECT}")
        already = any(
            binding.get("role") == "roles/secretmanager.secretAccessor" and
            member in binding.get("members", [])
            for binding in policy.get("bindings", [])
        )
        if not already:
            google("secrets", "add-iam-policy-binding", name, f"--project={PROJECT}",
                   f"--member={member}", "--role=roles/secretmanager.secretAccessor")
        print("Secret access checked:", name)


# This is the alternate Google-assigned URI shown by the founder's successful
# production commission. Use only service URLs from the verified target/project.
VERIFIED_PRODUCTION_URL = (
    "https://american-rider-api-production-623854974930.us-east1.run.app"
)


def _health_probe(base_url, token=None, timeout=20):
    """(health_json, reason) for a PRIVATE Google service, never printing tokens.

    No state-changing endpoint is touched. Error responses are not read.
    """
    for path in ("/live", "/health"):
        headers = {"Accept": "application/json"}
        if token:
            headers["Authorization"] = "Bearer " + token
        req = urllib.request.Request(base_url + path, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as rsp:
                status = rsp.status
                response = json.loads(rsp.read(250_000))
        except urllib.error.HTTPError as exc:
            return None, f"{path} HTTP {exc.code}"
        except (urllib.error.URLError, TimeoutError) as exc:
            return None, f"{path} transport {type(exc).__name__}"
        except (ValueError, UnicodeDecodeError, TypeError) as exc:
            return None, f"{path} non-JSON {type(exc).__name__}"
        if status != 200 or not isinstance(response, dict):
            return None, f"{path} HTTP {status} (unexpected response)"
        if path == "/live" and response.get("ok") is not True:
            return None, "/live did not report ok"
        if path == "/health":
            return response, "ok"
    return None, "missing health response"


def _verify_health_data(health):
    """Do not infer launch-readiness from private liveness alone."""
    if health.get("stripe") != "no-key" or health.get("deployment") != "development":
        stop("Private API must have Stripe OFF and development mode before PREPARE.")
    if health.get("support", {}).get("firestore") != "on":
        stop("Private API cannot access Firebase/Firestore; no cutover.")
    if not isinstance(health.get("fleet", {}).get("operators"), int):
        stop("Private API Firestore count query unavailable; no cutover.")
    print("PASS: private production API, Firestore count and non-money mode verified.")


def _health_through_google_proxy():
    """Official gcloud private-service proxy, no public IAM grant or token logs.

    Only a locally bound ephemeral port is used, and the proxy is always stopped.
    """
    import socket
    import time
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    cmd = ["gcloud", "run", "services", "proxy", SERVICE,
           f"--project={PROJECT}", f"--region={REGION}", f"--port={port}"]
    try:
        proc = subprocess.Popen(cmd, stdin=subprocess.DEVNULL,
                                stdout=subprocess.DEVNULL,
                                stderr=subprocess.DEVNULL)
    except OSError:
        return None, "Google authenticated proxy could not start"
    reason = "proxy did not become ready within 45 seconds"
    try:
        for attempt in range(23):
            if proc.poll() is not None:
                reason = "Google authenticated proxy exited before responding"
                break
            health, result = _health_probe(f"http://127.0.0.1:{port}", timeout=2)
            if health is not None:
                return health, "ok"
            reason = "Google authenticated proxy: " + result
            time.sleep(1)
        return None, reason
    finally:
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=7)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=5)


def service_health(url):
    """Try both VERIFIED service addresses, then official Google private proxy.

    Cloud Run can report a modern *.a.run.app URI while also advertising its
    project-number.us-east1.run.app URI. The founder's initial production
    commissioning already proved the latter with an authenticated HTTP 200.
    A 401 on just one hostname must not start another staging/deployment cycle.
    """
    token = google("auth", "print-identity-token", timeout=30)
    candidates = [url]
    if VERIFIED_PRODUCTION_URL != url:
        candidates.append(VERIFIED_PRODUCTION_URL)
    failures = []
    for candidate in candidates:
        health, reason = _health_probe(candidate, token=token)
        if health is not None:
            _verify_health_data(health)
            print("Authenticated private Google endpoint: HTTP 200")
            return candidate
        failures.append(candidate.split("://", 1)[-1].split("/", 1)[0] +
                        " " + reason)
    # Google explicitly recommends gcloud run services proxy for developers
    # testing IAM-private Cloud Run services. The proxy handles auth itself.
    # Never make the production API public to bypass prelaunch health testing.
    print("Direct private invocation failed; trying Google's authenticated local proxy.")
    health, proxy_reason = _health_through_google_proxy()
    if health is not None:
        _verify_health_data(health)
        print("Authenticated Google Cloud Run proxy: HTTP 200")
        return url
    stop("Private Google API not reachable; " + "; ".join(failures) +
         "; " + proxy_reason + ". No secrets, Stripe, scheduler or stores changed.")



def stage_webhooks():
    api_key = getpass.getpass("Render API key (hidden in Cloud Shell; never in chat): ").strip()
    if not api_key:
        stop("No Render API key entered.")
    values = render_stage.render_environment(api_key)
    api_key = None
    needed = {key: values.get(key) for key in WEBHOOKS}
    if not all(isinstance(v, str) and v.strip() for v in needed.values()):
        stop("One or more current Render webhook signing keys are absent. Nothing copied.")
    for key in ("STRIPE_WEBHOOK_SECRET", "STRIPE_CONNECT_WEBHOOK_SECRET"):
        if not needed[key].startswith("whsec_"):
            stop(f"{key} is not a valid-looking Stripe signing secret.")
    if needed["RESEND_WEBHOOK_SECRET"] in ("[REDACTED]", "********") or \
            set(needed["RESEND_WEBHOOK_SECRET"]) <= {"*", "•"}:
        stop("Resend secret is masked; stop before copying.")
    print("Authenticated Render and found three active webhook signing secret NAMES.")
    token = render_stage.google_auth()
    outcomes = {}
    for key in WEBHOOKS:
        # Existing version is deliberately NOT overwritten (idempotent).
        outcomes[key] = render_stage.stage_one(key, needed[key], token)
        print(key, outcomes[key], "(contents hidden)")
    return outcomes


def refresh_service(versions, release):
    args = ",".join(f"{key}={name}:{number}" for key, (
        name, number) in versions.items())
    # First bind signing secrets without live money, then rebuild the backend
    # from the guarded approved release. This does NOT call any webhooks.
    google("run", "services", "update", SERVICE,
           f"--project={PROJECT}", f"--region={REGION}",
           f"--update-secrets={args}", timeout=380)
    google("run", "deploy", SERVICE, f"--project={PROJECT}", f"--region={REGION}",
           "--source=./backend", "--no-allow-unauthenticated",
           "--ingress=all", "--min-instances=0", "--max-instances=2",
           f"--update-env-vars=AR_RELEASE_COMMIT={release}",
           timeout=1200)
    info = service_info()
    verify_safe_private(info)
    service_health(info["status"]["url"])
    print("PASS: real production API uses updated guarded code; live payments still disabled.")


def scheduler_identity():
    accounts = google_json("iam", "service-accounts", "list", f"--project={PROJECT}")
    if SCHEDULER_SA not in {a.get("email") for a in accounts}:
        google("iam", "service-accounts", "create", "ar-production-scheduler",
               f"--project={PROJECT}", "--display-name=American Rider production scheduler")
    policy = google_json("run", "services", "get-iam-policy", SERVICE,
                         f"--project={PROJECT}", f"--region={REGION}")
    member = f"serviceAccount:{SCHEDULER_SA}"
    if not any(b.get("role") == "roles/run.invoker" and member in b.get(
            "members", []) for b in policy.get("bindings", [])):
        google("run", "services", "add-iam-policy-binding", SERVICE,
               f"--project={PROJECT}", f"--region={REGION}",
               f"--member={member}", "--role=roles/run.invoker")
    print("Cloud Scheduler dedicated invoker identity prepared.")


def scheduler_http(url, token, operation, payload=None, method="GET"):
    data = json.dumps(payload, separators=(",", ":")).encode() if payload is not None else None
    headers = {"Authorization": "Bearer " + token, "Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, headers=headers, data=data, method=method)
    try:
        with urllib.request.urlopen(req, timeout=25) as rsp:
            body = rsp.read(150_000)
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return {"__not_found__": True}
        stop(f"{operation}: HTTP {exc.code}; no dispatch changes.")
    except (urllib.error.URLError, TimeoutError):
        stop(f"{operation}: Cloud Scheduler API timed out. No dispatch changes.")


def scheduler_secret_value(token):
    name = f"projects/{PROJECT}/secrets/{SCHEDULER_SECRET}/versions/latest:access"
    url = "https://secretmanager.googleapis.com/v1/" + name
    data = scheduler_http(url, token, "Scheduler secret access")
    encrypted = data.get("payload", {}).get("data")
    if not encrypted:
        stop("Scheduler token secret unavailable; cannot set secure header.")
    raw = base64.b64decode(encrypted, validate=True).decode()
    if not re.fullmatch(r"[a-f0-9]{64}", raw):
        stop("Scheduler token has unexpected format.")
    return raw


def prepare_paused_scheduler(api_url):
    # Cloud Scheduler API stores header values in its job config; grant scheduler
    # admin/viewer access ONLY to trusted operators and do not print token or job
    # configuration. OIDC and a second shared secret both apply.
    google("services", "enable", "cloudscheduler.googleapis.com", f"--project={PROJECT}",
           timeout=120)
    scheduler_identity()
    token = google("auth", "print-access-token", timeout=30)
    rest = f"https://cloudscheduler.googleapis.com/v1/projects/{PROJECT}/locations/{REGION}/jobs"
    job_name = f"projects/{PROJECT}/locations/{REGION}/jobs/{SCHEDULER_JOB}"
    found = scheduler_http(rest + "/" + SCHEDULER_JOB, token, "Scheduler lookup")
    if not found.get("__not_found__"):
        if found.get("state") != "PAUSED":
            stop("Scheduler already exists and is not PAUSED; do not create a second clock.")
        target = found.get("httpTarget", {}).get("uri")
        if target != api_url + "/scheduled/sweep":
            stop("Existing paused scheduler targets unexpected URL.")
        print("Existing production minute scheduler is safely PAUSED.")
        return
    secret_header = scheduler_secret_value(token)
    job = {
        "name": job_name,
        "description": "American Rider commercial sweeps, PAUSED until controlled cutover",
        # No active production minute schedule during prepare; immediately pause.
        # This avoids running the private test before the switch.
        "schedule": "0 0 1 1 *",
        "timeZone": "Etc/UTC",
        "httpTarget": {
            "uri": api_url + "/scheduled/sweep",
            "httpMethod": "POST",
            "headers": {"x-scheduler-token": secret_header},
            "oidcToken": {"serviceAccountEmail": SCHEDULER_SA, "audience": api_url},
        },
        "retryConfig": {"retryCount": 0},
    }
    scheduler_http(rest, token, "Create inactive scheduler", payload=job, method="POST")
    scheduler_http(rest + "/" + SCHEDULER_JOB + ":pause", token,
                   "Pause scheduler", payload={}, method="POST")
    final = scheduler_http(rest + "/" + SCHEDULER_JOB, token, "Verify scheduler is paused")
    if final.get("state") != "PAUSED":
        stop("Scheduler was not confirmed paused! Do not cut over.")
    print("PASS: production Cloud Scheduler job exists but is PAUSED. No sweeps executed.")


def main():
    release = github_head()
    print("AMERICAN RIDER | commercial backend cutover preparation")
    print("Project:", PROJECT, "| Release:", release[:12])
    info = service_info()
    url = verify_safe_private(info)
    print("Final Cloud Run production service:", url, "(IAM-private)")
    url = service_health(url)
    print("Actions: stage 3 existing Render webhook secrets, bind to final PRIVATE API,")
    print("refresh source safeguards, prepare a PAUSED separate minute scheduler.")
    print("No Stripe live key, no payment transaction, no new webhook endpoint,")
    print("no public access, no customer API change and no Render changes.")
    print("Google API/Cloud Build/Secret Manager/Scheduler use can incur charges.")
    if input("Type PREPARE to proceed: ").strip() != "PREPARE":
        print("Cancelled without changes.")
        return
    stage_webhooks()
    version_map = versions_of(WEBHOOKS)
    grant_secret_access([item[0] for item in version_map.values()])
    refresh_service(version_map, release)
    prepare_paused_scheduler(url)
    print("READY FOR FINAL CUTOVER REVIEW. Render is STILL handling real payments and dispatch.")
    print("Do not activate Scheduler or change Stripe URLs until public API, payment keys,")
    print("real-money readiness and native client origin are verified together.")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, KeyboardInterrupt, ValueError) as exc:
        print("STOP:", str(exc) if not isinstance(exc, KeyboardInterrupt)
              else "Cancelled. No cutover attempted.", file=sys.stderr)
        sys.exit(1)
