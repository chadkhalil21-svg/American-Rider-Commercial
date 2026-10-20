# American Rider | adversarial whole-journey audit #2 | October 20, 2026

**Scope:** Inspect the actual `release/current` source, the observed 16-second physical TestFlight price/search loop, payout dashboard/consent/settlement paths, and whole journey from account creation to bank deposit, cancellation and account closure. This is a SOURCE and published-reference audit. It is **not** full live backend, Apple processing, Operator acceptance, real card payout, a signed new device build, Google Play approval, or advice from retained Florida counsel.

## Why prior audits missed the booking loop
The existing isolated tests verified that (a) a rate cannot change without explicit consent, (b) no duplicate payment occurs on retry, (c) dispatch uses a class-aware server matcher, and (d) build CI is green. But they did **not** test this cross-boundary ordering on the *same physical route and class*: Traveler quote key `large` → confirmation label `Large Vehicle` → independent reroute/fee/reference → /travel/prepare 409 → UI already shows Finding Operator. Separate good components composed into a misleading product journey. CI green is not an actual successful accepted Travel. PR #163 (open separately) corrects initial class label normalization and prepayment UI wording; it is not merged, deployed or installed by this audit.

## Requesting a payout: what happens **today**
1. Completing a Travel attempts a 99%-of-Fare plus eligible toll-reimbursement **Connect transfer**. A transfer into the connected Stripe account is **not** a bank payout. Server holds transfer idempotency/recovery obligations.
2. The Operator can open Stripe's connected-account dashboard through `POST /connect/dashboard`. Eligible accounts may change payout schedule or request manual/instant payouts there. The platform's `POST /operator/settle-pending` is **read-only** reconciliation and does **not** withdraw cash or initiate a Stripe bank payout. Existing earned money cannot be withheld for refusing new fee terms.
3. Under the **platform-handles-Connect-pricing** model published by Stripe, $2 applies per connected account that actually receives at least one bank/debit-card payout that month, **not** per request or per Travel. Stripe also lists 0.25% + $0.25 for each bank payout, 0.25% funds routing in relevant Connect configurations, and additional instant-payout cost. Actual enabled fees need account-specific Stripe verification. If Stripe bills the connected account directly instead, the economic model is different; do not claim both models at once.
4. Code `backend/operatorfees.js` independently records payout events and assesses a single monthly $2 charge **plus card-processing gross-up** (USD domestic computed total **$2.37**, foreign/unknown quoted **$2.41**) with no 20-Travel waiver. It checks that consent precedes the month's first payout. It does **not** yet separately recover every variable payout and funds-routing charge that the Operator Economics text says operators will pay.
5. `chargeOperatorAccountFee` creates an off-session Stripe PaymentIntent against `customerForTraveler` / `savedPaymentMethodFor`. An Operator who is also a Traveler can therefore have a saved Traveler payment method reused. **Before any collection rollout**, require dedicated unambiguous mandate/authorization for the charge method, amount and frequency; reject implicit reuse. The method must be distinguishable from the traveler's charge authorization.
6. The fee PaymentIntent uses a key containing `amountCents`. Card country / gross-up can change after a partial Stripe success and before the monthly ledger was persisted. A new amount produces a new idempotency key. **P0: reconcile a prior provider outcome before any retry or changed amount; persist stable (uid, month) identity, never assume a failed Firestore write means no Stripe charge.** This PR deliberately does not change live Stripe money movement; design and synthetic provider-failure tests are still needed.
7. `sweepOperatorAccountFees` reads **all** monthly account documents for the previous month; it writes `consent_required` for an unauthorised account. Future due-only status indexing/pagination should avoid repeated reads for already-paid months, without skipping unpaid/owed records. Do not introduce premature write suppression that loses recovery.

## New protection in THIS PR: no new paid work without agreement
- `backend/connect-fee-consent.js` is a pure policy versioned helper. Valid agreement requires the correct version, affirmative separate billing acknowledgement, exact quoted $2 base and a valid server-recorded past acceptance.
- `assessOperator` (new duty **and** `/travel/accept`) rejects a real Stripe-connected account with no/current-invalid fee agreement for new live paid Travel.
- `/operator/online` stamps its server-side decision in the fleet record, and `matchOperator` excludes legacy connected accounts missing this stamp from new live offers, so they cannot repeatedly consume offers they are forbidden to accept.
- **Previously earned transfers, Stripe dashboard and historical reconciliation remain accessible** despite a lack of consent; do not seize, cancel, reroute or offset owed funds against separate charges. Non-money synthetic demonstrations may remain.
- No new Stripe customer, API keys, fee amount, payout schedule, card charge, bank payout, Cloud Run deploy or TestFlight workflow was created.

## Journey-by-journey source gaps, ordered by release risk
| Journey stage | Source evidence | Remaining closure |
|---|---|---|
| Account / sign-in | Firebase auth; email/SSO; age/Teen separation | Device test email verification, apple/google authentication, restart, account recovery, Teen guardian revocation |
| Operator onboarding / qualification | server authorization; document/OCR evidence; Stripe hosted onboarding; no vehicle class certification in current release | Test genuine end-to-end independently verified Operator and permitted vehicle; old/partial Stripe Connect states |
| Fee consent | New Connect onboarding previously blocked without agreement; **legacy existing account was not blocked from paid duty** | New versioned duty/offer/matching gate in this PR; test setup screens, refusal, future retry, and owed-payout access |
| Operator vehicle | free-text make/model/color and plate; existing duty sends Standard | PR #163 gated special classes only with server-reviewed proof; require actual verified six seat capacity and Pet Friendly policy; no automatic VIN/trim inference |
| Traveler route/map | native/non-native view differences; OS geocoder & server router | Test exact coordinates, route parity, toll and place search, accessibility, no GPS, MapLibre/Apple map transitions |
| Fare display / selection | one authoritative selected-class Total; others intentionally show dash | Dashes are expected. **P0** current TestFlight confirmation loop and premature matching; fix in PR #163; follow-on short-lived server-bound quote fingerprint for traffic/toll/card/market race |
| Confirmation / price recheck | /travel/prepare rejects changed totals before booking/payment | Deterministic same-route quote token and recoverable old→new consent; confirm repeat taps, late responses, no Operator, no charged-but-unassigned confusion |
| Booking / matching / acceptance | prepared idempotency key, paid dispatch, server accepted status, gated eligibility | Trace actual first real Operator offer → acceptance → license plate → real GPS; ambiguous 'assigned' is not 'accepted' |
| Payment / refund | PaymentIntents, Stripe verified payment, cancellation refund recovery | Verified sandbox and provider event duplicate/replay/3DS/unknown timeout; never say 'no charge' without provider evidence |
| Completed Travel → Connect | settlement, durable Stripe provider verification, transfer reconciliation | Confirm exactly one transfer including failed-then-succeeded ledger write; actual bank payout after scheduled or manual release |
| Connect monthly fee | actual $2 after payout; separate off-session charge and notified past due | **P0** independent fee payment mandate, changed-amount retry idempotency, variable per-payout pass-through NOT fully wired; inspect actual Stripe model |
| Support / lost item / account deletion | own-travel request, private case and retained money ledgers | Device signed-in/out & cancellation; never destroy outstanding refund/transfer liability when account is deleted |
| Smart Travel / Courier / Teen / schedule | readiness gates & separately commissioned capabilities | Only advertise enabled/verified journeys; signed device and server acceptance for each paid service |
| Pubish iOS / Android | existing EAS/TestFlight pipeline (prior build) | New iOS requires founder's **express build approval**, Android Play account/setup and signed internal device checks; no store release inferred |

## Why an Operator might request payouts too frequently
Stripe's $2 is **once per active month** and does not increase with number of payouts. But 0.25% + $0.25 **per payout** can scale with frequency in platform-managed configurations. An Operator requesting many small manual payouts has an economic incentive **if payout costs are not actually passed through**. The correct design is to show true bank payout timing and fees in Stripe's own account, offer low-friction standard scheduled payouts, price Optional Instant Payout transparently, and collect only pre-agreed verified charges via a lawful and user-understood method. Never invent a mandatory payout minimum or withhold earned wages to recover disputed fees without specific licensed counsel review.

## Risk and cost priorities
1. Exact end-to-end trace replay with observable `quoteId, bookingId, paymentIntentId, offerId, acceptedAt, transferId, payoutId`; privacy-safe, no raw coordinates/payment details in logs.
2. Persist and reuse short-lived consented quote authority on exact route/class/card/toll state, avoiding provider reroute/reference fanout and accidental reprice loop.
3. Payout monthly fee reconciliation keyed by immutable `uid + month`; Stripe retrieval after unknown timeout, ledger reservation, dedicated operator mandate and evidence of webhook. No double charge after 24-hour idempotency cache.
4. Stripe managed-pricing account decision: confirm which party Stripe actually bills for **each** type of Connect fee, separately from the 99% travel split. Test at least small/large monthly payout volumes.
5. Firestore: measure costs via Query Explain + billing metrics on production-shaped synthetic data. Monthly `operator_months/accounts` list is currently unbounded; explore due-only cursor pagination and avoid completed records. Existing geohash proximity, recent duty reads and PR #161 marker write fix should be treated as done, not reopened.
6. Synthetic trace matrix and a real two-device traveler/operator test for all enabled products, including app background and failure/recovery with exact financial record evidence.

## Source-backed external recommendations (not counsel engagement)
- Stripe Connect actual model and active fee: https://stripe.com/connect/pricing
- Stripe's connected account dashboard and payout operations: https://docs.stripe.com/connect/payouts-connected-accounts
- Stripe required consent for debiting connected balance: https://docs.stripe.com/payments/pay-with-balance
- Apple human interface feedback: https://developer.apple.com/design/human-interface-guidelines/feedback
- Google Firestore optimization: https://firebase.google.com/docs/firestore/best-practices
- Uber H3 approximate spatial indexing: https://h3geo.org/docs/highlights/indexing/

**Qualified counsel review required before account fee mandate or payout constraints:** Operator contract and mandatory fees; legal wage/payment obligations; cancellation and refund amounts; accessibility/assistance animals; privacy and geolocation; service of process in each jurisdiction. No attorney contacted or legal opinion obtained.

**Release rule:** PR source does not equal production. Exact CI and PR review, controlled deploy, release-SHA check, and founder authorization of the next TestFlight build all remain separate.
