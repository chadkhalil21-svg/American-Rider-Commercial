#!/usr/bin/env python3
"""Read-only serving Cloud Run, Stripe fee-report and payout readiness.

No Stripe charges, transfers, payouts, API writes, Cloud Run settings, user
records, Firestore writes, or signed app builds. Secret bytes are never logged.
This audit must never be used as permission to automatically collect money.
"""
import hashlib
import json
import re
import subprocess
import urllib.request

PROJECT="american-rider-35688"
REGION="us-east1"
SERVICE="american-rider-api-production"
REQUIRED_INDEX=["uid","status","incurredAt"]
REQUEST_TIMEOUT=20

def gcloud(*arguments):
    try:
        r=subprocess.run(["gcloud",*arguments,"--format=json"],
             stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,
             timeout=65,check=False)
        return json.loads(r.stdout) if r.returncode==0 else None
    except (OSError,ValueError,subprocess.TimeoutExpired):
        return None

def get_revision():
    service=gcloud("run","services","describe",SERVICE,
                   "--project="+PROJECT,"--region="+REGION)
    if not isinstance(service,dict):
        raise RuntimeError("Serving Cloud Run metadata unavailable")
    routed=[x.get("revisionName") for x in service.get("status",{}).get("traffic",[])
            if x.get("percent")==100 and x.get("revisionName")]
    if len(routed)!=1 or not routed[0].startswith(SERVICE+"-"):
        raise RuntimeError("Exactly one serving 100% revision not proven")
    data=gcloud("run","revisions","describe",routed[0],
                "--project="+PROJECT,"--region="+REGION)
    if not isinstance(data,dict):
        raise RuntimeError("Exact serving revision unavailable")
    containers=data.get("spec",{}).get("containers",[])
    if len(containers)!=1:
        raise RuntimeError("Serving container metadata unavailable")
    return routed[0],containers[0].get("env",[])

def stripe_key(env):
    secret=next((e.get("valueFrom",{}).get("secretKeyRef")
                 for e in env if e.get("name")=="STRIPE_SECRET_KEY"),None)
    if not isinstance(secret,dict):
        return None
    name=secret.get("name")
    version=secret.get("key","latest")
    if not isinstance(name,str) or not re.fullmatch(
        r"(?:projects/[A-Za-z0-9_-]+/secrets/)?[A-Za-z0-9_-]+",name):
        return None
    if not isinstance(version,str) or not re.fullmatch(r"[A-Za-z0-9_-]+",version):
        return None
    try:
        result=subprocess.run(["gcloud","secrets","versions","access",version,
                "--secret="+name,"--project="+PROJECT],
                stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,
                timeout=45,check=False)
        key=result.stdout.decode("utf-8").strip()
        return key if result.returncode==0 and key.startswith("sk_live_") else None
    except (OSError,UnicodeError,subprocess.TimeoutExpired):
        return None

def stripe_read(key,path):
    try:
        req=urllib.request.Request("https://api.stripe.com/v1/"+path,
           headers={"Authorization":"Bearer "+key,"Accept":"application/json"})
        with urllib.request.urlopen(req,timeout=REQUEST_TIMEOUT) as response:
            if response.status!=200:return None
            return json.loads(response.read(400000))
    except (OSError,ValueError):
        return None

def index_status():
    items=gcloud("firestore","indexes","composite","list",
                 "--project="+PROJECT,"--database=(default)")
    if not isinstance(items,list):return "unverified (insufficient metadata or permission)"
    for item in items:
        if item.get("collectionGroup")!="operator_connect_fee_obligations":continue
        names=[p.get("fieldPath") for p in item.get("fields",[])]
        if all(x in names for x in REQUIRED_INDEX):
            return "READY" if item.get("state")=="READY" else "NOT READY"
    return "NOT FOUND"

def main():
    revision,env=get_revision()
    flags={e.get("name"):e.get("value") for e in env if "value" in e}
    print("Live 100% traffic revision:",revision)
    for k in ["AR_RECRUITER_FINANCE_ENABLED",
              "AR_RECRUITER_REWARDS_ENABLED",
              "CONNECT_FEE_REPORT_AUTOMATION_ENABLED",
              "CONNECT_MONTHLY_REPORT_AUTOMATION_ENABLED",
              "CONNECT_VERIFIED_FEE_RECOVERY",
              "CONNECT_OPERATOR_CHOICE_PAYOUTS_VERIFIED",
              "CONNECT_STANDARD_PAYOUT_INTERVAL"]:
        val=flags.get(k)
        print("Gate "+k+":",("on" if val in ("1","enabled","true") else
              "manual" if k=="CONNECT_STANDARD_PAYOUT_INTERVAL" and val=="manual"
              else "off/unset" if val is None or val in ("0","false","disabled")
              else "configured (unverified)"))
    print("Required LIVE Firestore recovery index:",index_status())
    key=stripe_key(env)
    if not key:
        print("PROVIDER IDENTITY: UNVERIFIED, secret read permission unavailable")
        print("Provider report types and connected-account coverage: UNVERIFIED")
        print("No deductions, changes or provider actions performed.")
        return
    acct=stripe_read(key,"account")
    if not isinstance(acct,dict) or not str(acct.get("id","")).startswith("acct_"):
        print("PROVIDER IDENTITY: UNVERIFIED, authenticated account request failed")
        return
    print("PROVIDER IDENTITY: authenticated Stripe live account fingerprint",
          hashlib.sha256(acct["id"].encode()).hexdigest()[:16])
    accounts=stripe_read(key,"accounts?limit=1")
    print("Connect recipients:",
          "at least one" if accounts and len(accounts.get("data",[]))>0 else
          "none" if isinstance(accounts,dict) and accounts.get("data")==[] and
           accounts.get("has_more") is False else "unverified")
    types=stripe_read(key,"reporting/report_types?limit=100")
    if isinstance(types,dict):
        names=[t.get("id","") for t in types.get("data",[])]
        print("Stripe authenticated All Fees itemized report type:",
              "available" if "all_fees.balance_transaction_created.itemized.2" in names
              else "not confirmed")
        print("Stripe authenticated account-specific platform earnings report:",
              "candidate reported" if any(n.startswith("platform") and
              "earning" in n.lower() for n in names) else "not confirmed")
    else:
        print("Stripe fee report types: unverified")
    print("Express self-service manual/Instant payout controls require a verified Operator session.")
    print("No fees assessed, no payout schedule altered, no money moved.")

if __name__=="__main__":
    try:main()
    except RuntimeError as e:
        print("STOP:",str(e))
        raise SystemExit(1)
