# American Rider | PR #143 replacement, paid-money safety and Firestore efficiency | 20 October 2026

## Scope and exact status

Baseline: `release/current` 7a4461a45b58a05d1114278f74d7975fb1875b8e. This branch is a **candidate** and does not change Google Cloud Run traffic, Stripe live keys, fee settings, operator payouts, service-area admission, Firebase indexes, scheduler or mobile release builds.

Already merged (do not cherry-pick obsolete branch wholesale):
- PR #65: Operator Economics screen, 99% Fare, separated Platform Fee, explanatory scenarios.
- PR #48/#49: open-first simplified Operator application, documents, screening and insurance comparisons.
- PR #151: auditable pickup GPS progress, cancellation fee behind OFF-by-default flag.
- PR #152: versioned consent before Connect enrollment, $2 monthly payout-active fee with no 20-Travel waiver; no retroactive billing.

This branch implements:
1. **Two fewer regular Firestore document reads per Operator renewal:** one fresh user and one fresh fleet snapshot reused for Stripe-cached readiness and the qualification gate. Firebase disabled-account check, fresh user evidence, current screening, insured coverage, payout confirmation, geography and server authority remain. No cross-request eligibility cache.
2. **Rebased, non-live payment-hold policy:** future saved-card consent / SetupIntent planning, authorize inside a roughly 24h dispatch window, require Stripe `requires_capture`, full ownership/amount match, real Charge `capture_before`, adequate time buffer, full capture only for verified completion, cancel authorization when no service/fee, and capped fee capture after server-verified cancellation only.
3. Two-pass source safety checks and 40,000 deterministic synthetic authorization cases. CI is the authoritative full-repository verification.

**NOT DONE:** integrating the hold policy into Stripe PaymentIntent creation, PaymentSheet UX, booked/scheduled journeys, due-work worker, webhooks, receipts, refunds, support reconciliation, transfers and durable idempotency. Current production auto-capture requires `succeeded`; merely setting `capture_method=manual` would break dispatch. No future hold mode shall be enabled merely because this policy module passes tests.

## PR #143 remaining money implementation contract

- Use server-owned, immutable ride prices and Stripe-intent ownership. Two mutually exclusive modes: existing `succeeded` automatic capture vs. opt-in new `requires_capture` manual capture. Never reinterpret the former as an uncollected hold or dispatch on an unconfirmed PI.
- For near-term Travel, check `latest_charge.payment_method_details.card.capture_before`, adequate time before pickup/estimated completion, issuer and card support, authorized amount including all applicable fees. For a booking farther than ~24h out, consent via SetupIntent, save method against the actual customer, authorize off-session when due, notify for 3DS/authentication failures; do not dispatch without authorization.
- Durable outbox with claim/lease and deduplication for authorization, capture, failed capture, expiration, cancellation, double-submit, rollback, and webhook redelivery. On unknown Stripe outcome, reconcile before any retry; never accidentally capture or refund twice.
- Traveler UI shows both reserved/authorized and charged status honestly, a plainly disclosed two-minute cancellation window, fee amount before final cancellation, and payment failures. Avoid misleading `paid` status while authorization is only pending.
- Separate Operator payout fee policy from **99% Fare entitlement** and the Traveler's `$2.50` minimum Platform Fee. The approved monthly `$2` payout-active account cost is versioned-consent gated (PR #152). Under Stripe's platform-priced Connect offering published pricing includes standard payout `0.25% + $0.25`, funds-routing `0.25%`, and Instant Payout `1%` where eligible. Before charging an Operator, confirm the actual connected account's pricing, the exact billed event and operator consent. Do not silently deduct fees from fare transfer; if card collection is unavailable, book a visible amount due rather than claim that costs have been recovered.
- Reconcile all historical and unconfirmed transfers first (issues #55/#56). Require actual signed sandbox Stripe transactions, 3DS/card-decline scenarios, multi-day authorization-expiry cases, idempotent sweeps and representative installed iOS/Android PaymentSheet paths before enabling production.

## Google, Uber H3 and engineering comparison: where to save reads and writes

**Already good:** geographic bounded nearest-first geohash lookup (PR #138), one-leased Google minute scheduler instead of another live clock, durable exception handling; due-only scheduled queries and a limited `needsPayout` settlement query. Do not recreate work already merged. Uber's H3 hex cells are a spatial indexing primitive, **not** a billing reduction mechanism. H3 parent/child coverage is approximate geometrically; naïve cell rings can miss riders/operators near borders. Benchmark H3-vs-geohash against the SAME operator dataset, exact distance ordering, boundary recall, p95 latency, billable index entries/read count and migration write overhead before considering a change. Do not install H3 or duplicate geospatial indexes just to say we use it.

**New immediate saving (this branch):** `POST /operator/online` previously read `users/{uid}` for the payout account, `operators/{uid}` for cached payout status, then both AGAIN for `assessOperator`. Reuse the two initial read results for all of these checks; retain an independent Auth disabled check and server eligibility, no weakening of stale-location 5-minute protection. At a *hypothetical* 90-second cadence over an 8-hour duty day, 320 renewals × 2 avoided reads = 640 reads per on-duty Operator-day. This is arithmetic, **not observed billing savings**; native foreground/background cadence varies.

**Next safe cost candidates, gated on instrumentation:**
1. **Operator account fee sweep:** currently loads all `operator_months/{month}/accounts` documents when assessing the prior month. Design a durable indexed due queue, bounded pages and checkpoint/wrap; do not just `limit(100)` and silently strand somebody owed a fee or refund. Only switch after READY production indexes and historical catch-up. Avoid monthly complete-travel counts: waiver has been repealed.
2. **Operator payouts:** reconcile a bounded server-owned outbox instead of scanning lifetime history; never trade uncertain funds for a lower Firestore bill (issues #55/#56). Separate earned vs Stripe transfer vs bank payout.
3. **Active Travel safety sweep:** `sweepMonitor` reads active accepted/arrived/onboard rides and writes `monitorSeen` only after meaningful movement. Retain the complete safety census; do not drop or sample explicit emergency reports to cut costs. Measure per-minute active count and unnecessary writes before narrowing indexes.
4. **Client listeners:** measure Firestore listener subscriptions/reconnects on app resume, account changes and map navigation, then share stable one-authenticated listener per active Travel rather than subscribing more than once. Do not slow required GPS/duty presence.
5. **Firestore indexes:** use Query Explain on Standard-edition production queries, inspect index entries scanned and unused descending/array/TTL field indexing; apply only verified-safe single-field exemptions. Never drop composite indexes required for payout, permission or safety queries. Sequential indexed timestamps can hotspot at 500 writes/second.
6. **Cloud Run:** tune concurrency, min/max instances, and memory using measured p50/p95/p99, CPU, latency and actual billed Firestore ops under synthetic production-like bursts. Do not assert 50k/100k/day from offline arithmetic alone.

## Legal / counsel review: NOT an attorney-client opinion

Founder requested counsel input. This record is **legal issue spotting from primary law and vendor documents, not a consultation with a retained attorney**. Qualified Florida transportation/insurance and payments/consumer counsel should confirm:
- The precise Florida TNC `§627.748` insurance obligations, including contingency if an individual Operator policy lapses. Individual policy verification does not by itself resolve every obligation imposed on the platform.
- Fare, cancellation and consent disclosures *before payment or cancellation*, how to treat Operator lateness/fault, no-show evidence, delayed trips, refunds and dispute/chargeback rights.
- Separate Operator payout-account and transfer fee agreement, card-on-file/off-session authorization, payout timing and any required notices.
- Teen Travel independent guardian consent and identity (launch gated until independent device/legal proof).

Primary references:
- https://firebase.google.com/docs/firestore/best-practices
- https://firebase.google.com/docs/firestore/query-explain
- https://docs.cloud.google.com/run/docs/about-concurrency
- https://h3geo.org/docs/
- https://h3geo.org/docs/highlights/indexing/
- https://stripe.com/connect/pricing
- https://docs.stripe.com/api/setup_intents
- https://docs.stripe.com/payments/place-a-hold-on-a-payment-method
- https://www.leg.state.fl.us/Statutes/index.cfm?App_mode=Display_Statute&URL=0600-0699%2F0627%2FSections%2F0627.748.html

**Promotion gate:** Do not merge/pronounce PR #143 \"complete\" merely because policy tests pass; the wider financial lifecycle requires integration and sandbox acceptance. This branch can be merged independently after CI as a safe cost improvement and forward contract, without enabling new Stripe charges.
