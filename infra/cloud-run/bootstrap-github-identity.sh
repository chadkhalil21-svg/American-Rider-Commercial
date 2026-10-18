#!/usr/bin/env bash
# Reusable, idempotent GitHub OIDC + Cloud Run DEPLOYMENT IDENTITY setup.
# NO Cloud Run service, public traffic, payment key, Scheduler or Live Stripe change.
# Usage:
#   bash infra/cloud-run/bootstrap-github-identity.sh staging --apply
#   AR_APPROVE_PRODUCTION_IDENTITY=YES bash infra/cloud-run/bootstrap-github-identity.sh production --apply
# Both commands execute the SAME process. Do not hand-enter a dozen IAM commands.
set -Eeuo pipefail

REPO="chadkhalil21-svg/American-Rider-Commercial"
RELEASE_BRANCH="refs/heads/release/current"
MODE="${1:-}"
ACTION="${2:-}"
if [[ "$MODE" != "staging" && "$MODE" != "production" ]]; then
  echo "Usage: bash $0 staging|production [--apply]" >&2
  exit 2
fi

if [[ "$MODE" == "staging" ]]; then
  PROJECT="american-rider-staging-2026"
  NAME="staging"
else
  PROJECT="american-rider-35688"
  NAME="production"
fi
POOL="github-$NAME"
DEPLOYER="ar-$NAME-deployer@${PROJECT}.iam.gserviceaccount.com"
RUNTIME="ar-$NAME-runtime@${PROJECT}.iam.gserviceaccount.com"
PROVIDER="github"
EXPECTED_CONDITION="assertion.repository=='${REPO}' && assertion.ref=='${RELEASE_BRANCH}'"
API_SERVICES=(
  run.googleapis.com
  cloudbuild.googleapis.com
  artifactregistry.googleapis.com
  iam.googleapis.com
  iamcredentials.googleapis.com
  sts.googleapis.com
)
echo "American Rider | $NAME GCP bootstrap | project $PROJECT"
echo "Repository locked to $REPO on $RELEASE_BRANCH."
echo "Includes: verified APIs, restricted OIDC, deployer/runtime accounts,"
echo "deployment roles and a separate Cloud Build builder role, if resolvable."
echo "Excludes: Cloud Run services, payments, database data, public endpoints, key files."
if [[ "$ACTION" != "--apply" ]]; then
  echo "DRY RUN ONLY. To execute the same repeatable process: bash $0 $MODE --apply"
  exit 0
fi
if [[ "$NAME" == "production" && "${AR_APPROVE_PRODUCTION_IDENTITY:-}" != "YES" ]]; then
  echo "Production requires explicit AR_APPROVE_PRODUCTION_IDENTITY=YES (IAM only)." >&2
  exit 2
fi
command -v gcloud >/dev/null || { echo "Run from authenticated Google Cloud Shell." >&2; exit 1; }
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
[[ "$PROJECT_NUMBER" =~ ^[0-9]+$ ]] || { echo "Cannot confirm correct project number." >&2; exit 1; }
gcloud services enable "${API_SERVICES[@]}" --project="$PROJECT" --quiet

if ! gcloud iam workload-identity-pools describe "$POOL" \
  --project="$PROJECT" --location=global >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "$POOL" \
    --project="$PROJECT" --location=global \
    --display-name="American Rider GitHub $NAME"
fi

if gcloud iam workload-identity-pools providers describe "$PROVIDER" \
  --project="$PROJECT" --location=global \
  --workload-identity-pool="$POOL" >/dev/null 2>&1; then
  ACTUAL_CONDITION="$(gcloud iam workload-identity-pools providers describe "$PROVIDER" \
    --project="$PROJECT" --location=global --workload-identity-pool="$POOL" \
    --format='value(attributeCondition)')"
  if [[ "$ACTUAL_CONDITION" != "$EXPECTED_CONDITION" ]]; then
    echo "Existing GitHub provider condition differs; refusing to weaken/replace it." >&2
    exit 1
  fi
else
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" \
    --project="$PROJECT" --location=global --workload-identity-pool="$POOL" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
    --attribute-condition="$EXPECTED_CONDITION"
fi

for ACCOUNT in "ar-$NAME-deployer" "ar-$NAME-runtime"; do
  EMAIL="$ACCOUNT@${PROJECT}.iam.gserviceaccount.com"
  if ! gcloud iam service-accounts describe "$EMAIL" --project="$PROJECT" >/dev/null 2>&1; then
    gcloud iam service-accounts create "$ACCOUNT" --project="$PROJECT" \
      --display-name="American Rider $NAME ${ACCOUNT##*-}"
  fi
done

REPO_PRINCIPAL="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository/${REPO}"
gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER" \
  --project="$PROJECT" --role=roles/iam.workloadIdentityUser \
  --member="$REPO_PRINCIPAL" --quiet >/dev/null
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME" \
  --project="$PROJECT" --role=roles/iam.serviceAccountUser \
  --member="serviceAccount:$DEPLOYER" --quiet >/dev/null

for ROLE in roles/run.sourceDeveloper roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:$DEPLOYER" --role="$ROLE" \
    --quiet >/dev/null
done

# Google Cloud can use different identities for default Cloud Build.
# Inspect the actually configured one, not a guessed project-number identity.
BUILD_SA="$(gcloud builds get-default-service-account --project="$PROJECT" \
  --region=us-east1 --format='value(serviceAccount)' 2>/dev/null || true)"
BUILD_SA="${BUILD_SA##*/}"
if [[ "$BUILD_SA" == *"@"* ]]; then
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:$BUILD_SA" --role=roles/run.builder \
    --quiet >/dev/null
  echo "Cloud Build builder role confirmed for configured default build identity."
else
  echo "Cloud Build default identity not resolved; verify roles/run.builder before source deployment."
fi

echo "DONE: Identity/permission setup for $NAME. Existing resources were reused."
echo "Public workflow identifiers (NOT secrets):"
echo "  project_id: $PROJECT"
echo "  runtime_sa: $RUNTIME"
echo "  deployer_sa: $DEPLOYER"
echo "  workload_identity_provider: projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL/providers/$PROVIDER"
echo "NEXT: Separate Secret Manager, staging data, authenticated private deploy and smoke checks."
if [[ "$NAME" == "production" ]]; then
  echo "Production identity creation is NOT permission to switch live payments, webhooks or dispatch."
fi
