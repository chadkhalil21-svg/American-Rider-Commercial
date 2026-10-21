# American Rider | launch critical-path audit | 21 October 2026

**Purpose:** verify the existing launch, not add platforms, accounts, manual county admission, or permanent founder work. This is a source and authenticated CI/deployment-record review, **not** a physical-device test, legal opinion, or proof of a real charge.

## Confirmed source and observed deployment

- Canonical launch branch: `release/current`, commit `b02a0b45d2e29b4e3f19048b89537c8d73357693` before this audit's separate proposed branch.
- CI on that exact source: Release Gate, two-pass exhaustive trace, deterministic commissioning, scale stress, Firebase Auth check and live Google metadata audit reported success. CI remains synthetic for money and devices.
- Google live metadata audit on 21 October: Cloud Run revision `american-rider-api-production-00010-h7s` READY, serving 100% traffic; one enabled production Scheduler. **Last successful controlled Cloud Run code deploy was from source `6289a39`, not the current GitHub release.** A READY revision is not source parity.
- Public production checks during Release Gate reported the tri-county counties ACTIVE and `LIVE_COMMERCIAL_PAYMENT_READY YES`. This is a readiness response, **not** evidence of a charged, completed, settled live Travel or an independently qualified Operator.
- `.github/workflows/cloud-run-update-paid-source.yml` is already the founder-authorized controlled deployment route, accepting `DEPLOY_EXISTING_PAID_CODE_ONLY` on `release/current`. Do not create another Cloud Run service or scheduler. The older `activate-paid-production.py VERIFY` checks for an *unlaunched* private API and paused Scheduler; these expectations are stale after production was activated. Do not obey its obsolete pause recommendation.

## Traveler path reviewed in source

`src/screens/AuthScreen.tsx` -> `app/index.tsx` -> `app/reserve.tsx` (nearby results, typed pickup and destination, accurate server quote) -> `src/state/PaymentConfigContext.tsx` (Stripe SDK must initialize) -> `src/state/RideContext.tsx` (idempotent payment then dispatch) -> `app/ride.tsx` (accept, pickup, tracking, cancellation, support) -> receipt. Back-end authority is `backend/booking.js`, `backend/payments.js`, and `backend/server.js`; no phone-reported payment success should authorize dispatch. Prior test evidence covers duplicate payment and retry, but not a signed-device end-to-end live Stripe outcome.

## Operator path reviewed in source

`AuthScreen` role choice -> `app/operator/qualify.tsx` (only active operating county; no onboarding in unopened county) -> vehicle -> `app/operator/documents.tsx` (licence/registration) -> `app/operator/insurance.tsx` (independent coverage verification and monitoring) -> `app/operator/background.tsx` (provider-neutral screening) -> `app/operator/payouts.tsx` (actual Stripe Express account, fee consent and payout capability) -> qualification review -> `app/operator/index.tsx` (fresh screened/insured presence; receive and accept offers) -> pickup -> completion -> server-recorded transfer -> `app/operator/revenue.tsx` (local estimated figures **explicitly distinct** from provider-authoritative payout records). Recheck lock-screen offers, background presence, document and Stripe completion on physical devices before launch.

## Maps, cost and engineering decisions

- `backend/place-search.js`: private Photon/OSM preferred **only when commissioned**; otherwise HERE already serves ordinary address/business autosuggest. UI debounces 350 ms; server deduplicates simultaneous requests and caches primary search 10 minutes. This PR adds only a 60-second cache for successful *optional HERE fallback during Photon outages*, suppressing repeats without adding vendor, location scans or Firestore writes. The optional fallback is ignored as soon as it is disabled.
- Public Nominatim prohibits autocomplete. OSM data alone is not an autosuggest server; do not turn HERE off before verifying a private Photon installation, coverage, and quotas. Retain HERE exact-route toll price rescue until an official certified toll price table exists.
- Existing bounded geohash Firestore queries match Google's published approach. Uber H3 is another spatial index, not a documented cheaper substitute for current Firestore dispatch. Measure Query Explain and actual invoices before considering an index rewrite; preserve insurance/screening/Operator presence and emergency writes.
- No need for new Photon VM, Geoapify signup, H3 migration, full payout redesign or speculative query rewrite for the first compensated Travel.

## Remaining independently verifiable launch gates

1. Deploy latest `release/current` into the **existing** production Cloud Run safely, with exact `/health.commit` parity, real `/config` live mode, scheduler and webhooks checked; preserve rollback.
2. Verify signed iPhone and Android release builds; execute Traveler/Operator onboarding and full Travel, payment, dispatch, cancellation, refund, notifications, support, device restart, and payout under real provider/test controls. Observe at least one qualified real Operator and authorized low-value real charge/settlement before opening to the public. Do not treat mock success as real evidence.
3. Obtain a Florida transportation-network/insurance attorney's documented conclusion on §627.748(7)(d) first-dollar insurer response if Operator coverage lapses or fails; establish required insurance/contractual protection if so advised. No retained counsel was contacted for this source audit.
4. Obtain Apple App Store and Google Play review/publication confirmation. The existing workflow(s) require founder-controlled signing/store credentials; source exports alone are not signed store binaries.
5. Update outdated Stripe business profile copy (`$1.50`) to match the code's **dynamic minimum $2.50** disclosure. Verified operator-only Connect fee recovery remains disabled without real attributed provider invoices; that optional recovery mechanism must not create an invented charge or extra Operator card.

**Founder standard:** one phone, one actual production booking authority, automated provider idempotency/recovery, minimal manual intervention; document only genuine release evidence rather than turning every deferred study into a blocker.

## Published guidance, not personal endorsements or human counsel

- Florida legislature: https://www.leg.state.fl.us/Statutes/index.cfm?App_mode=Display_Statute&URL=0600-0699/0627/Sections/0627.748.html
- OSMF Nominatim rules: https://operations.osmfoundation.org/policies/nominatim/
- Firebase geohash geoqueries: https://firebase.google.com/docs/firestore/solutions/geoqueries
- Firebase Query Explain: https://firebase.google.com/docs/firestore/query-explain
- Firestore cost guidance: https://firebase.google.com/docs/firestore/best-practices
- Uber's H3 rationale: https://www.uber.com/us/en/blog/h3/
