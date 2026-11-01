#!/usr/bin/env python3
"""ONE-TIME protected scaling-only patch for EXISTING paid Cloud Run revision.
No source deploy, payment changes, auth changes, webhook changes, scheduler edits,
new mobile build, or new cost ceiling. Preserve old 100% traffic until READY.
Fail closed on any drift from authenticated 2026-11-01 evidence.
"""
import json, os, subprocess, time, urllib.request, urllib.error

PROJECT="american-rider-35688"
REGION="us-east1"
SERVICE="american-rider-api-production"
EXPECTED_OLD=SERVICE+"-00040-lcf"
RUNTIME="ar-production-live-runtime@"+PROJECT+".iam.gserviceaccount.com"
PUBLIC="https://american-rider-api-production-623854974930.us-east1.run.app/live"

class Stop(Exception): pass

def cli(*args, timeout=90):
    try:
        p=subprocess.run(["gcloud","--quiet",*args],
                         capture_output=True,timeout=timeout,check=False)
    except (OSError, subprocess.TimeoutExpired) as e:
        raise Stop("Cloud Run command unavailable or timed out") from e
    if p.returncode:
        # Do not echo gcloud stderr: it may include environment or identities.
        raise Stop("Cloud Run command failed (inspect protected action logs)")
    return p.stdout.decode("utf8","replace")

def meta(*args):
    try:
        return json.loads(cli(*args,"--format=json"))
    except (ValueError,TypeError) as e:
        raise Stop("Google metadata response invalid") from e

def service():
    return meta("run","services","describe",SERVICE,
                "--project="+PROJECT,"--region="+REGION)

def revision(name):
    if not isinstance(name,str) or not name.startswith(SERVICE+"-") or len(name)>110:
        raise Stop("Revision identity is not permitted")
    return meta("run","revisions","describe",name,
                "--project="+PROJECT,"--region="+REGION)

def one_live(s):
    t=[x for x in (s.get("status") or {}).get("traffic",[]) if x.get("percent")==100]
    if len(t)!=1 or not isinstance(t[0].get("revisionName"),str):
        raise Stop("Production traffic not a single verified revision")
    return t[0]["revisionName"]

def limit(rev):
    anns=(rev.get("metadata") or {}).get("annotations") or {}
    raw=anns.get("autoscaling.knative.dev/maxScale")
    return int(raw) if raw is not None and str(raw).isdigit() else 100

def service_limit(s):
    ann=(s.get("metadata") or {}).get("annotations") or {}
    n=(s.get("scaling") or {}).get("maxInstanceCount") or ann.get("run.googleapis.com/maxScale")
    try: return int(n)
    except (ValueError,TypeError): return None

def identity(rev):
    spec=rev.get("spec") or {}
    c=spec.get("containers") or []
    if len(c)!=1: raise Stop("Expected exactly one runtime container")
    return {"image":c[0].get("image"),"env":c[0].get("env"),
            "resources":c[0].get("resources"),
            "serviceAccountName":spec.get("serviceAccountName"),
            "concurrency":spec.get("containerConcurrency")}

def public_health():
    try:
        with urllib.request.urlopen(urllib.request.Request(
            PUBLIC,headers={"Accept":"application/json"}),timeout=15) as response:
            payload=json.loads(response.read(16000))
            return response.status==200 and payload.get("ok") is True
    except (OSError,ValueError,TypeError,urllib.error.HTTPError):
        return False

def verify_before(s,old):
    if one_live(s)!=EXPECTED_OLD or service_limit(s)!=20:
        raise Stop("Actual serving revision or service-wide cost ceiling drifted")
    if limit(old)!=2:
        raise Stop("Old revision no longer has the audited two-instance cap")
    base=identity(old)
    if not base["image"] or base["serviceAccountName"]!=RUNTIME or base["concurrency"]!=20:
        raise Stop("Serving image, runtime identity, or concurrency not as certified")
    vals={r.get("name"):r for r in base["env"] or []}
    if vals.get("DEPLOYMENT_MODE",{}).get("value")!="production" or (
        vals.get("AR_CLOUDRUN_CUTOVER_ACTIVE",{}).get("value")!="1" or
        vals.get("AR_EXTERNAL_SCHEDULER",{}).get("value")!="1" or
        "STRIPE_SECRET_KEY" not in vals or "STRIPE_CONNECT_WEBHOOK_SECRET" not in vals):
        raise Stop("Existing commercial payment/scheduler bindings are incomplete")
    if not public_health():
        raise Stop("Public live readiness failed before configuration-only change")
    return base

def validate_new(before,new_name,old_identity):
    if one_live(before)!=EXPECTED_OLD or service_limit(before)!=20:
        raise Stop("Serving traffic or service-level scaling cap changed during staging")
    new=revision(new_name)
    if (new.get('metadata') or {}).get('name')!=new_name:
        raise Stop('Candidate revision identity mismatch')
    if identity(new)!=old_identity:
        raise Stop("New candidate unexpectedly changed image, env, CPU, memory, or identity")
    if limit(new)!=100:
        raise Stop("New candidate did not remove revision-specific two-instance cap")
    return new

def wait_ready(name,old_identity):
    for _ in range(16):
        snap=revision(name)
        checks=(snap.get("status") or {}).get("conditions") or []
        ready=next((x.get("status") for x in checks if x.get("type")=="Ready"),"Unknown")
        if ready=="False": raise Stop("Configuration-only candidate not Ready")
        if ready=="True":
            return validate_new(service(),name,old_identity)
        time.sleep(5)
    raise Stop("Configuration-only candidate not proven ready")

def main():
    if (os.environ.get("GITHUB_REF")!="refs/heads/release/current" or
        os.environ.get("FOUNDER_CAPACITY_APPROVAL")!="SCALE_EXISTING_IMAGE_WITHIN_20"):
        raise Stop("Protected founder scaling-only approval and release branch required")
    old_s=service()
    old_name=one_live(old_s)
    old_rev=revision(old_name)
    old_identity=verify_before(old_s,old_rev)
    print("Verified original paid revision and service-level maximum 20, effective 2.")
    # --no-traffic guarantees no new revision receives a Traveler request yet.
    # 'default' clears revision max 2; Google's default is 100, but service max 20 remains.
    cli("run","services","update",SERVICE,"--project="+PROJECT,
        "--region="+REGION,"--max-instances=default","--no-traffic",timeout=350)
    staged=service()
    new_name=(staged.get("status") or {}).get("latestCreatedRevisionName")
    if not new_name or new_name==old_name:
        raise Stop("No newly created revision; current production traffic stays on old one")
    if one_live(staged)!=old_name:
        raise Stop("Unexpected live traffic shift; inspect immediately")
    wait_ready(new_name,old_identity)
    print("READY candidate with IDENTICAL running image, environment, payment secrets and concurrency.")
    try:
        cli("run","services","update-traffic",SERVICE,"--project="+PROJECT,
            "--region="+REGION,"--to-revisions="+new_name+"=100",timeout=180)
        current=service()
        if one_live(current)!=new_name or service_limit(current)!=20 or not public_health():
            raise Stop("Post-change production traffic, cap or health failed verification")
        validate=revision(new_name)
        if identity(validate)!=old_identity or limit(validate)!=100:
            raise Stop("New serving revision did not preserve application runtime")
        print("SUCCESS: same paid backend image, effective 20 instances x 20 concurrency; no mobile change.")
    except Exception as e:
        try:
            cli("run","services","update-traffic",SERVICE,"--project="+PROJECT,
                "--region="+REGION,"--to-revisions="+old_name+"=100",timeout=180)
            print("ROLLBACK: restored old paid revision's 100% traffic.")
        except Exception:
            print("URGENT: rollback could not be verified; inspect Cloud Run NOW.")
        raise Stop("Capacity-only production cutover was not certified") from e

if __name__=="__main__":
    try: main()
    except Stop as e:
        print("STOP:",str(e))
        raise SystemExit(1)
