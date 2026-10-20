#!/usr/bin/env python3
"""Founder-approved CODE-ONLY update of an existing paid Cloud Run API.
Deploy --no-traffic, preserve the pre-existing money/secrets/clock settings,
then promote only a READY revision. Restore previous 100% traffic on failed probe.
This cannot set up Stripe, credentials, or a second scheduler.
"""
import json
import os
import re
import subprocess
import time
import urllib.request

PROJECT="american-rider-35688"
REGION="us-east1"
SERVICE="american-rider-api-production"
JOB="ar-production-minute-sweeps"
URL="https://american-rider-api-production-623854974930.us-east1.run.app"
EXPECTED_SCHEDULER_SA=f"ar-production-scheduler@{PROJECT}.iam.gserviceaccount.com"

class Stop(RuntimeError):
    pass

def cmd(*parts,timeout=100):
    try:
        p=subprocess.run(["gcloud","--quiet",*parts],stdout=subprocess.PIPE,
                         stderr=subprocess.PIPE,timeout=timeout,check=False)
    except (OSError,subprocess.TimeoutExpired):
        raise Stop("Cloud Run update failed or timed out. Inspect GitHub/Google logs.")
    if p.returncode:
        # stderr may contain provider values: deliberately do not echo it.
        raise Stop("Google refused the command. Traffic was not intentionally switched.")
    return p.stdout.decode("utf8","replace").strip()

def meta(*parts):
    try:
        return json.loads(cmd(*parts,"--format=json"))
    except (ValueError,TypeError):
        raise Stop("Google Cloud returned invalid metadata.")

def env(service):
    c=service.get("spec",{}).get("template",{}).get("spec",{}).get("containers",[{}])[0]
    return {x.get("name"):x for x in c.get("env",[])}

def require_single_traffic(service):
    rows=service.get("status",{}).get("traffic",[])
    full=[x for x in rows if x.get("percent")==100 and x.get("revisionName")]
    if len(full)!=1 or sum(x.get("percent",0) for x in rows)!=100:
        raise Stop("Service traffic is not a single known revision; refuse automatic migration.")
    return full[0]["revisionName"]

def assert_live(service,scheduler):
    e=env(service)
    if (e.get("DEPLOYMENT_MODE",{}).get("value")!="production" or
        e.get("AR_CLOUDRUN_CUTOVER_ACTIVE",{}).get("value")!="1" or
        e.get("AR_EXTERNAL_SCHEDULER",{}).get("value")!="1" or
        not e.get("STRIPE_SECRET_KEY",{}).get("valueFrom",{}).get("secretKeyRef") or
        not e.get("SCHEDULER_TOKEN")):
        raise Stop("Existing paid deployment is not fully configured; no changes made.")
    # The original scheduler activation permits either the canonical Cloud Run URL or
    # the Google-reported service status.url, which identifies the same live service.
    # Preserve those two exact alternatives; do not accept a wildcard destination.
    service_url = str(service.get("status",{}).get("url") or "").rstrip("/")
    accepted_urls = {URL+"/scheduled/sweep"}
    if service_url.startswith("https://") and SERVICE in service_url:
        accepted_urls.add(service_url+"/scheduled/sweep")
    target = scheduler.get("httpTarget",{})
    if scheduler.get("state")!="ENABLED":
        raise Stop("Production Scheduler is not ENABLED; existing dispatch clock required.")
    if target.get("uri") not in accepted_urls:
        raise Stop("Production Scheduler destination differs from both approved Cloud Run URLs.")
    if target.get("httpMethod") not in ("POST",1):
        raise Stop("Production Scheduler must invoke the existing POST sweep.")
    if target.get("oidcToken",{}).get("serviceAccountEmail")!=EXPECTED_SCHEDULER_SA:
        raise Stop("Production Scheduler has an unapproved OIDC service account.")
    if not target.get("headers",{}).get("x-scheduler-token"):
        raise Stop("Production Scheduler request authentication header is absent.")
    if scheduler.get("schedule")!="* * * * *":
        raise Stop("Production Scheduler is not on the authorized one-minute cadence.")
    return e

def public_readiness(sha=None):
    def read(route):
        try:
            with urllib.request.urlopen(urllib.request.Request(URL+route,
                 headers={"Accept":"application/json"}),timeout=30) as response:
                if response.status!=200:
                    raise Stop("Public readiness check failed.")
                return json.loads(response.read(200_000))
        except Exception:
            raise Stop("Public paid API is not accessible, or returned invalid JSON.") from None
    live,health,config=read("/live"),read("/health"),read("/config")
    if (live.get("ok") is not True or health.get("stripe")!="live" or
        health.get("deployment")!="production" or
        health.get("support",{}).get("firestore")!="on" or
        health.get("operationalReady") is not True or
        config.get("mode")!="live" or config.get("canTakePayment") is not True or
        not str(config.get("stripePublishableKey","")).startswith("pk_live_")):
        raise Stop("Real public money/Firestore readiness not established.")
    if sha and health.get("commit")!=sha[:7]:
        raise Stop("Public API source SHA does not match approved GitHub release.")
    return True


def wait_for_created_ready_revision(previous, attempts=16, delay_seconds=8):
    """Google may retain the previously routed revision in latestReadyRevisionName.

    A --no-traffic revision is eligible for promotion only when its OWN Cloud Run
    Revision Ready condition is True. Neither latestCreated alone nor a build exit
    code is sufficient proof. The old revision must retain 100% of traffic.
    """
    for attempt in range(attempts):
        service = meta("run", "services", "describe", SERVICE,
                       f"--project={PROJECT}", f"--region={REGION}")
        if require_single_traffic(service) != previous:
            raise Stop("Live service traffic changed during candidate startup; refuse promotion.")
        created = str(service.get("status", {}).get("latestCreatedRevisionName") or "")
        if created and created != previous:
            if not re.fullmatch(re.escape(SERVICE)+r"-[a-z0-9-]+", created):
                raise Stop("Google reported an unexpected revision name; no traffic change.")
            candidate = meta("run", "revisions", "describe", created,
                             f"--project={PROJECT}", f"--region={REGION}")
            if candidate.get("metadata", {}).get("name") != created:
                raise Stop("Google candidate revision metadata does not match the named revision.")
            conditions = candidate.get("status", {}).get("conditions", [])
            ready = next((c for c in conditions if c.get("type") == "Ready"), {})
            state = str(ready.get("status", "")).lower()
            if state == "true":
                print("New Cloud Run revision itself verified READY (zero-traffic):", created)
                return created, service
            if state == "false":
                # Condition messages and logs can contain configuration details. No payloads.
                raise Stop("New Cloud Run revision reports NOT READY; inspect revision in Google console.")
        if attempt + 1 < attempts:
            time.sleep(delay_seconds)
    raise Stop("Timed out waiting for a new, independently READY no-traffic revision; old traffic untouched.")


def main():
    sha=os.environ.get("GITHUB_SHA","")
    if os.environ.get("FOUNDER_CONFIRM")!="DEPLOY_EXISTING_PAID_CODE_ONLY" or not re.fullmatch(r"[0-9a-f]{40}",sha):
        raise Stop("Manual founder approval and exact current branch SHA required.")
    release=os.environ.get("GITHUB_REF","")
    if release!="refs/heads/release/current":
        raise Stop("Only release/current may update the paid backend.")
    before=meta("run","services","describe",SERVICE,f"--project={PROJECT}",f"--region={REGION}")
    scheduler=meta("scheduler","jobs","describe",JOB,f"--project={PROJECT}",f"--location={REGION}")
    old_env=assert_live(before,scheduler)
    old_revision=require_single_traffic(before)
    public_readiness()
    print("Verified one existing public paid backend and exactly one Google scheduler; no Stripe or Render change.")
    print("Previous 100% traffic revision:",old_revision)
    # --no-traffic keeps all customer requests on the known old revision.
    cmd("run","deploy",SERVICE,f"--project={PROJECT}",f"--region={REGION}",
        "--source=./backend","--no-traffic","--service-account=ar-production-live-runtime@american-rider-35688.iam.gserviceaccount.com",
        "--min-instances=0","--max-instances=2","--cpu=1","--memory=1Gi","--concurrency=20",
        f"--update-env-vars=AR_RELEASE_COMMIT={sha}",timeout=1800)
    # Do not compare only status.latestReadyRevisionName. The service's routed
    # pointer may remain old for a READY candidate created with --no-traffic.
    new_revision,after=wait_for_created_ready_revision(old_revision)
    assert_live(after,scheduler)
    now_env=env(after)
    if (now_env.get("STRIPE_SECRET_KEY",{}).get("valueFrom",{}).get("secretKeyRef") !=
        old_env.get("STRIPE_SECRET_KEY",{}).get("valueFrom",{}).get("secretKeyRef") or
        not set(old_env).issubset(set(now_env)) or
        now_env.get("AR_RELEASE_COMMIT",{}).get("value")!=sha):
        raise Stop("New revision changed critical configuration; old traffic untouched.")
    if require_single_traffic(after)!=old_revision:
        raise Stop("Unexpected customer traffic shift during no-traffic deploy.")
    # The candidate's own immutable Revision status, not the service's last READY
    # traffic pointer, was checked independently above. Rollback remains required
    # if the post-promotion public money/Firestore health or SHA check fails.
    print("New revision READY with original Stripe secret and provider bindings:",new_revision)
    try:
        cmd("run","services","update-traffic",SERVICE,f"--project={PROJECT}",
            f"--region={REGION}",f"--to-revisions={new_revision}=100",timeout=360)
        public_readiness(sha)
        print("SUCCESS: paid API updated to release/current",sha[:7],
              "; Google scheduler unchanged; both Stripe webhook URLs unchanged.")
    except Exception:
        try:
            cmd("run","services","update-traffic",SERVICE,f"--project={PROJECT}",
                f"--region={REGION}",f"--to-revisions={old_revision}=100",timeout=360)
            print("ROLLBACK: restored the last verified 100% traffic revision:",old_revision)
        except Exception:
            print("URGENT: automatic rollback unconfirmed; inspect Google Cloud Run revision traffic.")
        raise

if __name__=="__main__":
    try:
        main()
    except Stop as exc:
        print("STOP:",str(exc))
        raise SystemExit(1)
