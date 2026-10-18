#!/usr/bin/env bash
# Explicitly connect an ALREADY existing Cloud Run API to a READY private Photon VM.
# Does not deploy, create or switch the main production API.
set -Eeuo pipefail
PROJECT="${AR_GCP_PROJECT_ID:-american-rider-35688}"
SERVICE="${AR_CLOUD_RUN_SERVICE:-}"
REGION="${AR_PHOTON_REGION:-us-east1}"
ZONE="${AR_PHOTON_ZONE:-us-east1-b}"
INSTANCE=american-rider-photon-us
if [[ -z "$SERVICE" || "${AR_PHOTON_CONFIRM_SWITCH:-}" != "ACTIVATE" ]]; then
  cat <<EOF
This changes the place-search configuration of an EXISTING Cloud Run service.
It does not create a Cloud Run backend or transfer payments. Only run AFTER
the private U.S. Photon VM is healthy and the Cloud Run service exists.

Example after real acceptance:
  AR_CLOUD_RUN_SERVICE=american-rider-api-staging \
    AR_GCP_PROJECT_ID=american-rider-staging-2026 \
    AR_PHOTON_CONFIRM_SWITCH=ACTIVATE \
    bash infra/photon/connect-cloudrun.sh
EOF
  exit 2
fi
gcloud run services describe "$SERVICE" --region="$REGION" --project="$PROJECT" >/dev/null
gcloud compute instances describe "$INSTANCE" --zone="$ZONE" --project="$PROJECT" >/dev/null
echo "Verifying REAL Photon private VM is serving U.S. results..."
gcloud compute ssh "$INSTANCE" --project="$PROJECT" --zone="$ZONE" \
  --tunnel-through-iap --command="curl -fsS --max-time 8 'http://127.0.0.1:2322/api?q=Miami&countrycode=US&limit=3' | grep -q '\"features\"'"
echo "Verified. Enabling Cloud Run private-range VPC traffic and Photon-first search..."
gcloud run services update "$SERVICE" --project="$PROJECT" --region="$REGION" \
  --network=american-rider-photon-net \
  --subnet=american-rider-photon-subnet \
  --vpc-egress=private-ranges-only \
  --update-env-vars="AR_PHOTON_PRIVATE_VPC=1,AR_PHOTON_SEARCH_URL=http://10.84.0.10:2322,AR_PLACE_SEARCH_PRIMARY=photon,AR_HERE_AUTOCOMPLETE_FALLBACK=0"
echo "Cloud Run Photon source updated. Next perform private authenticated /place-search"
echo "smoke checks and signed iPhone acceptance. Do not confuse this with the"
echo "paid Travel single-authority launch cutover."
