#!/usr/bin/env python3
"""One-time existing-image Connect fee evidence/recovery commissioning.

Only after actual live Firestore fee-recovery composite index exists and the
serving protected Build 60 referral release is healthy. No source rebuild, new
Stripe account, fabricated fee, user record write or bank payout. Existing
ledger requires authenticated provider invoice, exact account, signed consent,
and idempotent once-only settlement before any earnings offset.
"""
import importlib.util
import json
import subprocess
import time
import urllib.request

CONTROLLER = "/tmp/ar-protected-paid-controller.py"
PROJ = "american-rider-35688"
REGION = "us-east1"
SERVICE = "american-rider-api-production"
JOB = "ar-production-minute-sweeps"
EXPECTED_SHA = "2b65e98"
ENABLERS = {
    "CONNECT_FEE_REPORT_AUTOMATION_ENABLED": "enabled",
    "CONNECT_MONTHLY_REPORT_AUTOMATION_ENABLED": "enabled",
    "CONNECT_VERIFIED_FEE_RECOVERY": "enabled",
}
spec = importlib.util.spec_from_file_location("ar_paid_rollout", CONTROLLER)
paid = importlib.util.module_from_spec(spec)
spec.loader.exec_module(paid)

def cli(*args, timeout=90):
    p = subprocess.run(["gcloud","--quiet",*args],capture_output=True,timeout=timeout,check=False)
    if p.returncode:
        raise paid.Stop("Provider denied a production read/update; do not alter financial settings.")
    return p.stdout.decode("utf-8","replace")

def meta(*args):
    try:return json.loads(cli(*args,"--format=json"))
    except (ValueError, TypeError):raise paid.Stop("Google returned invalid production metadata.") from None

def read_public(route):
    try:
        with urllib.request.urlopen(urllib.request.Request(paid.URL+route,
            headers={"Accept":"application/json"}),timeout=26) as reply:
            if reply.status != 200:raise ValueError("not OK")
            return json.loads(reply.read(100000))
    except Exception:
        raise paid.Stop("Public paid Cloud Run verification failed.") from None

def verify_index():
    # A missing actual Firestore index would interrupt an Operator earnings
    # transfer if recovery were enabled. Never infer deployment from JSON source.
    try:
        output=cli("firestore","indexes","composite","list",
            "--database=(default)",f"--project={PROJ}",timeout=75)
        parsed=json.loads(output)
    except (ValueError,TypeError,subprocess.TimeoutExpired):
        raise paid.Stop("Live Firestore fee-recovery index cannot be verified.") from None
    if not isinstance(parsed,list):
        raise paid.Stop("Live Firestore index API shape is unverified.")
    for index in parsed:
        group=str(index.get("collectionGroup") or "")
        name=str(index.get("name") or "")
        if group!="operator_connect_fee_obligations" and "/collectionGroups/operator_connect_fee_obligations/" not in name:
            continue
        if str(index.get("state"))!="READY":
            continue
        fields=[(x.get("fieldPath"),str(x.get("order",""))) for x in index.get("fields",[])
                if x.get("fieldPath")!="__name__"]
        if fields==[("uid","ASCENDING"),("status","ASCENDING"),("incurredAt","ASCENDING")]:
            print("PASS actual READY Firestore index for one-Operator due-fee transfer.")
            return
    raise paid.Stop("LIVE required Firestore fee collection index is not READY; no activation.")

def identity(revision):
    spec=revision.get("spec") or {}
    containers=spec.get("containers") or []
    if len(containers)!=1:raise paid.Stop("Expected single paid container")
    c=containers[0]
    return {
      "image":c.get("image"),
      "serviceAccountName":spec.get("serviceAccountName"),
      "containerConcurrency":spec.get("containerConcurrency"),
      "resources":c.get("resources"),
      "maxScale":(revision.get("metadata",{}).get("annotations") or {}).get("autoscaling.knative.dev/maxScale"),
    }

def rev(name):
    return meta("run","revisions","describe",name,f"--project={PROJ}",f"--region={REGION}")

def service():
    return meta("run","services","describe",SERVICE,f"--project={PROJ}",f"--region={REGION}")

def scheduler():
    return meta("scheduler","jobs","describe",JOB,f"--project={PROJ}",f"--location={REGION}")

def assert_same_environ(before,after):
    old,new=paid.env(before),paid.env(after)
    allowed=set(ENABLERS)
    if (set(new)-set(old))!=allowed:
        raise paid.Stop("Unexpected new environment keys on the fee-only candidate.")
    for k,v in old.items():
        if k not in allowed and new.get(k)!=v:
            raise paid.Stop("Unapproved production environment/secret drift.")
    for k,v in ENABLERS.items():
        if k in old and old[k].get("value") not in (None,"","0","false"):
            raise paid.Stop("Fee switch was already configured unexpectedly.")
        if new.get(k,{}).get("value")!=v:
            raise paid.Stop("Fee evidence/recovery switch was not applied.")

def main():
    live=read_public("/health")
    conf=read_public("/config")
    if (live.get("commit")!=EXPECTED_SHA or live.get("stripe")!="live"
        or live.get("deployment")!="production"
        or live.get("operationalReady") is not True
        or conf.get("canTakePayment") is not True
        or conf.get("manualTravelAuthorization") is not True):
        raise paid.Stop("Correct live paid/capture/recruiter Build 60 version not serving.")
    before=service()
    old_name=paid.require_single_traffic(before)
    before_scheduler=scheduler()
    paid.assert_live(before,before_scheduler)
    oldrev=rev(old_name)
    before_id=identity(oldrev)
    if not before_id["image"] or before_id["containerConcurrency"]!=20:
        raise paid.Stop("Existing service runtime or capacity differs from certified setup.")
    old_env=paid.env(before)
    if (old_env.get("AR_RELEASE_COMMIT",{}).get("value","")[:7]!=EXPECTED_SHA
        or old_env.get("AR_RECRUITER_FINANCE_ENABLED",{}).get("value")!="1"
        or old_env.get("AR_RECRUITER_REWARDS_ENABLED",{}).get("value")!="1"
        or old_env.get("AR_MANUAL_TRAVEL_CAPTURE",{}).get("value")!="true"):
        raise paid.Stop("Serving paid/referral configuration changed; stop.")
    verify_index()
    print("PASS protected existing paid service, recruiter, manual capture and exact live fee index.")
    args=",".join(k+"="+v for k,v in ENABLERS.items())
    cli("run","services","update",SERVICE,
        f"--project={PROJ}",f"--region={REGION}",
        "--no-traffic",f"--update-env-vars={args}",timeout=540)
    new_name,_=paid.wait_for_created_ready_revision(old_name)
    staged=service()
    if paid.require_single_traffic(staged)!=old_name:
        raise paid.Stop("Traffic unexpectedly moved before validation.")
    if identity(rev(new_name))!=before_id:
        raise paid.Stop("Fee-only candidate image, scaling or identity drift.")
    assert_same_environ(before,staged)
    if scheduler()!=before_scheduler:
        raise paid.Stop("Production dispatch clock unexpectedly changed.")
    print("PASS new zero-traffic revision with IDENTICAL Build 60 source image and payment secrets.")
    try:
        cli("run","services","update-traffic",SERVICE,
            f"--project={PROJ}",f"--region={REGION}",
            f"--to-revisions={new_name}=100",timeout=200)
        after=service()
        if paid.require_single_traffic(after)!=new_name:
            raise paid.Stop("New revision not serving 100%.")
        assert_same_environ(before,after)
        if identity(rev(new_name))!=before_id or scheduler()!=before_scheduler:
            raise paid.Stop("Source, capacity or scheduler drift detected.")
        paid.public_readiness(sha=EXPECTED_SHA,require_manual_capture=True)
        print("SUCCESS provider-evidence-based fee import and one-time consent-gated recovery ENABLED.")
        print("No fees collected now; real invoices and recipient balances still require genuine provider evidence.")
    except Exception:
        try:
            cli("run","services","update-traffic",SERVICE,
                f"--project={PROJ}",f"--region={REGION}",
                f"--to-revisions={old_name}=100",timeout=180)
            if paid.require_single_traffic(service())==old_name:
                print("ROLLBACK last known paid revision restored.")
            else:
                print("URGENT rollback revision requires review.")
        except Exception:
            print("URGENT rollback unconfirmed.")
        raise paid.Stop("Fee-only cutover was not verified and is not certified.") from None

if __name__=="__main__":
    try:main()
    except paid.Stop as exc:
        print("STOP:",str(exc))
        raise SystemExit(1)
