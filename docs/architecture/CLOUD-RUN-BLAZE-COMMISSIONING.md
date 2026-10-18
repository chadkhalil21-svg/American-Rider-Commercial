# Cloud Run + Firebase Blaze: one-time commissioning checklist
**Status: staged code, NOT commissioned. South Florida commercial production remains on Render until the acceptance tests and single-authority cutover are complete.**

## 0. Existing code and HERE source facts
- The current production branch uses own OSRM -> OTP for routing, with HERE as an exceptional route/toll authority.
- Its ordinary **destination autocomplete** still uses HERE, not just exceptional requests. PR #84 stages Geoapify primary, with 10-minute cached results, explicit outage-only HERE fallback and a capped per-instance rate. This must not be merged until licensed primary credentials, genuine POI/address quality, physical-device attribution, and peak request volume are validated. This is independent of the Cloud Run migration.
- Firestore reads/writes are paid to Firebase; the API server on Render or Cloud Run executes dispatch/eligibility/money and can itself make Firestore requests. Moving the API to Cloud Run does not remove Firestore charges.

## 1. Billing: founder-confirmed Blaze Free Trial (18 October 2026)
Founder-provided Firebase screenshots show a successful change to **Blaze via Google Cloud Free Trial**, with **$300 starting credit**, **90 days**, and a displayed trial expiration of **16 January 2027**. The screenshot also shows an entered **$25 billing budget**; that is not a subscription fee, and budget entry alone does **not** establish a completed alert or a hard spending cap. Google described the $50 card verification as a temporary authorization, not a service charge. Confirm in the project dashboard that the billing association is on exactly `american-rider-35688` before Google resource setup.

**Blaze is selected, but full paid billing is NOT yet activated:** Google says the trial account stops cloud resources if $300 is exhausted or the trial expires without an explicit upgrade. Before real-money production, the owner should activate **full pay-as-you-go billing** to avoid interruption; unused $300 credit remains usable until its original expiration. This enables reliable paid production but is a separate owner-approved financial decision. Confirm and configure billing alert thresholds; alerts are not general spending caps. Official sources: https://docs.cloud.google.com/free/docs/free-cloud-features , https://firebase.google.com/docs/projects/billing/budget-alerts .

## 2. Isolated staging project first
Create a **separate** staging Google Cloud/Firebase project, on an authorized billing account, to avoid synthetic tests changing live booking, payments, or screening. Enable Cloud Run Admin, Cloud Build, Artifact Registry, IAM Credentials, Secret Manager, Cloud Scheduler, Firebase Auth and Firestore APIs; commission test Firestore indexes/rules and test-mode resources only.

Create a Google **runtime service account** with least-privilege Firestore/Admin permissions for the *staging* project. Do not download or upload any JSON private-key files. The backend now uses Google Cloud Run's **Application Default Credentials** under `K_SERVICE`. Configure a separate GitHub deployer identity through **Workload Identity Federation** restricted to this repository + approved GitHub environment/branch. Never put credentials or tokens in chat, GitHub commits, or a static workflow.

Staging GitHub environment `cloud-run-staging` must hold:
- Variables: `STAGING_GCP_PROJECT_ID` (must **not** equal `american-rider-35688`), `STAGING_GCP_RUNTIME_SA` (email).
- Secrets: `STAGING_GCP_WIF_PROVIDER` and `STAGING_GCP_DEPLOYER_SA` (WIF provider name and deployer service-account email; neither is a private key).
- Google Secret Manager secret `ar-staging-scheduler-token` and grant its version access **only to the staging runtime service account**. The test scheduler job uses the same secret as a protected request header, with access limited to authorized project admins.

The **manual-only** workflow `.github/workflows/cloud-run-staging.yml` checks that the project is not `american-rider-35688`. It deploys `backend/Dockerfile` as a private Cloud Run service named `american-rider-api-staging`, max three 1-vCPU/1-GiB instances, no public access, `DEPLOYMENT_MODE=test`, and `AR_EXTERNAL_SCHEDULER=1`. It does **not** run or pay for anything until the GitHub project variables and Google identity are provisioned and an authorized person triggers the workflow. It does not provision production resources or activate live Stripe.

## 3. Cloud Scheduler, nonduplicated operations
Cloud Run services can scale down when idle or add multiple instances. The production server currently also contains minute-based timers. The staged code:
- **Refuses Cloud Run startup** unless `AR_EXTERNAL_SCHEDULER=1` and `SCHEDULER_TOKEN` are configured.
- Disables the in-process 60-second sweep timer for Cloud Run, retaining the **existing server-level Firestore leader lease** across instances.
- Persists optional maintenance cadence in `system_maintenance_cadence` Firestore rather than resetting it on each cold start. Critical scheduled Travel, active safety, assignments, booking recovery, provider/webhook recovery, and settlement sweeps are *not throttled by that optional cadence*.
- Keeps both GET/POST `/scheduled/sweep` authenticated. Unauthorized requests never invoke paid, safety or settlement work.

**A separate Cloud Scheduler job is required, exactly every minute.** Use an authenticated HTTP `POST` to `https://<private-staging-service>/scheduled/sweep`. Configure **Google OIDC** authentication with a dedicated Cloud Scheduler service account having *Cloud Run Invoker* on this staging service and an explicit URL audience. Include the `x-scheduler-token` app-level secret header configured through the authorized cloud setup; do not embed it in repository code, logs, or URL query strings. Restrict Cloud Scheduler job view/edit to authorized operators; its header configuration is sensitive.

Before marking live, demonstrate ten concurrent scheduler requests trigger at most one successful leased operational sweep; verify no duplicate Stripe charges, payout transfers, notifications, reservation assignments, or emergency cases. Test Firebase errors, quota exhaustion, process restart and lease expiry. The existing shared lease already prevents simultaneous duplicate jobs, but has **not** been independently exercised on actual Cloud Run. Set alerts for missed tick/lastSweepAt age and for 5xx / safety latency.

## 4. Cutover must remain one-authority
- Confirm the independent Cloud Run staging URL reports truthful health, authenticated Firebase reads/writes and configured secrets, maps/routing provider outcomes, email delivery, mobile push, iOS/Android devices and Stripe test-mode webhooks.
- Benchmark at 100/500/1,000/5,000/10,000 simultaneous active Travels **with realistic on-duty Operators, timers, Firebase listeners, booking bursts, and provider calls**; separately test completed Travels/day and peak request rate. Measure CPU, memory, response p95/p99, Safety minute coverage, Firestore billed operations, autoscaled instance count and total costs. These are acceptance tests, not assertions of existing capability.
- Establish production Google Cloud runtime identity and secrets through privileged user action, copy only verified credentials with least privilege. Set min warm instances only if low-latency demand warrants; bound max instances and place provider and Firestore budgets/alerts.
- Change payment webhook and app API endpoints **once** after readiness and roll back on tested failure. Do not let Render and Cloud Run each accept authoritative live webhooks or run time-critical sweeps concurrently. Retire Render only after successful reconciliation and customer device verification.
- Cost guard: Google Cloud billing is usage-based. Cloud Run has free allowance, but active instances, egress, Cloud Scheduler, Secret Manager, routing infrastructure, document downloads and Firestore all have independent costs.

Official sources:
- Firebase Blaze: https://firebase.google.com/docs/projects/billing/firebase-pricing-plans
- Cloud Run autoscaling: https://docs.cloud.google.com/run/docs/about-instance-autoscaling
- Cloud Run pricing: https://cloud.google.com/run/pricing
- Authenticated Cloud Scheduler: https://docs.cloud.google.com/run/docs/triggering/using-scheduler
- GitHub deploy action: https://github.com/google-github-actions/deploy-cloudrun
- Google GitHub WIF: https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines

**CURRENT OUTSTANDING OWNER APPROVAL/ACCESS:** upgrade `american-rider-35688` to Blaze if not already; authorize creation/billing of separate staging Google project and GitHub WIF integration. Without a Google Cloud/Firebase connector or authorized browser session, code review is possible here but the actual billing upgrade and Cloud Run creation cannot be performed or truthfully marked complete.
