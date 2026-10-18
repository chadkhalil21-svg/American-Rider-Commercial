#!/usr/bin/env bash
# American Rider: explicit, billable and isolated Google Compute Engine provisioning.
# Run only from authenticated Google Cloud Shell with gcloud available.
# This script provisions Photon, NOT the booking backend or Stripe.
set -Eeuo pipefail
PROJECT_ID="${AR_GCP_PROJECT_ID:-american-rider-35688}"
ZONE="${AR_PHOTON_ZONE:-us-east1-b}"
REGION="${ZONE%-*}"
NETWORK=american-rider-photon-net
SUBNET=american-rider-photon-subnet
INSTANCE=american-rider-photon-us
DISK=american-rider-photon-data
PRIVATE_IP=10.84.0.10
if [[ "${AR_PHOTON_CONFIRM_BILLABLE:-}" != "INSTALL" ]]; then
  cat <<EOF
This installs the official Photon U.S. search index on an ALWAYS-ON Google
Compute Engine virtual machine and a persistent disk. It INCURS Google Cloud
compute, storage and outbound network charges. Photon software is free.
No live American Rider traffic or paid booking will be redirected.

Target project: $PROJECT_ID
Region: $REGION
Machine: e2-standard-2 (2 vCPU, 8 GB RAM)
Storage: 120 GB balanced persistent data disk + 30 GB boot disk
Private API: $PRIVATE_IP:2322
Requires: project billing, enabled Google Compute Engine API, authorized Cloud Shell.

Run with AR_PHOTON_CONFIRM_BILLABLE=INSTALL ONLY after checking the
actual Google Cloud budget, Photon-vs-HERE break-even, quality and licenses.
EOF
  if command -v node >/dev/null && [[ -f scripts/photon-cost-comparison.cjs ]]; then
    node scripts/photon-cost-comparison.cjs
  fi
  exit 2
fi
[[ "$PROJECT_ID" == "american-rider-35688" ||
   "$PROJECT_ID" == "american-rider-staging-2026" ]] || {
   echo "Refusing unexpected project. Manually review and update the allowlist."; exit 1;
}
command -v gcloud >/dev/null || { echo "Use authenticated Google Cloud Shell"; exit 1; }
gcloud config set project "$PROJECT_ID"
gcloud services enable compute.googleapis.com --project="$PROJECT_ID"
if ! gcloud compute networks describe "$NETWORK" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud compute networks create "$NETWORK" --project="$PROJECT_ID" --subnet-mode=custom
fi
if ! gcloud compute networks subnets describe "$SUBNET" --region="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud compute networks subnets create "$SUBNET" --project="$PROJECT_ID" \
    --network="$NETWORK" --region="$REGION" --range=10.84.0.0/24
fi
if ! gcloud compute firewall-rules describe american-rider-photon-vpc --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud compute firewall-rules create american-rider-photon-vpc --project="$PROJECT_ID" \
    --network="$NETWORK" --direction=INGRESS --priority=1000 \
    --allow=tcp:2322 --source-ranges=10.84.0.0/24 --target-tags=american-rider-photon-vm
fi
if ! gcloud compute firewall-rules describe american-rider-photon-iap-ssh --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud compute firewall-rules create american-rider-photon-iap-ssh --project="$PROJECT_ID" \
    --network="$NETWORK" --direction=INGRESS --priority=1000 \
    --allow=tcp:22 --source-ranges=35.235.240.0/20 --target-tags=american-rider-photon-vm
fi
if ! gcloud compute disks describe "$DISK" --zone="$ZONE" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud compute disks create "$DISK" --zone="$ZONE" --project="$PROJECT_ID" \
    --size=120GB --type=pd-balanced
fi
if gcloud compute instances describe "$INSTANCE" --zone="$ZONE" --project="$PROJECT_ID" >/dev/null 2>&1; then
  echo "VM already exists; no second billed instance created."
else
  SCRIPT_PATH=infra/photon/gce-vm-startup.sh
  [[ -s "$SCRIPT_PATH" ]] || { echo "Run this from the checked-out repository root: $SCRIPT_PATH missing"; exit 1; }
  gcloud compute instances create "$INSTANCE" --project="$PROJECT_ID" --zone="$ZONE" \
    --machine-type=e2-standard-2 \
    --network-interface="network=$NETWORK,subnet=$SUBNET,private-network-ip=$PRIVATE_IP" \
    --tags=american-rider-photon-vm \
    --image-family=ubuntu-2404-lts-amd64 --image-project=ubuntu-os-cloud \
    --boot-disk-size=30GB --boot-disk-type=pd-balanced \
    --disk="name=$DISK,device-name=photon-data,mode=rw,boot=no,auto-delete=no" \
    --metadata-from-file="startup-script=$SCRIPT_PATH" \
    --no-service-account
fi
cat <<EOF

Photon U.S. VM requested. The first installation may take substantial time
to download and verify the 10.5GB U.S. data archive.

Check status (Google Cloud Shell):
  gcloud compute ssh $INSTANCE --project $PROJECT_ID --zone $ZONE \
    --tunnel-through-iap --command='sudo tail -n 40 /var/log/ar-photon-bootstrap.log'

When ready, Photon should respond on PRIVATE $PRIVATE_IP:2322.
No public Photon endpoint or main-app switch was created.
Cloud Run must explicitly join $NETWORK / $SUBNET with private-ranges-only
Direct VPC egress BEFORE setting:
  AR_PHOTON_PRIVATE_VPC=1
  AR_PHOTON_SEARCH_URL=http://$PRIVATE_IP:2322
  AR_PLACE_SEARCH_PRIMARY=photon
EOF
