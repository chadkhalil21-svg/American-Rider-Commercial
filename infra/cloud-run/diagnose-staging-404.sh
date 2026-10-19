#!/usr/bin/env bash
# Read-only investigation of a Google-front-end 404 on PRIVATE staging Cloud Run.
# Does not change IAM, endpoints, secrets, code, deployments, webhooks or billing.
# From an authenticated Cloud Shell: bash infra/cloud-run/diagnose-staging-404.sh
set -Eeuo pipefail

PROJECT=american-rider-staging-2026
REGION=us-east1
SERVICE=american-rider-api-staging
PORT=18765
PROXY_PID=
LOG_FILE=
cleanup() {
  if [[ -n "${PROXY_PID:-}" ]]; then
    kill "$PROXY_PID" >/dev/null 2>&1 || true
    wait "$PROXY_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "${LOG_FILE:-}" ]]; then rm -f "$LOG_FILE"; fi
}
trap cleanup EXIT

command -v gcloud >/dev/null || { echo 'Run in authenticated Google Cloud Shell (gcloud missing).' >&2; exit 1; }
command -v curl >/dev/null || { echo 'curl is required.' >&2; exit 1; }
command -v python3 >/dev/null || { echo 'python3 is required.' >&2; exit 1; }

echo 'AMERICAN RIDER — PRIVATE STAGING ONLY; READ-ONLY 404 DIAGNOSTIC'
echo "Project: $PROJECT | Region: $REGION | Service: $SERVICE"
SERVICE_JSON="$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format=json)"
printf '%s' "$SERVICE_JSON" | python3 -c '
import json,sys
d=json.load(sys.stdin)
a=d.get("metadata",{}).get("annotations",{})
s=d.get("status",{})
print("Ready:", ", ".join(str(c.get("type"))+"="+str(c.get("status")) for c in s.get("conditions",[])))
print("Ingress:",a.get("run.googleapis.com/ingress","unspecified"))
print("Ingress status:",a.get("run.googleapis.com/ingress-status","unspecified"))
print("Default URL disabled:",a.get("run.googleapis.com/default-url-disabled","not marked disabled"))
print("Traffic:",", ".join(str(x.get("revisionName",""))+":"+str(x.get("percent",0))+"%" for x in s.get("traffic",[])))
'

# List only Cloud Run's own advertised URLs, no guessed service names.
mapfile -t URLS < <(printf '%s' "$SERVICE_JSON" | python3 -c '
import json,sys
d=json.load(sys.stdin)
a=d.get("metadata",{}).get("annotations",{})
urls=[d.get("status",{}).get("url","")]
try:
  urls+=json.loads(a.get("run.googleapis.com/urls","[]"))
except (ValueError,TypeError):
  pass
seen=set()
for u in urls:
  if isinstance(u,str) and u.startswith("https://") and u.endswith(".run.app") and u not in seen:
    print(u); seen.add(u)
')
if (( ${#URLS[@]} == 0 )); then
  echo 'No advertised service URLs; investigate Cloud Run service metadata.'
  exit 2
fi

# Do not echo the ID token to the terminal, log, file or GitHub.
TOKEN="$(gcloud auth print-identity-token)"
if [[ -z "$TOKEN" ]]; then echo 'Active Google identity token unavailable.' >&2; exit 1; fi

echo '=== AUTHENTICATED /healthz (each advertised URL) ==='
DIRECT_CODES=()
for u in "${URLS[@]}"; do
  code="$(curl --silent --show-error --max-time 20 --output /dev/null --write-out '%{http_code}' \
    -H "Authorization: Bearer $TOKEN" "$u/healthz" || true)"
  [[ "$code" =~ ^[0-9]{3}$ ]] || code=000
  DIRECT_CODES+=("$code")
  printf '%s -> HTTP %s\n' "$u/healthz" "$code"
done
unset TOKEN

echo '=== OFFICIAL LOCAL AUTHENTICATED CLOUD RUN PROXY ==='
LOG_FILE="$(mktemp)"
# The proxy is a local temporary helper, not a second backend or paid service.
gcloud run services proxy "$SERVICE" --project="$PROJECT" --region="$REGION" \
  --port="$PORT" --quiet >"$LOG_FILE" 2>&1 &
PROXY_PID=$!
sleep 3
if kill -0 "$PROXY_PID" >/dev/null 2>&1; then
  proxy_code="$(curl --silent --show-error --retry 3 --retry-connrefused --retry-delay 1 \
    --max-time 20 --output /dev/null --write-out '%{http_code}' \
    "http://127.0.0.1:$PORT/healthz" || true)"
  [[ "$proxy_code" =~ ^[0-9]{3}$ ]] || proxy_code=000
  printf 'Authenticated localhost proxy /healthz -> HTTP %s\n' "$proxy_code"
else
  proxy_code=000
  echo 'Cloud Run proxy could not start (it may need its optional gcloud component).'
  tail -n 4 "$LOG_FILE" | sed -E 's/(Bearer|token|Authorization):? [^ ]+/[redacted]/Ig'
fi

echo '=== RECENT CLOUD RUN REQUEST 404 LOG ENTRIES ==='
if entries="$(gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="american-rider-api-staging" AND httpRequest.status=404' \
  --project="$PROJECT" --freshness=45m --limit=3 --format='value(timestamp)' 2>/dev/null)"; then
  if [[ -z "$entries" ]]; then echo 'None returned in the last 45 minutes.'; else printf '%s\n' "$entries"; fi
else
  echo 'Not readable by the current Google identity.'
fi

echo '=== INTERPRETATION ==='
for c in "${DIRECT_CODES[@]}" "$proxy_code"; do
  if [[ "$c" == 200 ]]; then echo 'At least one route succeeded. Endpoint is reachable; reconcile the failing hostname before production.'; exit 0; fi
done
if [[ " ${DIRECT_CODES[*]} $proxy_code " == *" 401 "* || " ${DIRECT_CODES[*]} $proxy_code " == *" 403 "* ]]; then
  echo 'An authentication/Invoker issue is possible. Keep service PRIVATE; inspect invoker permission and Google identity.'
elif [[ " ${DIRECT_CODES[*]} $proxy_code " == *" 404 "* ]]; then
  echo 'Google 404 still occurs. Check default-url-disabled, ingress and VPC Service Controls. If permissive with no request logs, preserve evidence and escalate to Google Cloud support; do not redeploy blindly.'
else
  echo 'No successful HTTP response. Review the service and the proxy output above.'
fi
echo 'No GCP resource, Stripe, Firestore, mobile or production setting was changed.'
