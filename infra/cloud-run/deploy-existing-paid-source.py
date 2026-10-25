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

def public_readiness(sha=None, require_manual_capture=False):
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
    if require_manual_capture and config.get("manualTravelAuthorization") is not True:
        raise Stop("Cloud Run public configuration does not confirm manual Travel authorization.")
    return True


def require_live_recruiter_links():
    """Never assert verified app links without checking official live JSON.
    No credentials, tokens, or account information are requested by this probe.
    """
    for name in ("/.well-known/apple-app-site-association",
                 "/.well-known/assetlinks.json"):
        try:
            with urllib.request.urlopen(
                urllib.request.Request("https://americanrider.tech"+name,
                    headers={"Accept":"application/json"}),timeout=20,
            ) as response:
                if response.status!=200:
                    raise ValueError("bad status")
                payload=json.loads(response.read(100_000))
            if name.endswith("apple-app-site-association"):
                apps=[app for detail in payload.get("applinks",{}).get("details",[])
                      for app in detail.get("appIDs",[])]
                if "6Z24V6YD4A.com.americanrider.app" not in apps:
                    raise ValueError("Apple association mismatch")
            else:
                records=[x for x in payload if x.get("target",{}).get("namespace")=="android_app"
                         and x.get("target",{}).get("package_name")=="com.americanrider.app"]
                if not any(re.fullmatch(r"(?:[0-9A-Fa-f]{2}:){31}[0-9A-Fa-f]{2}",fp)
                           for x in records for fp in x.get("target",{}).get("sha256_cert_fingerprints",[])):
                    raise ValueError("Google association missing verified signing fingerprint")
        except Exception:
            raise Stop("Native links are not yet verifiable at americanrider.tech; no paid recruiter activation.") from None
    for route in ("/recruitment/accept/","/recruiters/portal/"):
        try:
            with urllib.request.urlopen("https://americanrider.tech"+route,timeout=20) as response:
                if response.status!=200:
                    raise ValueError("page not available")
        except Exception:
            raise Stop("Live Recruiter acceptance or portal page is unavailable; no activation.") from None
    print("Verified official live association JSON and both Recruiter enrollment pages.")


def require_live_recruiter_web():
    """Verify real HTTPS landing and sign-in pages. Do not infer native association."""
    expected={
        "/join/":("join-referral-code","join-copy","/join/"),
        "/recruitment/accept/":("accept-panel","recruiters/accept","emailVerified"),
        "/recruiters/portal/":("recruiters/link","recruiters/me","emailVerified"),
    }
    for route,markers in expected.items():
        url="https://americanrider.tech"+route
        try:
            with urllib.request.urlopen(urllib.request.Request(url,
                headers={"Accept":"text/html"}),timeout=20) as response:
                if response.status!=200 or response.geturl()!=url:
                    raise ValueError("unexpected redirect or HTTP status")
                html=response.read(350_000).decode("utf8")
            if not all(x in html for x in markers):
                raise ValueError("missing required recruiter functionality")
        except Exception:
            raise Stop("Live web recruiter route "+route+
                       " is not verifiable; existing paid operations unchanged.") from None
    print("Verified website Recruiter acceptance, private portal, and referral-code fallback.")


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
    approval=os.environ.get("FOUNDER_CONFIRM")
    valid={"DEPLOY_EXISTING_PAID_CODE_ONLY","DEPLOY_AND_ACTIVATE_PAID_RECRUITERS"}
    if approval not in valid or not re.fullmatch(r"[0-9a-f]{40}",sha):
        raise Stop("Manual founder approval and exact current branch SHA required.")
    activate_recruiters=approval=="DEPLOY_AND_ACTIVATE_PAID_RECRUITERS"
    actor=os.environ.get("RECRUITER_FOUNDER_USERNAME","").strip()
    if activate_recruiters and not re.fullmatch(r"[A-Za-z0-9_-]{1,80}",actor):
        raise Stop("Activation needs your existing named Operations username, not a password.")

    # A one-time prelaunch feature activation uses the established paid-code
    # update machinery. Never permit an arbitrary flag string or quietly turn
    # on the separately unapproved cancellation or no-show fees.
    activation=os.environ.get("ENABLE_MANUAL_CAPTURE","")
    if activation not in ("", "FOUNDER_PRELAUNCH_MANUAL_CAPTURE"):
        raise Stop("Manual Travel capture activation confirmation is invalid.")
    enable_manual=activation=="FOUNDER_PRELAUNCH_MANUAL_CAPTURE"
    release=os.environ.get("GITHUB_REF","")
    if release!="refs/heads/release/current":
        raise Stop("Only release/current may update the paid backend.")
    before=meta("run","services","describe",SERVICE,f"--project={PROJECT}",f"--region={REGION}")
    scheduler=meta("scheduler","jobs","describe",JOB,f"--project={PROJECT}",f"--location={REGION}")
    old_env=assert_live(before,scheduler)
    if activate_recruiters:
        # Native associations are an optional convenience for signed apps.
        # Recruiter enrollment and compensated QR/manual-code referral have a
        # verified website route independent of Apple/Play signing timelines.
        require_live_recruiter_web()
        try:
            require_live_recruiter_links()
            native_links_verified=True
        except Stop:
            native_links_verified=False
            print("Signed iOS/Android app links unverified; use live web referral code fallback.")
        if not old_env.get("STRIPE_CONNECT_WEBHOOK_SECRET"):
            raise Stop("Live connected-account Stripe webhook secret is missing; no activation.")
        if not old_env.get("OPS_USERS") or not old_env.get("OPS_MFA_SECRETS"):
            raise Stop("Named Operations credentials and MFA are required for Founder invitations.")
    if enable_manual and (old_env.get("AR_MANUAL_CANCELLATION_FEE",{}).get("value")=="true" or
                          old_env.get("AR_VERIFIED_NO_SHOW",{}).get("value")=="true"):
        raise Stop("Separate cancellation or no-show charging is active; refuse feature activation.")
    old_revision=require_single_traffic(before)
    public_readiness()
    print("Verified one existing public paid backend and exactly one Google scheduler; no Stripe or Render change.")
    print("Previous 100% traffic revision:",old_revision)
    # --no-traffic keeps all customer requests on the known old revision.
    # Update ONLY the existing capture-mode flag on founder's specific request.
    # gcloud --update-env-vars is additive; all previous secrets, payment keys
    # and non-payment settings are preserved by Cloud Run.
    updates=f"AR_RELEASE_COMMIT={sha}"
    if enable_manual:
        updates+=",AR_MANUAL_TRAVEL_CAPTURE=true"
    if activate_recruiters:
        recruit_env={
            "AR_RECRUITER_PROGRAM_ENABLED":"1",
            "AR_RECRUITER_INVITES_ENABLED":"1",
            "AR_RECRUITER_WEB_ACCEPTANCE_VERIFIED":"1",
            "AR_RECRUITER_FINANCE_ENABLED":"1",
            "AR_RECRUITER_STRIPE_CONNECT_APPROVED":"1",
            "AR_RECRUITER_REWARDS_ENABLED":"1",
            "AR_RECRUITER_PAYOUT_SCHEDULE_APPROVED":"1",
            "AR_RECRUITER_STRIPE_PAYOUTS_ENABLED":"1",
            "AR_RECRUITER_TRAVEL_TRACKING_ENABLED":"1",
            "AR_RECRUITER_OPERATOR_SHARED_PAYOUT_ENABLED":"1",
            "AR_REFERRALS_ENABLED":"1",
            "AR_RECRUITER_WEB_REFERRAL_VERIFIED":"1",
            "AR_APP_LINKS_VERIFIED":"1" if native_links_verified else "0",
            "AR_RECRUITER_REWARD_HOLD_MS":"86400000",
            "AR_RECRUITER_MIN_PAYOUT_CENTS":"2500",
            "AR_RECRUITER_FOUNDER_USERS":actor,
        }
        updates+=","+",".join(k+"="+v for k,v in recruit_env.items())
    cmd("run","deploy",SERVICE,f"--project={PROJECT}",f"--region={REGION}",
        "--source=./backend","--no-traffic","--service-account=ar-production-live-runtime@american-rider-35688.iam.gserviceaccount.com",
        "--min-instances=0","--max-instances=2","--cpu=1","--memory=1Gi","--concurrency=20",
        f"--update-env-vars={updates}",timeout=1800)
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
    if enable_manual and now_env.get("AR_MANUAL_TRAVEL_CAPTURE",{}).get("value")!="true":
        raise Stop("New revision did not receive approved manual Travel capture flag.")
    if activate_recruiters and any(
        now_env.get(k,{}).get("value")!=v for k,v in recruit_env.items()
    ):
        raise Stop("Recruiter activation values not applied to READY revision; old traffic untouched.")
    if require_single_traffic(after)!=old_revision:
        raise Stop("Unexpected customer traffic shift during no-traffic deploy.")
    # The candidate's own immutable Revision status, not the service's last READY
    # traffic pointer, was checked independently above. Rollback remains required
    # if the post-promotion public money/Firestore health or SHA check fails.
    print("New revision READY with original Stripe secret and provider bindings:",new_revision)
    try:
        cmd("run","services","update-traffic",SERVICE,f"--project={PROJECT}",
            f"--region={REGION}",f"--to-revisions={new_revision}=100",timeout=360)
        public_readiness(sha, require_manual_capture=enable_manual)
        print("SUCCESS: paid API updated to release/current",sha[:7],
              "; Recruiter finance enabled:",activate_recruiters,
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
