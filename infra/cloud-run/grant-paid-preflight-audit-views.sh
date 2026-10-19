#!/usr/bin/env bash
# ONE-TIME founder-authorized Google IAM bootstrap for the GitHub commercial VERIFY audit.
# Does not read any secret values or enable/deploy/switch any production service.
set -euo pipefail

PROJECT='american-rider-35688'
REGION='us-east1'
AUDITOR='ar-production-deployer@american-rider-35688.iam.gserviceaccount.com'
MEMBER="serviceAccount:${AUDITOR}"
SECRET='ar-render-import-stripe-secret-key'
JOB='ar-production-minute-sweeps'

echo 'American Rider: verify-only Google IAM for first paid launch'
echo 'Target: existing real production project, GitHub deployer identity'
echo 'Grants: Cloud Scheduler VIEWER at project, Secret Manager VIEWER on ONE Stripe secret.'
echo 'These roles allow job/secret metadata inspection, not payments or deployment.'
echo 'NOTE: Scheduler viewer can inspect job configuration, so grant only to the already trusted GitHub deployer.'
echo

test "$(gcloud projects describe "$PROJECT" --format='value(projectId)')" = "$PROJECT" || {
  echo 'STOP: Google project not verified'; exit 1;
}
test "$(gcloud iam service-accounts describe "$AUDITOR" --project="$PROJECT" --format='value(email)')" = "$AUDITOR" || {
  echo 'STOP: wrong GitHub Google identity'; exit 1;
}
gcloud secrets describe "$SECRET" --project="$PROJECT" --format='value(name)' >/dev/null || {
  echo 'STOP: expected live Stripe secret does not exist'; exit 1;
}
gcloud scheduler jobs describe "$JOB" --location="$REGION" --project="$PROJECT" --format='value(name)' >/dev/null || {
  echo 'STOP: expected Google scheduler missing'; exit 1;
}
read -r -p 'To add ONLY these two audit-viewer permissions, type GRANT_READ_ONLY: ' answer
if [[ "$answer" != 'GRANT_READ_ONLY' ]]; then
  echo 'Cancelled. No permissions changed.'
  exit 0
fi

# Viewer on project for state and target verification of the existing Scheduler job.
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="$MEMBER" \
  --role='roles/cloudscheduler.viewer' \
  --condition=None \
  --quiet >/dev/null
echo 'Granted Scheduler Viewer to trusted GitHub production deployer.'

# Metadata ONLY (versions.get) on one exact secret; no values/payload access.
gcloud secrets add-iam-policy-binding "$SECRET" \
  --project="$PROJECT" \
  --member="$MEMBER" \
  --role='roles/secretmanager.viewer' \
  --quiet >/dev/null
echo 'Granted Secret Manager Viewer scoped to the existing Stripe live secret.'

echo
echo 'DONE: No Stripe keys copied, no billing or customer changes, no scheduler resumed.'
echo 'GitHub production audit will automatically inspect these two prerequisites on the next release.'
