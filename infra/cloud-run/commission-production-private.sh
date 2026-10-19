#!/usr/bin/env bash
# American Rider: one-command PRIVATE production-project Cloud Run commissioning.
# Purpose: prove that this exact GitHub release starts in the production GCP
# project, without moving Render traffic, operating live payments, or scheduling
# any Travel. This is a candidate, NOT the live production API cutover.
# Run in authenticated Cloud Shell:
#   cd ~/American-Rider-Commercial && git pull --ff-only
#   bash infra/cloud-run/commission-production-private.sh
set -Eeuo pipefail

PROJECT="american-rider-35688"
REGION="us-east1"
SERVICE="american-rider-api-production-candidate"
RUNTIME_SA="ar-production-runtime@${PROJECT}.iam.gserviceaccount.com"
SECRET="ar-production-private-candidate-scheduler-token"
EXPECTED_BRANCH="release/current"
EXPECTED_REPO="https://github.com/chadkhalil21-svg/American-Rider-Commercial.git"

fail() { echo "STOP: $*" >&2; exit 1; }
for command_name in gcloud git openssl curl; do
  command -v "$command_name" >/dev/null 2>&1 || fail "$command_name is required in Cloud Shell"
done
[[ "$(git branch --show-current)" == "$EXPECTED_BRANCH" ]] || fail "Switch to release/current before deployment."
[[ -f backend/server.js && -f backend/Dockerfile && -f PROJECT-LEDGER.md ]] || fail "Run from the American Rider Commercial repository root."
remote="$(git remote get-url origin)"
[[ "$remote" == "$EXPECTED_REPO" || "$remote" == "https://github.com/chadkhalil21-svg/American-Rider-Commercial" || "$remote" == "git@github.com:chadkhalil21-svg/American-Rider-Commercial.git" ]] || fail "Unexpected GitHub origin: refusing production project."
git diff --quiet && git diff --cached --quiet || fail "Working tree has local changes; refusing an unreviewed build."
LOCAL_HEAD="$(git rev-parse HEAD)"
REMOTE_HEAD="$(git rev-parse "refs/remotes/origin/$EXPECTED_BRANCH")"
[[ "$LOCAL_HEAD" == "$REMOTE_HEAD" ]] || fail "Run git pull --ff-only to deploy the current tracked release."
echo "American Rider | production-project private candidate"
echo "Production GCP project: $PROJECT | Region: $REGION"
echo "Verified release commit: $LOCAL_HEAD"
echo "No Render/API origin, Stripe, webhook, Cloud Scheduler or public-access switch."

gcloud projects describe "$PROJECT" --format='value(projectId)' >/dev/null || fail "Production project not accessible."
BILLING="$(gcloud billing projects describe "$PROJECT" --format='value(billingEnabled)')"
[[ "$BILLING" == "True" || "$BILLING" == "true" ]] || fail "Project billing has not been verified; no deploy attempted."
gcloud iam service-accounts describe "$RUNTIME_SA" --project="$PROJECT" >/dev/null || fail "Verified production runtime identity is missing."
# A list failure MUST NOT be mistaken for an empty project.
EXISTING="$(gcloud run services list --project="$PROJECT" --region="$REGION" --format='value(metadata.name)')" || fail "Cannot inspect existing production Cloud Run services."
if grep -Fxq "$SERVICE" <<<"$EXISTING"; then
  echo "Private candidate already exists: $SERVICE"
  gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='yaml(status.url,status.conditions,status.traffic)'
  echo "No redeployment performed. Do not confuse this private candidate with commercial cutover."
  exit 0
fi

# The application refuses to start on Cloud Run without a scheduler token.
# Generate a unique token in Google's own Secret Manager; NEVER print, store in
# GitHub, give it to the mobile app, or invoke the scheduler in this phase.
gcloud services enable secretmanager.googleapis.com --project="$PROJECT" --quiet
if ! gcloud secrets describe "$SECRET" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud secrets create "$SECRET" --project="$PROJECT" --replication-policy=automatic --quiet
fi
VERSIONS="$(gcloud secrets versions list "$SECRET" --project="$PROJECT" --filter='state:ENABLED' --format='value(name)')" || fail "Cannot read candidate secret version state."
if [[ -z "$VERSIONS" ]]; then
  # Do not retain the random token in a file or an environment variable.
  openssl rand -hex 32 | gcloud secrets versions add "$SECRET" --project="$PROJECT" --data-file=- --quiet >/dev/null
fi
gcloud secrets add-iam-policy-binding "$SECRET" --project="$PROJECT" \
  --member="serviceAccount:$RUNTIME_SA" --role="roles/secretmanager.secretAccessor" --quiet >/dev/null

# Only a PRIVATE candidate, with no live payments, external scheduler calls,
# live webhook forwarding, app API-origin change, or production provider keys.
# A distinct service name prevents overwriting the eventual operational API.
echo "Deploying PRIVATE Cloud Run production-project candidate. This can incur Google Cloud Build, Artifact Registry, Secret Manager and Cloud Run charges."
gcloud run deploy "$SERVICE" \
  --project="$PROJECT" --region="$REGION" --source="./backend" \
  --no-allow-unauthenticated \
  --ingress=all \
  --min-instances=0 --max-instances=2 --cpu=1 --memory=1Gi --concurrency=20 \
  --service-account="$RUNTIME_SA" \
  --set-env-vars="NODE_ENV=production,DEPLOYMENT_MODE=test,AR_EXTERNAL_SCHEDULER=1" \
  --set-secrets="SCHEDULER_TOKEN=$SECRET:latest" \
  --quiet

URL="$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(status.url)')"
[[ "$URL" == https://*.run.app ]] || fail "Deployment returned no verified run.app URL."
echo "=== PRIVATE CANDIDATE ==="
echo "Service: $SERVICE"
echo "Release source: $LOCAL_HEAD"
echo "URL: $URL (Google Cloud IAM authentication required)"
# Never print Google identity tokens to the console or log files.
STATUS="$(curl --silent --show-error --max-time 25 --output /dev/null --write-out '%{http_code}' \
  -H "Authorization: Bearer $(gcloud auth print-identity-token)" "$URL/live")" || fail "Authenticated /live connection failed."
echo "Authenticated /live HTTP $STATUS"
[[ "$STATUS" == 200 ]] || fail "Candidate is deployed but HTTP $STATUS; inspect Cloud Run IAM/revision before cutover."
echo "SUCCESS: The private production-project candidate responds. Live traffic and providers remain on Render."
echo "NEXT: Secure real production runtime configuration, separate scheduler, controlled one-authority traffic/webhook cutover, then genuine payment/dispatch/device acceptance."
