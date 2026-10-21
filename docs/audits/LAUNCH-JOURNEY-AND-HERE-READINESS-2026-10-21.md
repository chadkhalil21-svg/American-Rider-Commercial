# American Rider | launch-journey and HERE-cost audit | 21 October 2026

**Scope.** Read-only inspection of the actual current branch, repository tree and authoritative GitHub Actions logs; focused review of Traveler, Operator, payment, dispatch, maps, payout and publishing code. Approximately 1,005 tracked files were inventoried; this report does **not** claim that each line, every screen on a physical device, or every real provider action has been manually exercised.

**Source authority:** `release/current` at `b02a0b45d2e29b4e3f19048b89537c8d73357693` before this PR. Seven push workflows at that SHA concluded successfully: Release Gate, double exhaustive, double adversarial, deterministic commissioning, scale stress twice, Firebase Auth and read-only real Google Cloud audit. Automated/source tests and read-only audits do **not** prove real rides, provider money, App Store approval or legal compliance.

## 1. Actual public production and publishing evidence

- Google read-only audit run [39538535877](https://github.com/chadkhalil21-svg/American-Rider-Commercial/actions/runs/39538535877): existing paid Cloud Run revision `american-rider-api-production-00010-h7s` is READY with 100% traffic, Scheduler ENABLED and one existing public API.
- Last **successful owner-dispatched source deployment** run [39396213022](https://github.com/chadkhalil21-svg/American-Rider-Commercial/actions/runs/39396213022) promoted source `6289a39` (the run reported the update), not the current `b02a0b45`. Revision readiness is not source-SHA parity. **P0:** run existing protected `cloud-run-update-paid-source.yml` from current release, then read public `/health`, `/live`, `/config` and verify `commit=b02a0b`, Stripe live, operational readiness and stable scheduler. Preserve the existing paid service, webhook destinations and rollback path. Do not commission a second authority.
- Latest release test [39538535897](https://github.com/chadkhalil21-svg/American-Rider-Commercial/actions/runs/39538535897) reports tri-county active (Miami-Dade, Broward, Palm Beach) and `LIVE_COMMERCIAL_PAYMENT_READY YES`. That is platform readiness, **not proof of an eligible Operator or a completed paid Travel**.
- Certified iOS/Android workflows refuse builds when public Cloud Run source differs. Earlier iOS certification lacked required GitHub submission credentials. **P0:** confirm private `EXPO_TOKEN` and App Store Connect credentials (never publish secrets); produce signed devices/builds, verify foreground/background, then finish App Store and Google Play review. Android internal testing and public production tracks are separate.
- There was no verified public store approval or complete real-money end-to-end travel in examined evidence.

## 2. Traveler path: actual source and boundary

`src/screens/AuthScreen.tsx` (Firebase/Apple/Google sign-in) → `app/index.tsx` (honest device pickup + region-specific places) → `app/reserve.tsx` (editable pickup/destination, server price, party, class, Wallet) → `src/state/PaymentConfigContext.tsx` (Stripe native initialized before payment controls) → `src/state/RideContext.tsx` / `backend/booking.js` (idempotent booking, provider-confirmed payment, bounded matching) → `app/ride.tsx` (accepted/arrived/onboard/complete, support, cancellation and payment states) → receipt and transfer reconciliation.

- Source protections seen: 350 ms search debounce, provider cache/dedup, server re-quote before acceptance, same-route toll integrity, payment Customer idempotency, no dispatch on phone-only payment assertion, staged recovery for missed assignment and refunds, and no simulated paid claim when keys are absent.
- **Physical acceptance still required:** first-time sign-up/login, payment method setup/Apple Pay/Google Pay, pickup/destination edits, unknown/tolled/no-toll quote, declined/cancelled payment, duplicate taps, no Operator, network loss, app kill/restart, matching/arrival/PIN/complete, receipt/refund/dispute/support; do not call a synthetic pass a real purchase.
- Smart Travel new bookings are explicitly paused; do not reopen as a condition of first ordinary paid rides. Courier is not an end-to-end live service. Teen/Family and specialty vehicle controls require separate live-device/legal proof before exposing unsafe or uncommissioned variants.

## 3. Operator path: actual source and boundary

`AuthScreen` → `app/operator/qualify.tsx` (select only an ACTIVE market; no onboarding in unopened markets) → vehicle → licence and registration uploads in `app/operator/documents.tsx` → real coverage/status confirmation in `app/operator/insurance.tsx` → screening in `app/operator/background.tsx` → Connect account/fee consent in `app/operator/payouts.tsx` → server qualification/review → `app/operator/index.tsx` Commence Operations → fresh eligible geohash presence → server-paid match → accept/pickup/onboard/complete → Stripe transfer and Stripe-managed ordinary/eligible Instant bank payout.

- No Operator can be treated as approved on a UI checkmark alone: `backend/server.js` re-checks user, screening, coverage and Stripe; `backend/booking.js` requires paid Travel and an eligible matching Operator. Provider-neutral screening and signed device performance require production evidence.
- Confirm on real devices: file and PDF upload, review outcomes/rejection and remediation, Stripe-hosted onboarding and consent, background permission and screen-lock/reboot continuity, distinct/expired policies, GPS recovery, offers and 15-second accept/decline, vehicle class and service-animal accommodation, payouts + unpaid-transfer reconciliation.
- As of 20 Oct prior authenticated Stripe live checks returned **zero connected Operator accounts**. Recheck live provider status before any claim of immediate first dispatch. Automatic Standard Friday and eligible Instant options exist in merged source; verified-only future Connect fee offset remains safely **OFF** pending actual attributed provider charges. Do not demand a second Operator card or charge an estimate.

## 4. HERE/OSM and operational cost: precise findings

`backend/place-search.js` uses American Rider's private Photon/OSM endpoint **only when configured**; otherwise existing HERE autocomplete becomes the primary search provider. Source has 10-minute successful-answer cache, in-flight dedup, and a 350 ms debounce on the booking sheet. Photon public demo and public Nominatim are not production fallbacks. Public Nominatim disallows autocomplete: https://operations.osmfoundation.org/policies/nominatim/ . Photon can serve private search-as-you-type from OSM data: https://github.com/komoot/photon .

**Actual defect fixed by this PR:** when primary Photon had an outage and explicitly enabled HERE fallback succeeded, the valid HERE answer was never cached because caching checked `result.ok` only. Repeating the same typed query could pay HERE again. We now cache only verified fallback responses for **60 seconds**, preserve their `source:'here'` attribution, keep 10-minute primary successful-cache behavior, do not cache provider failures, and preserve the existing 10-per-minute **per-instance** outage budget. Synthetic test repeats the same outage query and asserts no second provider call. Per-instance is *not* a vendor-wide cap across autoscaled Cloud Run instances; inspect actual HERE bills/quotas. This is low-risk **post-launch optimization**, not a precondition for Cloud Run source parity.

`backend/official-toll-pricing.js` has no approved local rate books. OSM road toll tags cannot prove payable money. Current same-route fallback to HERE remains necessary for uncertain route prices and must not add SunPass and plate rates. There is no verified offline road/toll authority matcher commissioned today. Avoid an unverified paid toll or silently turning unknown into zero.

**Google and Uber:** Google documents Firestore geohashes as workable bounded location queries (https://firebase.google.com/docs/firestore/solutions/geoqueries) and recommends limiting index fanout and using Query Explain (https://firebase.google.com/docs/firestore/best-practices ; https://firebase.google.com/docs/firestore/query-explain). Uber H3 is a hierarchical hexagonal spatial index for geographic analytics/dispatch (https://www.uber.com/us/en/blog/h3/), not proof of lower Firestore bills. Keep existing geohash matching; benchmark real Firebase reads/index entries before any structural rewrite. Preserve safety/presence updates and individual qualification checks.

## 5. Florida statutory and company decision

The **2026 Florida statute** §627.748(7)(d) says TNC-maintained insurance must respond from the first dollar and defend when driver-provided required coverage lapses or is insufficient; §627.748(8) sets written disclosures and §627.748(12) sets TNC screening duties. Official statute: https://www.leg.state.fl.us/Statutes/index.cfm?App_mode=Display_Statute&URL=0600-0699/0627/Sections/0627.748.html .

The Operator-only insurance + instant lockout design has no documented written **retained Florida TNC insurance counsel** opinion satisfying this contingency; source-based law reading is not counsel. Do not represent the coverage gap as resolved or put a compensated rider at unverified risk. Obtain written interpretation, and required coverage or compliant alternative, before first commercial Travel. Complete the required disclosures, background checks and legally required reporting. No adviser has been personally contacted by this audit.

## 6. One-Founder launch order (no additional redesign)

1. Resolve coverage/legal contingency with authorized Florida counsel; verify production provider qualifications and at least one real, approved Operator.
2. Controlled **existing** Cloud Run source update to the current tested release with exact commit parity; no new backend, scheduler, Stripe account, H3 or map provider.
3. Exact signed iPhone and Android builds; run physical two-sided onboarding, checkout, dispatch, notification/background, cancellation, support and reconciliation campaign.
4. Provider-backed authorized low-value live Travel: one charge, one completed ride, correct 99% Fare transfer, disclosed toll and platform fees, Stripe receipts/refunds; document failure recoveries, owner alerts.
5. Public App Store and Google Play approvals and publication; keep only verified, functioning services available; maintain Ops alerting, owner one-phone controls and rollback.

**Result:** SOURCE GATES PASS at `b02a0b45`; CLOUD RUN READY but LAST DEPLOYED SOURCE OLDER; paid commissioning, physical-device acceptance, store review and counsel unresolved. This PR does not deploy, charge, change insurer, provision Photon, alter dispatch, switch Stripe live settings or claim paid bookings.
