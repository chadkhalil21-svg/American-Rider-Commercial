#!/usr/bin/env python3
"""Stage Render API environment values in Google production Secret Manager.

This script does NOT attach values to Cloud Run, change Render, call Stripe,
create a scheduler, enable public access, or move any customer traffic.
Only run in the founder's authenticated Google Cloud Shell. No secret values
or API keys are saved on disk, printed, committed to GitHub, or shared in chat.
"""
import base64
import getpass
import json
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

PROJECT = "american-rider-35688"
SERVICE_ID = "srv-daq8vlou01pc73f9qho0"
RENDER_BASE = "https://api.render.com/v1"
GOOGLE_BASE = f"https://secretmanager.googleapis.com/v1/projects/{PROJECT}"
EXPECTED_REPO = "chadkhalil21-svg/American-Rider-Commercial"
SKIP_EXACT = {
    "PORT", "NODE_ENV", "DEPLOYMENT_MODE", "AR_EXTERNAL_SCHEDULER",
    "AR_PRIVATE_CANDIDATE_NO_SCHEDULER", "K_SERVICE",
    "GOOGLE_APPLICATION_CREDENTIALS", "FIREBASE_SERVICE_ACCOUNT",
    "SCHEDULER_TOKEN", "STRIPE_WEBHOOK_SECRET",
    "STRIPE_CONNECT_WEBHOOK_SECRET", "GOOGLE_CLOUD_PROJECT", "GCP_PROJECT",
}
REVIEW_KEYS = {
    "PUBLIC_APP_URL", "PUBLIC_ORIGIN", "CORS_ORIGINS",
    "STRIPE_PUBLISHABLE_KEY", "FIREBASE_PROJECT_ID",
}
KEY_PATTERN = re.compile(r"^[A-Z][A-Z0-9_]*$")


class ApiFailure(RuntimeError):
    def __init__(self, operation, status):
        super().__init__(f"{operation}: HTTP {status}; no credential values displayed.")
        self.status = status


def request_json(url, token, operation, method="GET", data=None):
    """HTTPS JSON with finite timeout; never print request, token or response."""
    payload = json.dumps(data, separators=(",", ":")).encode("utf-8") if data is not None else None
    headers = {"Authorization": "Bearer " + token, "Accept": "application/json"}
    if payload is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=payload, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=20) as result:
            raw = result.read()
            return json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as exc:
        # HTTP response content could contain user secrets, so NEVER log it.
        raise ApiFailure(operation, exc.code) from None
    except (urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError(f"{operation}: network timeout/error; stopped safely.") from None


def render_environment(api_key):
    service = request_json(f"{RENDER_BASE}/services/{SERVICE_ID}", api_key, "Render service identity")
    record = service.get("service", service) if isinstance(service, dict) else {}
    if record.get("id") != SERVICE_ID or EXPECTED_REPO not in str(record.get("repo", "")):
        raise RuntimeError("Render service ID/repository did not match American Rider Commercial. Nothing copied.")
    values = {}
    cursor = None
    for page in range(1, 21):
        params = {"limit": "100"}
        if cursor:
            params["cursor"] = cursor
        url = f"{RENDER_BASE}/services/{SERVICE_ID}/env-vars?{urllib.parse.urlencode(params)}"
        rows = request_json(url, api_key, f"Render environment page {page}")
        if not isinstance(rows, list):
            raise RuntimeError("Unexpected Render environment response; nothing copied.")
        if not rows:
            break
        for row in rows:
            entry = row.get("envVar", {}) if isinstance(row, dict) else {}
            name, value = entry.get("key"), entry.get("value")
            if not isinstance(name, str) or not isinstance(value, str):
                raise RuntimeError("Render returned a missing or hidden environment value; nothing copied.")
            if name in values and values[name] != value:
                raise RuntimeError("Conflicting duplicate Render environment keys; nothing copied.")
            values[name] = value
        if len(rows) < 100:
            break
        next_cursor = rows[-1].get("cursor") if isinstance(rows[-1], dict) else None
        if not next_cursor or next_cursor == cursor:
            raise RuntimeError("Render pagination incomplete; nothing copied.")
        cursor = next_cursor
    else:
        raise RuntimeError("Render pagination exceeded bounded limit; nothing copied.")
    return values


def eligible_values(values):
    staged, excluded, invalid = {}, [], []
    for name, value in values.items():
        if name.startswith("RENDER_") or name in SKIP_EXACT or name.endswith("_WEBHOOK_SECRET"):
            excluded.append(name)
        elif not KEY_PATTERN.fullmatch(name):
            invalid.append(name)
        elif not value or value in ("*****", "********", "[REDACTED]"):
            invalid.append(name)
        else:
            staged[name] = value
    return staged, excluded, invalid


def google_auth():
    check = subprocess.run(
        ["gcloud", "projects", "describe", PROJECT, "--format=value(projectId)"],
        capture_output=True, text=True, timeout=30, check=True,
    )
    if check.stdout.strip() != PROJECT:
        raise RuntimeError("Wrong Google production project; no changes made.")
    token = subprocess.run(
        ["gcloud", "auth", "print-access-token"],
        capture_output=True, text=True, timeout=25, check=True,
    ).stdout.strip()
    if not token:
        raise RuntimeError("Google user access token missing.")
    return token


def stage_one(name, value, google_token):
    secret_id = "ar-render-import-" + name.lower().replace("_", "-")
    path = f"{GOOGLE_BASE}/secrets/{secret_id}"
    try:
        request_json(path, google_token, "Google secret lookup")
    except ApiFailure as exc:
        if exc.status != 404:
            raise
        # Strictly create a NEW secret; do not replace live production secrets.
        request_json(
            f"{GOOGLE_BASE}/secrets?{urllib.parse.urlencode({'secretId': secret_id})}",
            google_token, "Google secret creation", method="POST",
            data={"replication": {"automatic": {}}},
        )
    versions = request_json(f"{path}/versions?pageSize=100", google_token, "Google secret versions")
    if any(version.get("state") == "ENABLED" for version in versions.get("versions", [])):
        return "already-staged"
    request_json(
        f"{path}:addVersion", google_token, "Google secret version", method="POST",
        data={"payload": {"data": base64.b64encode(value.encode("utf-8")).decode("ascii")}},
    )
    return "staged"


def main():
    print("American Rider | Render → Google Cloud production SECRET STAGING")
    print("SOURCE: American-Rider-Server (verified Render service ID)")
    print(f"DESTINATION: {PROJECT} / Secret Manager only.")
    print("NO Cloud Run deployment, payment, webhook, scheduler, mobile or Render change.")
    print("No secret values, API keys, or tokens will be printed or written to files.")
    api_key = getpass.getpass("Enter a Render API key in Cloud Shell (hidden; never in ChatGPT): ").strip()
    if not api_key:
        raise RuntimeError("Render API key was not entered.")
    print("Reading Render directly over HTTPS...")
    values = render_environment(api_key)
    api_key = None  # Avoid retaining the token beyond the source read.
    staged, excluded, invalid = eligible_values(values)
    if invalid:
        raise RuntimeError("Some Render values were missing, masked or had unexpected keys: " +
                           ", ".join(sorted(invalid)) + ". No secrets copied.")
    if not staged:
        raise RuntimeError("Render returned no migration-eligible service values. No secrets copied.")
    print(f"Found {len(values)} directly-defined Render variables.")
    print(f"Eligible to stage: {len(staged)}; excluded platform/endpoint-specific: {len(excluded)}.")
    print("Excluded:", ", ".join(sorted(excluded)) or "none")
    print("Note: linked Render environment groups and Render secret files are NOT included.")
    print("Webhook signing secrets must be issued for the new endpoint; never reuse old URLs blindly.")
    print("Review before eventual binding:", ", ".join(sorted(REVIEW_KEYS.intersection(staged))) or "none")
    if "STRIPE_SECRET_KEY" not in staged:
        print("WARNING: No directly-defined STRIPE_SECRET_KEY; check linked Render environment groups.")
    print("This creates secrets in Google and may incur Secret Manager charges.")
    if input("Type STAGE to transfer eligible values to Google Secret Manager: ").strip() != "STAGE":
        print("Cancelled. No Google secrets created.")
        return
    google_token = google_auth()
    completed = 0
    try:
        for name in sorted(staged):
            outcome = stage_one(name, staged[name], google_token)
            print(f"{name}: {outcome} (contents hidden)")
            completed += 1
    finally:
        google_token = None
    print(f"COMPLETE: {completed} production provider/configuration values staged.")
    print("NOT ATTACHED to Cloud Run; Render is STILL the live API/payment authority.")
    print("Next: verify the provider key inventory, Firebase project/IAM, and safely")
    print("commission the new production API before an explicit single-authority cutover.")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        # Network/credential response bodies must not be printed.
        print("STOP:", str(exc) if isinstance(exc, RuntimeError) else "Google Cloud command failed.", file=sys.stderr)
        sys.exit(1)
