# American Rider | Full TestFlight journey and vehicle-class reconciliation | 20 October 2026

**Evidence:** Founder's four physical TestFlight screenshots and the entire 16.1-second screen recording; source branch `release/current` `ad4c1288` from the signed 20 October TestFlight build. No private pickup address, payment credentials, or private device traces are copied into this repository.

## Observed, not simulated
- The recorded confirmation repeatedly offers the **Large Vehicle** all-in Total ($64.70), then shows **Travel Total updated → Review Current Total → confirmation**, with a transient **Finding the best available Operator** interstitial before final price authorization. A Standard option also displays a lower different Total ($44.03); these are *different services*, not a known legitimate automatic price adjustment.
- The alternate class rows show `—` because **only the selected class gets one authoritative quote**. The dash does **not** prove that a class is unavailable; the app previously does not explain that distinction.
- The initial confirmation picture has a partially clipped header beneath the iOS TestFlight/status overlay; validate safe-area, zoom and accessibility on-device separately, do not infer app content clipping from a screen recording's system overlay.
- The search/price-change loop is real device evidence. The source trace explains its direct cause for Large Vehicle/Pet Friendly: `fetchQuote` sends key `large` or `pet` to `/fare-quote`, whereas `prepareRide` sends `operatorClassFor(...)` label `Large Vehicle` or `Pet Friendly`. `backend/fares.js applyTravelClass` previously accepted keys only and silently priced these booking labels as Standard. `/travel/prepare` protects the Traveler by rejecting different `agreedTotalCents` before charging. That **protective rejection is correct**; the inconsistent upstream class canonicalization is the defect.
- `referenceForQuote` also received the inconsistent label/key class; normalize this second pricing input, not only the fare multiplier, to prevent market-research-related repricing.
- No live amount, Stripe charge, refund or operator approval is inferred from screenshots. Exact TestFlight device run and backend deployed SHA must both be recorded before release.

## Source end-to-end trace and boundary results
| Journey | Source path | Verified design | Gap / test |
|---|---|---|---|
| Traveler address → map → quote | `app/index.tsx`, `app/reserve.tsx`, `src/backend/fares.ts`, `backend/server.js /fare-quote` | Server provides the single all-in Total for selected class, tolls/market and card-country; selected class reprices | Selected-class-only price is visually unclear; two entry effects and native geocoding need late-response and route-change tests |
| Vehicle selection → Confirm | `src/data.ts operatorClassFor`, `src/state/RideContext.tsx`, `src/backend/dispatch.ts`, `backend/server.js /travel/prepare` | Quoted consent compared in integer cents; stale prices denied before payment | **P0: label/key mismatch**. Fix server canonicalization and class-specific trace; future verified quote fingerprint can freeze exact route/calculation without an extra Firestore read |
| Booking → payment → match | `src/state/RideContext.tsx runDispatch`, `app/ride.tsx`, `backend/booking.js`, `backend/matching.js` | Server idempotent booking key; no charge if no qualifying Operator at prepare; paid offer follows verified payment | **P0: premature matching wording**. Show preparation until payment verified; on no supply explicitly show no charge; recovery for uncertain Stripe outcomes must be independently device tested |
| Operator sign-up → vehicle | `app/operator/qualify.tsx`, `app/operator/vehicle.tsx`, `src/state/OperatorContext.tsx` | Legal name, make/model/color text, plate and documents; backend qualification | **P0: no trustworthy seat count, VIN/trim, pet agreement or independently reviewed special-class proof**. Current duty requests `['Standard']` only |
| Operator duty → class-aware assignment | `backend/server.js /operator/online`, `backend/matching.js`, `backend/monitor.js` | Five-minute fresh-location cutoff, live eligibility, nearest eligible, checked screening/coverage/payout | Previously API accepted arbitrary `classes` from phone; this PR derives special classes from server-reviewed, plate-and-car-bound evidence and prevents old self-declared flags from dispatch |
| Operator offer → pickup → complete | `app/operator/index.tsx`, `app/operator/pickup.tsx`, `app/operator/trip.tsx`, `app/ride.tsx` | Server owns assignment; offers disclose Operator earnings and Traveler Total; real Operator drives progress | Test 15-minute locked-screen push, accept/decline race, stale offer, two concurrent acceptances, route updates and traveler cancellation |
| Scheduled, family/teen, courier, support | `app/schedule.tsx`, `app/family-travel.tsx`, `app/operator/support.tsx` | Gates for services not yet commissioned, scheduled state and safeguarding in source | Do not claim commissioned Teen or Courier service; explicit closed modes and reviewer proof required, plus restored-travel/account-deletion device checks |

## Fix in this PR
1. Accept a **canonical class key OR its displayed operator-facing label** at the fare authority, including market reference. Quote and prepare for Standard, Large Vehicle and Pet Friendly now use the same class formula. Test all six known key/label pairs and price/prepare parity twice.
2. Require reviewed `users/{uid}.vehicleClassApproval`: approved status, real reviewer name, positive verification time, current normalized make/model text **and** plate, explicit allowed class. Only `Large Vehicle` and `Pet Friendly` special approvals are recognized. Server stamps verified fleet classes on each duty renewal. Matching requires that stamp as well as the class array. An absent/mismatched/old vehicle record safely receives **Standard only**. The schema is a protective boundary, **not proof that any actual vehicle has been inspected**; no current Operator is automatically approved.
3. Do not render "Finding Operator" until payment and booking preparation finish. During this portion show "Preparing". A no-supply response from prepare is a **no-charge** exit, not a charged search.
4. Preserve route/quote/booking keys, pre-charge price-consent refusal, actual Operator qualification and protection of already-paid bookings. No price rate, provider configuration, live Stripe money, new GPS reads, timer frequency, market state, Cloud Run rollout or store release in this PR.

## Proposed independent physical-device and synthetic matrix
- All three bookable classes (Standard, Large Vehicle, Pet Friendly): selected all-in Total equals `/travel/prepare` authoritative amount for fixed route, fee country, government/toll state and market reference; repeat after class switch back, changing pickup, selecting other destination and app resume. No special Operator → truthful no-supply / no charge.
- Force quote stale, routing provider switch, market reference update, changed card country, two fast taps, offline, backend timeout, 409/428 repricing, no Operator, pending payment, successful paid Travel, duplicate webhook, cancellation and refund. Assert exactly one booking key, no duplicate charge/transfer, and reliable restored status.
- Operator: no vehicle data, wrong plate, changed car, forged class array, reviewed Large Vehicle (at least six passenger seats **excluding Operator**, physical seating and seat belts), reviewed Pet Friendly, document expiry mid-shift, locked-screen presence, push cold-start and app restart. Review independently; descriptions/VIN lookups alone cannot certify seats, equipment or special-service obligations.
- Family/Teen, scheduled Travel, emergency and account deletion: at least one complete device flow for each enabled service; unavailable products visibly gated. Test large accessibility fonts and safe areas, App Review guest/reviewer entry, GPS denied and Wi-Fi/cellular switch.

## Google / Uber H3 / Apple / operational comparison
- **Google Firestore**: use Query Explain (default costs one read; analyze executes billable query) on bounded *isolated* datasets to identify indexed fanout, unnecessary live listeners, empty queries, and duplicate returned documents. Existing geohash cursor pagination, due-only payout scans, PR #159 duty snapshot reuse, PR #161 repeated stranded-marker suppression are **already done**, not new proposals.
- **Uber H3**: hex cells help aggregations and approximate radius discovery, but geometry/parent containment is approximate and H3 does not by itself lower Firestore reads. Retain the existing geohash + exact distance/eligibility until measured H3 benchmarks preserve nearest-qualified recall and improve p95 and billed reads.
- **Apple**: visible progress must accurately name the process; confirmation and errors must make outcomes and recovery clear. A radar cannot claim an eligible Operator is being contacted when the app is still rechecking the fare.

## Further read/write savings ranked by practical value
1. **Booking retry quote fingerprint**: return a signed short-lived quote snapshot/route provenance so identical `/fare-quote` → `/travel/prepare` need not repeat slow routing/reference calls. Keep authoritative server verification, repricing consent, TTL and changes in card/market/toll; **design only**, not a permission to reuse stale totals.
2. **Live Travel listener deduplication**: one authenticated subscription per active Travel; measure subscriptions and billed reconnects on iOS/Android app resume before altering listeners. Never hide emergency/reassignment state.
3. **Empty fleet/listener checks**: bound polling and minimum query costs via existing single Scheduler; consider event-triggered due-work index only after recovery across process crash and backfill is proven. No unproven timer throttle.
4. **Verified class availability**: derive class counts from authorized duty transitions rather than quote-time full fleet scans; server must still individually revalidate every assigned Operator. Counts are hints, not a proof of supply.
5. **Connect account fee / payout ledger**: due-only indexed recovery and event-driven Stripe reconciliation can avoid repeated reads, but preserve lossless historical payout recovery and idempotent charges; do not erase old owed funds.
6. **Indexes/GPS**: use measured Query Explain and firestore billed read/write metrics before removing a composite index or altering location heartbeat; the five-minute safety freshness gate remains.

## Counsel questions (not a legal opinion or claimed actual consultation)
A qualified Florida transportation/consumer-law lawyer should assess six-passenger marketing claims, seat-belt/safe-capacity evidence and accessibility/service-animal obligations; the actual agreement for Pet Friendly service; class-price consent and cancellation/refund rights; provider screening/FCRA; disclosure and background-location review. Review any paid-hold changes before activation. Existing independent statutory questions are tracked separately. No retained lawyer was contacted by this audit.

## Primary publications
- https://firebase.google.com/docs/firestore/best-practices
- https://firebase.google.com/docs/firestore/pricing
- https://firebase.google.com/docs/firestore/query-explain
- https://www.uber.com/us/en/blog/h3/
- https://h3geo.org/docs/highlights/indexing/
- https://developer.apple.com/design/human-interface-guidelines/feedback
- https://developer.apple.com/design/human-interface-guidelines/loading
- https://developer.apple.com/design/human-interface-guidelines/design-principles
- https://developer.apple.com/app-store/review/guidelines/

**Gate:** exact-head automated CI, then controlled Cloud Run deployment and a **new signed TestFlight build** after merge; the prior 20 October binary cannot contain these repairs. Independent real device and real verified-vehicle evidence remain required for commercial acceptance.
