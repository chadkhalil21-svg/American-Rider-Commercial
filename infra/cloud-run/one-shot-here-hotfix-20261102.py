#!/usr/bin/env python3
"""One-time, fail-closed HERE geometry check wrapping the existing paid-code rollout.

The standard controlled source deploy preserves Stripe, Cloud Run settings, live scheduler,
verifies a zero-traffic READY revision and automatically rolls back on post-cutover error.
This wrapper adds exact live-version preflight and a genuine /route geometry smoke check
*inside* that script's rollback-protected post-promotion verification.
"""
import importlib.util
import json
import os
import urllib.request

EXPECTED_OLD = "553fd54"
PAID_SCRIPT = "/tmp/american-rider-controlled-paid-source.py"
spec = importlib.util.spec_from_file_location("american_rider_paid_deploy", PAID_SCRIPT)
paid = importlib.util.module_from_spec(spec)
spec.loader.exec_module(paid)

def read_json(endpoint, data=None):
    headers = {"Accept": "application/json"}
    if data is not None:
        data = json.dumps(data).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(
        paid.URL + endpoint, data=data, headers=headers,
        method="POST" if data is not None else "GET")
    try:
        with urllib.request.urlopen(request, timeout=22) as response:
            if response.status != 200:
                raise ValueError("not HTTP 200")
            return json.loads(response.read(300000))
    except Exception:
        raise paid.Stop("Production verification endpoint failed; preserve or roll back old traffic.") from None

def route_smoke():
    # Two served South Florida points. No account, booking, payment or dispatch is created.
    source = {"lat": 25.7617, "lng": -80.1918}
    dest = {"lat": 25.7467, "lng": -80.2726}
    result = read_json("/route", {"pickup": source, "dest": dest})
    points = result.get("coords")
    if (result.get("provider") != "here" or
        not isinstance(points, list) or len(points) < 2 or len(points) > 160 or
        not isinstance(result.get("distanceMeters"), (int, float)) or result["distanceMeters"] <= 0 or
        not isinstance(result.get("durationSec"), (int, float)) or result["durationSec"] <= 0):
        raise paid.Stop("HERE road-route geometry not proven; rollback required.")
    for point in (points[0], points[-1]):
        if not isinstance(point, dict) or not isinstance(point.get("lat"), (int, float)) or not isinstance(point.get("lng"), (int, float)):
            raise paid.Stop("HERE geometry has invalid coordinates; rollback required.")
    if (abs(points[0]["lat"] - source["lat"]) > .03 or
        abs(points[-1]["lat"] - dest["lat"]) > .03):
        raise paid.Stop("HERE road route does not match requested endpoints; rollback required.")
    print("PASS real public South Florida HERE road geometry: two or more street points.")

def main():
    if os.environ.get("FOUNDER_CONFIRM") != "DEPLOY_EXISTING_PAID_CODE_ONLY":
        raise paid.Stop("Route-only rollout requires CODE_ONLY confirmation.")
    health = read_json("/health")
    config = read_json("/config")
    if (health.get("commit") != EXPECTED_OLD or
        health.get("stripe") != "live" or
        health.get("deployment") != "production" or
        health.get("operationalReady") is not True or
        config.get("canTakePayment") is not True or
        config.get("manualTravelAuthorization") is not True):
        raise paid.Stop("Current live paid/capture release differs from approved baseline; NO deployment.")
    print("PASS old production paid/capture version verified; no user payment performed.")
    original = paid.public_readiness
    def verified_readiness(sha=None, require_manual_capture=False):
        original(sha, require_manual_capture=True)
        if sha is not None:
            route_smoke()
    paid.public_readiness = verified_readiness
    paid.main()

if __name__ == "__main__":
    try:
        main()
    except paid.Stop as exc:
        print("STOP:", str(exc))
        raise SystemExit(1)
