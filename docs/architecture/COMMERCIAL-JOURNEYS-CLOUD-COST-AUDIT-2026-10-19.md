# American Rider | Commercial journeys, scale and cost audit | 19 October 2026

**Scope and limits.** Source review of the live production-branch app entrypoints, core Traveler/Operator state, authenticated backend, payments/settlements, provider webhooks, location/presence, geo matching, scheduled operations, insurance/screening, Google Cloud Run and store workflows; repository directory inventory and the comprehensive release/test suites. This is **not** a line-by-line human review of every fixture/translation/history file and is **not** a physical-device, real booking/payout, store approval, or independent legal certification. Findings refer to exact source and separately verified provider states, never synthetic claims of real Travels.

## Executive decision

1. **Paid platform from day one:** Cloud Run paid API was verified by [GitHub production run 39259246136](https://github.com/chadkhalil21-svg/American-Rider-Commercial/actions/runs/39259246136). Direct live Stripe API inspection confirmed the **two existing** live endpoints now point at Google (ordinary payments and Connect). These facts establish a paid-capable API and webhook destinations, not an already published app, a working real-world fleet, or a completed Travel.
2. **Complete one clock handoff:** Render's last observed server startup still enabled its 60-second in-process sweeps; Google's separate authenticated job was PAUSED. PR #137 removes an obsolete global screening attestation from the Google clock's payment-readiness check and was merged after 8/8 checks; **do not enable Google until Render sweep is actually disabled and confirmed restarted**. Verify Google one-minute OIDC and signed-token targeting, then release native apps.
3. **Individual Operator authority:** A person must pass genuine insurance, statutory screening, license, documents, consent, payout and current-duty checks before any offer, acceptance or dispatch. No first Operator is required merely to publish apps. A paid-capable API cannot promise an immediate completed Travel when there are zero eligible Operators: convey honest availability rather than charge without service.
4. **No premature H3 migration:** Existing Firestore geo queries use two geohash precisions, neighboring cells, bounded pages and an exact distance/eligibility matcher. Uber H3 is an alternative spatial partition, **not an automatic read-bill saving**. Migrating at launch adds dual indexes, migration writes and parity risk. Benchmark saturated neighborhoods and candidate recall first.

## Real product journeys (source inspection, not live device certification)

**Traveler:**
Sign in -> select permitted pickup/county -> search destination / move map pin -> server fare quote and all-in amount -> choose Travel class and party -> show exact live Stripe payment mode -> confirm payment -> durable ride in Firestore -> eligible Operator dispatch (or explicit no-car/pending state) -> live trip status, safety, messaging -> complete -> receipt and exact-source settlement/refund/reconciliation. Read `app/index.tsx`, `app/ride.tsx`, `app/schedule.tsx`, `src/state/RideContext.tsx`, `src/backend/payments.ts`, `backend/booking.js`, `backend/server.js` and `backend/payout-transfer-guard.js`. Actual payment and physical-device sequence still requires release acceptance; a mocked completed ride is not proof of charge/payout.

**Operator:**
Choose an active market -> edit profile/vehicle -> upload qualifying license/registration/insurance with evidence -> independently sourced screening case -> named Operations verification of exceptions -> Connect onboarding and payout readiness -> acknowledge disclosures -> attempt to commence operations -> server independently checks all qualifications and presence -> background-location renewal where permitted -> receive truthful offer, accept/decline -> complete Travel -> reconcile payout. Code in `app/operator/{qualify,documents,insurance,background,payouts,commissioned,index,trip}.tsx`, `src/state/OperatorContext.tsx`, `backend/qualification.js`, `backend/matching.js`, `backend/booking.js` and `src/backend/presence.ts`. PRs #48/#49 simplified market gating and multi-insurer comparisons; no exclusive insurer or CRA required. Operations review should work by **exception** with auditable decisions, not one Founder manually reading routine live GPS or every payment.

**Scheduled Travel and safety:**
Google minute scheduler is separate from paid API, and Firestore single-flight leases protect due dispatch/sweeps. Existing due-only index `(status, atMs)`, 60-second critical cadence, 30-minute insurance/screening maintenance, write suppression for unchanged waiting reasons and failure backoff are already in source. Do not run simultaneous Render/Google clocks. Smart Travel new bookings remain paused; independent Teen and general Courier service require separate evidence and must not be advertised as launch-certified.

## Practical database economics

**Immediate source fix in this PR:** `backend/geooperators.js` previously fetched the first 40 active-Operator documents for a full geohash prefix, **then refetched all first 120**. Change to first 40 plus **the next 80 only**, using Firestore's DocumentSnapshot cursor. This avoids up to 40 duplicated returned documents (25% fewer from a fully saturated 160-to-120 read window) per saturated prefix. Exact eligibility filtering, 120-candidate ceiling, both geographic tiers and neutral Operator selection remain unchanged. Synthetic tests cover a 125-Operator neighborhood, no overlap, hard ceiling and existing matcher parity. Empty or nonsaturated cells show no saving. Query index-entry/read billing can differ from these returned-document counts; verify in Google Metrics.

**Existing savings to preserve:** bounded neighbor lookups; lazy/capped historical pages; indexed due-only reservations; no repeated identical waiting-status writes; 15-second in-Travel position reports rather than every GPS fix; 90-second presence renewal and 5-minute stale cutoff; provider queues with durable idempotency and leases; Redis is NOT required to launch; no repeated external fare reference pulls on every quote.

**Candidate optimizations, deliberately not activated:**
- Measure Firestore query and index-entry reads by `nearbyOperatorCandidates` prefix, dispatch frequency, monitor snapshots and active vehicles. Reduce only proven wasted queries. Avoid caching current driver eligibility across accepting or completing Travels.
- Consider measured field index exemptions for non-query GPS telemetry (`opLat`, `opLng`, `opAt`, `stillSince`) **only after auditing every server query, rules, and composite index**; Firestore indexes impose write fanout and storage. Do not remove indexes based on comments alone.
- Profile low-motion stationary heartbeat/location changes and dynamic sampling to lower writes, but **preserve** duty freshness, lost-phone recovery, crash detection and real-time Traveler safety. Do not degrade legally consequential monitoring merely to save pennies.
- Measure Cloud Run CPU/concurrency, request time, cold starts and Firebase contention; tune `max-instances=2` and `concurrency=20` against observed request rate rather than claiming “40 Travels maximum.” H3 is an optional future benchmark, not a replacement mandate.

Official references:
- [Cloud Run pricing](https://cloud.google.com/run/pricing), [autoscaling](https://docs.cloud.google.com/run/docs/about-instance-autoscaling), [concurrency](https://docs.cloud.google.com/run/docs/tips/general)
- [Firestore pricing](https://firebase.google.com/docs/firestore/pricing), [index and hotspot guidance](https://firebase.google.com/docs/firestore/best-practices)
- [Uber H3](https://github.com/uber/h3), [H3 ring traversal](https://github.com/uber/h3/blob/master/website/docs/api/traversal.mdx)
- [Render pricing](https://render.com/pricing)
- [Florida 2026 TNC statute](https://www.flsenate.gov/Laws/Statutes/2026/627.748)

## Costs, company contribution and solo-Founder operations

Render currently supplies a 0.5 CPU/512 MB Starter web service nominally **$7 per month**. Google Cloud Run uses request-based compute and scale-to-zero plus a free allowance; charges vary with CPU-second, memory-second, request counts, egress, build/logging and database. **We do not have billing access to verify remaining $300 promotional credit**; source tests and screenshots alone cannot prove it. Avoid always-on extras and duplicate staging deployments. Make budget alerts and weekly cost/booking measurements, not unlimited autoscaling or blind “zero cost” promises.

For the source model's example **$17.50 fare + $2.50 minimum Platform Fee = $20 Traveler total**, domestic-card contribution is **$1.14 per completed Travel** after modeled Stripe, Connect, reserve and **only $0.25 operating allowance**; international-card modeled contribution **$0.84**. These are model values, **not profit** and not sufficient evidence that company insurance, legal advice, incident response, support, marketing or disputes can be funded. Source: `backend/economics.js` and `backend/paid-scale-economics.test.js`. Current fare schedule for Southeast Florida: $1 base + $0.95/mi + $0.32/min. Costs and fee floors are recomputed centrally, not promised fixed for every itinerary.

**One-Founder, one-phone rules:** automate routine onboarding reminders, expiry notifications, provider evidence intake, payout reconciliation and actionable exception summaries. Send only decisions requiring human lawful review to the Founder; do not auto-approve identity/insurance/background evidence. Do not infer real customer demand from synthetic tests. Set billing/spend/incident alerts, queue idempotent retries, ship direct GitHub/Google launch actions, minimize manual Cloud Shell interventions.

**Legal source check is not attorney consultation:** Florida Statutes §627.748(7)(d) states the TNC-maintained insurance must respond when the driver's insurance lapses or is inadequate. Requiring qualifying Operator policies and shutting off an ineligible Operator is prudent, but does **not by itself resolve** the TNC's statutory contingency obligation. Obtain qualified Florida transportation-insurance counsel advice on structure, endorsements and obligations; no simulated policy is legal proof. Operator documents are a separate individual prerequisite; this note does not add an inaccurate global background-vendor gate.

## Unfinished public-launch proof (not a source rewrite)

- Google paid API and both existing Stripe webhook destinations **verified**, not necessarily live delivered event success.
- Render sweep retirement and single Google Scheduler resumption **not yet verified**.
- PR #126 native production URL/build remains draft; publish signed iOS and Android builds, then Apple/Google app reviews. A working TestFlight build is not public App Store.
- Actual device payment/dispatch, real qualified fleet, native background duty, Stripe Connect account/payout and any applicable legal/insurer obligations remain **unverified**. Simulations are necessary for code but cannot fabricate vendor/store/coverage evidence.
