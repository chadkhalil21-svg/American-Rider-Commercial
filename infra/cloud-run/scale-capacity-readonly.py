#!/usr/bin/env python3
"""READ-ONLY, nonsecret Cloud Run capacity verification against the actual serving revision.

Never confuses deployment script settings with live service and regional quotas.
No production mutation, provider call, credential or arbitrary metadata printing.
"""
import json
import os
import subprocess

PROJECT="american-rider-35688"
REGION="us-east1"
SERVICE="american-rider-api-production"

def gcloud_json(*args):
    try:
        out=subprocess.run(["gcloud","--quiet",*args,"--format=json"],
                           capture_output=True,timeout=50,check=False)
        if out.returncode:
            return None
        return json.loads(out.stdout)
    except (OSError, subprocess.TimeoutExpired, ValueError, TypeError):
        return None

def positive_int(v):
    try:
        n=int(v)
        return n if n>0 and str(v).strip()==str(n) else None
    except (TypeError,ValueError):
        return None

def describe_capacity(service, revision):
    if not isinstance(service,dict):
        return {"verified":False,"reason":"service_read_unavailable"}
    s_ann=(service.get("metadata") or {}).get("annotations") or {}
    s_scale=service.get("scaling") or {}
    service_max=positive_int(s_scale.get("maxInstanceCount")) or positive_int(s_ann.get("run.googleapis.com/maxScale"))
    traffic=(service.get("status") or {}).get("traffic") or []
    active=[r for r in traffic if r.get("percent")==100]
    if len(active)!=1 or not active[0].get("revisionName"):
        return {"verified":False,"reason":"serving_revision_ambiguous"}
    name=active[0]["revisionName"]
    if not isinstance(revision,dict) or (revision.get("metadata") or {}).get("name")!=name:
        return {"verified":False,"reason":"active_revision_read_unavailable"}
    r_metadata=revision.get("metadata") or {}
    r_ann=r_metadata.get("annotations") or {}
    spec=revision.get("spec") or {}
    containers=spec.get("containers") or [{}]
    r_limit=positive_int(r_ann.get("autoscaling.knative.dev/maxScale"))
    # When absent, Cloud Run's published revision default is 100; this is not a
    # claim that regional CPU/memory quota supports that many concurrently.
    r_max=r_limit if r_limit is not None else 100
    concurrency=positive_int(spec.get("containerConcurrency")) or 80
    resources=(containers[0].get("resources") or {}).get("limits") or {}
    effective=min(service_max,r_max) if service_max is not None else r_max
    return {
        "verified":True,"revision":name,
        "service_level_max":service_max,
        "revision_max":r_max,"revision_max_explicit":r_limit is not None,
        "effective_configured_instances":effective,
        "configured_concurrency_per_instance":concurrency,
        "configured_in_flight_request_ceiling":effective*concurrency,
        "cpu":str(resources.get("cpu") or "unknown")[:20],
        "memory":str(resources.get("memory") or "unknown")[:20],
        "quota_verified":False,"measured_throughput_verified":False,
        "billing_safeguards_verified":False,
    }

def main():
    service=gcloud_json("run","services","describe",SERVICE,
                        "--project="+PROJECT,"--region="+REGION)
    traffic=((service or {}).get("status") or {}).get("traffic") or []
    active=[r for r in traffic if r.get("percent")==100]
    revision=None
    if len(active)==1:
        name=active[0].get("revisionName")
        if isinstance(name,str) and name.startswith(SERVICE+"-") and len(name)<128:
            revision=gcloud_json("run","revisions","describe",name,
                                 "--project="+PROJECT,"--region="+REGION)
    summary=describe_capacity(service,revision)
    print("American Rider LIVE Cloud Run capacity READ ONLY")
    for k,v in summary.items():
        print(k+": "+str(v))
    print("Not a load test, regional quota certificate or billing guarantee. No production changes.")
    path=os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with open(path,"a",encoding="utf8") as f:
            f.write("\n### Live serving Cloud Run capacity (read-only)\n\n")
            for k,v in summary.items():
                f.write("- "+k+": "+str(v).replace("|","/")+"\n")
    return 0 if summary.get("verified") else 1

if __name__=="__main__":
    raise SystemExit(main())
