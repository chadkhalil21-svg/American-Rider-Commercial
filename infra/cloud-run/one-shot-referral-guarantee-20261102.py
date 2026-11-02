#!/usr/bin/env python3
"""Pinned referral guarantee hotfix on existing paid Build 60 API.

Only seven audited referral source/test files differ from the already serving
Cloud Run release; no fare quote formula, Connect recovery or payout schedule
change. The existing protected paid deploy script stages zero traffic,
checks Stripe/scheduler bindings, then rolls back on failed public postflight.
"""
import importlib.util
import json
import os
import urllib.request

OLD_SHA = "1caf415"
NEW_SHA = "146e683"
PAID_SCRIPT = "/tmp/american-rider-controlled-referral-deployer.py"
spec = importlib.util.spec_from_file_location("ar_paid_controller", PAID_SCRIPT)
paid = importlib.util.module_from_spec(spec)
spec.loader.exec_module(paid)

def read_json(path, body=None):
    data=None if body is None else json.dumps(body).encode("utf-8")
    req=urllib.request.Request(paid.URL+path,data=data,
        headers={"Accept":"application/json",
                 **({"Content-Type":"application/json"} if data is not None else {})},
        method="POST" if body is not None else "GET")
    try:
        with urllib.request.urlopen(req, timeout=27) as resp:
            if resp.status!=200:
                raise ValueError("not OK")
            return json.loads(resp.read(100000))
    except Exception:
        raise paid.Stop("Public paid API unavailable; stop or restore previous traffic.") from None

def smoke_here_route():
    # Preserve earlier mapping fix, using only public non-customer coordinates.
    origin={"lat":25.7617,"lng":-80.1918}
    dest={"lat":25.7467,"lng":-80.2726}
    data=read_json("/route",{"pickup":origin,"dest":dest})
    points=data.get("coords")
    if (data.get("provider")!="here" or not isinstance(points,list)
        or not 2<=len(points)<=160
        or not isinstance(data.get("distanceMeters"),(int,float))
        or data["distanceMeters"]<=0
        or not isinstance(data.get("durationSec"),(int,float))
        or data["durationSec"]<=0):
        raise paid.Stop("Existing HERE road geometry no longer works; rollback required.")

def main():
    if os.environ.get("FOUNDER_CONFIRM")!="DEPLOY_EXISTING_PAID_CODE_ONLY":
        raise paid.Stop("Only previously authorized code-only deployment permitted.")
    health=read_json("/health")
    config=read_json("/config")
    if (health.get("commit")!=OLD_SHA or health.get("stripe")!="live"
        or health.get("deployment")!="production"
        or health.get("operationalReady") is not True
        or config.get("canTakePayment") is not True
        or config.get("manualTravelAuthorization") is not True):
        raise paid.Stop("Production Build 60 paid backend differs from certified baseline.")
    print("PASS: approved paid/capture baseline verified; no customer payments made.")
    original=paid.public_readiness
    def postflight(sha=None,require_manual_capture=False):
        original(sha,require_manual_capture=True)
        if sha is not None:
            if sha[:7]!=NEW_SHA:
                raise paid.Stop("New referral candidate SHA mismatch.")
            smoke_here_route()
            print("PASS: existing HERE route remained operational.")
    paid.public_readiness=postflight
    paid.main()

if __name__=="__main__":
    try:main()
    except paid.Stop as exc:
        print("STOP:",str(exc))
        raise SystemExit(1)
