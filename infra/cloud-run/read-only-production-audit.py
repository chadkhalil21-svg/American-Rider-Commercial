#!/usr/bin/env python3
"""READ-ONLY American Rider real Cloud Run production status from GitHub Actions.

The Workload Identity Federation service account uses an existing GitHub connection.
No secret payloads, Google credentials, identity tokens, phone/user data, endpoint
response bodies, or full IAM policies may be printed. No GCP changes are made.
"""
import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

PROJECT = "american-rider-35688"
REGION = "us-east1"
SERVICE = "american-rider-api-production"
SCHEDULER_JOB = "ar-production-minute-sweeps"
EXPECTED_RUNTIME = f"ar-production-live-runtime@{PROJECT}.iam.gserviceaccount.com"
EXPECTED_SCHEDULER_SA = f"ar-production-scheduler@{PROJECT}.iam.gserviceaccount.com"


def cli(*args, timeout=40):
    """Return private stdout or None, never emit untrusted Google CLI stderr."""
    try:
        r = subprocess.run(
            ("gcloud", "--quiet", *args), stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, timeout=timeout, check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    return r.stdout.decode("utf-8", "replace") if r.returncode == 0 else None


def metadata(*args):
    data = cli(*args, "--format=json")
    if data is None:
        return None
    try:
        return json.loads(data)
    except (ValueError, TypeError):
        return None


def public_invoker(policy):
    if not isinstance(policy, dict):
        return None
    return any(
        b.get("role") == "roles/run.invoker"
        and ("allUsers" in b.get("members", [])
             or "allAuthenticatedUsers" in b.get("members", []))
        for b in policy.get("bindings", [])
    )


def summary_of_service(info):
    spec = info.get("spec", {}).get("template", {}).get("spec", {})
    env = {i.get("name"): i for i in spec.get("containers", [{}])[0].get("env", [])}
    # Names only. Do not print even nonsecret env values except enum modes.
    return {
        "exists": True,
        "revision": info.get("status", {}).get("latestReadyRevisionName"),
        "url": info.get("status", {}).get("url"),
        "runtime_ok": spec.get("serviceAccountName") == EXPECTED_RUNTIME,
        "mode": env.get("DEPLOYMENT_MODE", {}).get("value", "unknown"),
        "cutover": env.get("AR_CLOUDRUN_CUTOVER_ACTIVE", {}).get("value", "not-set"),
        "external_scheduler_selected": env.get("AR_EXTERNAL_SCHEDULER", {}).get("value") == "1",
        "live_stripe_secret_bound": "STRIPE_SECRET_KEY" in env,
        "account_webhook_secret_bound": "STRIPE_WEBHOOK_SECRET" in env,
        "connect_webhook_secret_bound": "STRIPE_CONNECT_WEBHOOK_SECRET" in env,
        "resend_webhook_secret_bound": "RESEND_WEBHOOK_SECRET" in env,
        # This flag is an owner's assertion; it is not underlying FCRA evidence.
        "screening_workflow_attested": (
            env.get("SCREENING_EVIDENCE_WORKFLOW_VERIFIED", {}).get("value") == "true"
        ),
        "live_publishable_key_configured": "STRIPE_PUBLISHABLE_KEY" in env,
    }


def verify_http_through_proxy():
    """Try authenticated Cloud Run proxy using GitHub WIF. Never echo HTTP body."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    args = [
        "gcloud", "run", "services", "proxy", SERVICE,
        "--project", PROJECT, "--region", REGION,
        "--port", str(port),
    ]
    try:
        proc = subprocess.Popen(args, stdin=subprocess.DEVNULL,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except OSError:
        return "unknown (proxy could not start)"
    status = "unknown (GitHub deployer may lack Cloud Run Invoker)"
    try:
        for _ in range(13):
            if proc.poll() is not None:
                break
            try:
                request = urllib.request.Request(
                    f"http://127.0.0.1:{port}/live",
                    headers={"Accept": "application/json"},
                )
                with urllib.request.urlopen(request, timeout=2) as response:
                    # Do not log or parse any application/user data.
                    return "HTTP " + str(response.status)
            except urllib.error.HTTPError as err:
                status = "HTTP " + str(err.code)
                if err.code in (401, 403):
                    break
            except (urllib.error.URLError, TimeoutError):
                pass
            time.sleep(1)
        return status
    finally:
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=6)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=4)


def audit():
    results = []
    risk = False
    info = metadata("run", "services", "describe", SERVICE,
                    f"--project={PROJECT}", f"--region={REGION}")
    if not isinstance(info, dict):
        results.append(("Production Cloud Run", "UNKNOWN (GitHub identity cannot read service metadata)"))
        return results, False
    summary = summary_of_service(info)
    results.append(("Real production API", "deployed" if summary["revision"] else "NOT READY"))
    results.append(("Google Cloud project", PROJECT))
    results.append(("Ready revision", summary["revision"] or "none"))
    results.append(("Runtime identity", "verified" if summary["runtime_ok"] else "UNEXPECTED"))
    results.append(("Deployment mode", summary["mode"]))
    results.append(("Commercial activation flag", summary["cutover"]))
    results.append(("Live Stripe key mounted", "yes" if summary["live_stripe_secret_bound"] else "no"))
    results.append(("Account/Connect/Resend signing keys", "/".join(
        "yes" if summary[k] else "no" for k in
        ("account_webhook_secret_bound", "connect_webhook_secret_bound", "resend_webhook_secret_bound")
    )))
    results.append(("External scheduler selected", "yes" if summary["external_scheduler_selected"] else "no"))
    results.append(("Operator screening evidence attestation", 
                    "set (independent proof required)" if summary["screening_workflow_attested"]
                    else "NOT SET — screening blocks commercial Travel"))
    results.append(("Live Stripe publishable key binding",
                    "present" if summary["live_publishable_key_configured"] else "NOT FOUND"))
    if not summary["runtime_ok"]:
        risk = True
    if summary["live_stripe_secret_bound"] and summary["cutover"] != "1":
        risk = True
    if summary["mode"] == "production" and not summary["live_stripe_secret_bound"]:
        risk = True

    policy = metadata("run", "services", "get-iam-policy", SERVICE,
                      f"--project={PROJECT}", f"--region={REGION}")
    exposed = public_invoker(policy)
    results.append(("Public invoker", {None: "UNKNOWN (missing audit permission)",
                                       False: "not configured", True: "configured"}[exposed]))
    if exposed and not summary["live_stripe_secret_bound"]:
        # Public without live money is not always unsafe, so highlight; do not fail.
        results.append(("Public/API money coherence", "PRELAUNCH: payment service still uncommissioned"))

    job = metadata("scheduler", "jobs", "describe", SCHEDULER_JOB,
                   f"--project={PROJECT}", f"--location={REGION}")
    if isinstance(job, dict):
        state = job.get("state", "unknown")
        target = job.get("httpTarget", {}).get("uri", "")
        correct_target = target.endswith("/scheduled/sweep") and SERVICE in target
        results.append(("Google Scheduler state", str(state)))
        results.append(("Google Scheduler destination", "production service" if correct_target else "UNEXPECTED"))
        if state != "PAUSED" and summary["cutover"] != "1":
            risk = True
        if not correct_target:
            risk = True
    else:
        results.append(("Google Scheduler state", "UNKNOWN (missing audit permission)"))

    results.append(("Private Google API /live", verify_http_through_proxy()))
    # Preparation vs commercial launch are deliberately separate. We NEVER infer
    # working payment capture or an approved Operator from an env-variable name.
    not_ready = []
    if not summary["live_stripe_secret_bound"]:
        not_ready.append("live Stripe payment key not mounted")
    if not summary["screening_workflow_attested"]:
        not_ready.append("Operator screening evidence not attested")
    if exposed is False:
        not_ready.append("public Google API not enabled")
    elif exposed is None:
        not_ready.append("public Google API IAM state unknown")
    if not summary["account_webhook_secret_bound"] or not summary["connect_webhook_secret_bound"]:
        not_ready.append("signed Stripe webhook bindings incomplete")
    if summary["cutover"] != "1" or summary["mode"] != "production":
        not_ready.append("commercial runtime not activated")
    results.append(("First store launch infrastructure", 
                    "PRELAUNCH: " + "; ".join(not_ready) if not_ready 
                    else "runtime configured; store/provider approvals still unverified"))
    return results, risk


def main():
    data, risk = audit()
    print("American Rider | LIVE GCP production metadata, READ ONLY")
    for name, value in data:
        print(name + ": " + str(value))
    print("This workflow cannot activate Stripe, dispatch, public invoker or store release.")
    report = os.environ.get("GITHUB_STEP_SUMMARY")
    if report:
        with open(report, "a", encoding="utf-8") as f:
            f.write("### American Rider Google Cloud Run production (read only)\n\n")
            for name, value in data:
                safe = str(value).replace("|", "/").replace("\n", " ")
                f.write("| " + name + " | " + safe + " |\n")
            f.write("\nNo real-money operation or Cloud Run mutation performed.\n")
    if risk:
        print("WARNING: observed an inconsistent live production configuration; investigate.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
