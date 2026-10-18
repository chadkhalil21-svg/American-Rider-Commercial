# American Rider · Cloud Run staging isolation and release gates
2026-10-18 · Code preparation only. No production change, Google resource, key or paid service created.

## Purpose
Move the COMPLETE authenticated Node/Express API from Render to autoscaled Cloud Run, including all Travel booking, dispatch, safety, Stripe processing, Operator payouts, email orchestration, recovery and monitoring. Stripe, Resend, Firebase, Cloudflare R2 and HERE stay independent external providers. Render may continue hosting static web assets, not the production API after cutover. This PR does not change HERE autocomplete or location provider.

## Current state
- Commercial repository: chadkhalil21-svg/American-Rider-Commercial, release/current.
- Single Render production API remains authoritative. It has run out of workspace build-pipeline minutes; rerun on 2026-10-18 was still rejected, despite founder confirming an additional $2 payment. Existing deployment is unaffected.
- Google Cloud billing screenshot shows Postpay, $0 due and a $100 payment collection threshold. Confirm that the intended Firebase project `american-rider-35688` is associated with an active paid billing account in Google Console. This screenshot alone does not certify full service/project configuration.
- PR #84 mixes migration work with a separate, unapproved autocomplete provider change. THIS PR isolates infrastructure and preserves the existing production place search.

## Deployment safeguards
- Staging must be in a distinct project (never `american-rider-35688`). Set GitHub Environment `cloud-run-staging` with `STAGING_GCP_PROJECT_ID` and `STAGING_GCP_RUNTIME_SA` variables and `STAGING_GCP_WIF_PROVIDER`, `STAGING_GCP_DEPLOYER_SA` secrets, restricted to approved deployment branch. Set up least-privilege GitHub OIDC Workload Identity Federation. Never save a service-account JSON key.
- Manual workflow `.github/workflows/cloud-run-staging.yml` deploys ONLY after separate staging project, APIs, IAM and test Secret Manager credentials have been configured and owner-approved. Requires default release branch, is private and caps staging at 3 instances, 1 vCPU, 1 GiB, 20 concurrency, min 0. No live endpoints are redirected.
- Cloud Run service uses Google-managed runtime identity for Firestore instead of an exported Firebase private key. Staging identity must access only staging Firestore/Auth and test resources. No live Stripe or live Resend secrets are to be given to staging.
- Cloud Run fails to start without `AR_EXTERNAL_SCHEDULER=1` and `SCHEDULER_TOKEN`. The in-process 60s sweeps are disabled for Cloud Run and retained on Render. The existing Firestore lease governs external sweeps; optional maintenance intervals are kept in Firestore across instance restarts.
- Provision an authorized **Cloud Scheduler once-per-minute OIDC** POST job invoking `/scheduled/sweep` with a protected `x-scheduler-token` header; dedicated scheduler identity must have only Cloud Run Invoker access on the staging service. Limit project/job IAM access. Do not put token in a query string, repository or logs. Do not enable any second production operations scheduler until single-authority cutover.

## Required acceptance before LIVE
1. Merge only after CI proves the Cloud Run scheduling and identity guards. Set up separate staging GCP project, APIs, Artifact Registry, Firebase Auth/Firestore test data and indexes, Secret Manager and restricted Workload Identity Federation. The workflow does **not** provision these for the user.
2. Verify HTTP health, admin database connectivity, test-only Stripe webhook exact-signature verification, charge/refund/payout idempotency, Resend test, R2, routing, authorized email/teen/safety and physical-device flows.
3. Invoke ten competing scheduler requests. Confirm at-most-once leased work per tick and no duplicate booking, Stripe charge, payout, provider message or urgent Safety case. Test lease timeout, quota denial, server restart and stale-sweep alert.
4. Load-test 100, 1k, 10k and 100k *active Travels* with proportional on-duty Operator presence and realistic map/location read/write volumes; separately simulate booking/payment bursts and 100k completed Travels/day. Measure CPU/memory, provider rate limits, p95/p99 latency, Firestore quotas/billing, Cloud Run instance scaling and service costs. These are planned tests, not proven capacities.
5. After owner approves production GCP billing and resources, prepare single-authority cutover of API origin, webhook URL and scheduler. Use a tested rollback plan. Never run Render and Cloud Run simultaneously as independent payment/dispatch/settlement authorities.

## Cost guard
Cloud Run request-based billing has 2M monthly requests in its free allowance, plus compute/memory free tiers. Additional usage, Firebase, Google egress, Scheduler, Artifact Registry, Secret Manager, Cloud Build and other providers are billed separately. Set alerts, capped staging max instances and provider budgets. Prices: https://cloud.google.com/run/pricing .

This isolated PR is preparatory. It neither certifies 100k simultaneous Travels nor commissions Cloud Run or replaces Render.