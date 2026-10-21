# American Rider | End-to-end Travel lifecycle and service-design audit
21 October 2026 · Source version `19d36f7f` (Commercial) · Synthetic-only evidence

## Scope, authority and acceptance

This is a bounded source + executable synthetic audit, **not** an attestation of a real Traveler, Operator, bank charge, refund, delivery, or iOS release. The Founder explicitly forbids creating, triggering, or submitting any TestFlight / signed distribution build without fresh, specific permission. No production deployment or account mutation is part of this review.

Every state below is either (a) server-authoritative and independently exercised by backend tests, (b) product UI backed by the server, or (c) unresolved real-world evidence. Do not turn (c) into a green launch claim.

## The complete ordinary Travel

| Moment | Who acts | Server evidence / mechanism | Traveler should see | Remaining evidence |
| --- | --- | --- | --- | --- |
| Quote and booking | Traveler | `/travel/prepare`, server quote/class/geography, idempotent reservation key | Exact pickup, destination, class, total before commitment | Physical quote/checkout by class; production Stripe exact amounts |
| Payment | Traveler/Stripe | `payForTravel`, stored own PaymentIntent, signed asynchronous webhook | Paid, pending, or declined. Never show a fictitious charge | Signed sandbox across timeout, duplicate, lost callback |
| Operator offer | Dispatch server | `assignPaidTravel`, current eligibility/payout/duty, one current/reserved slot | Finding, then offered/awaiting acceptance, not En Route | Real Operator push/response and assigned timeout |
| Acceptance | Operator | `acceptOffer`, one transaction rechecks documents, insurance, screening, payment, account, payout | Accepted: vehicle/plate/name and actual en-route status | Real live coverage/check, no fabricated ETA |
| Pickup arrival | Operator | `progressTravel(\'arrived\')`, accepted state and fresh server-stored GPS within **0.5 miles** | Operator Arrived; pickup instructions | Actual GPS accuracy and false-location threat model |
| **Traveler in vehicle** | Operator after Traveler shares secret | `progressTravel(\'onboard\')` only from arrived. Teens must have server-verified four-digit PIN. Adult six-digit server code is **behind rollout flag**; this PR enrolls code during server acceptance *only when already authorized/enabled*. | Onboard only following server-confirmed handoff; do not imply code is universally active | **BLOCKER for universal adult identity assurance:** coordinated app compatibility, real device, explicit rollout and verification; flag OFF by default |
| Drive and destination | Operator | `progressTravel(\'completed\')` from onboard; signed-in assigned Operator and fresh GPS within **1.0 mile** of destination, sets `needsPayout` | Trip complete only on server confirmation, not timer | 1-mile radius is weak physical proof; GPS can be spoofed or imprecise; consider Traveler correction/dispute & arrival evidence |
| Settlement and receipt | Server, Stripe / Traveler app | `settleTravel` requires completed ride, original payment and correct owner; idempotent transfer id. Server sweep repairs work abandoned by device | Payment fact, receipt and review; unresolved payout stays pending | Live Stripe Connect transfer, signed webhook, receipt delivery and recovery trace |
| Review/support | Traveler | Rating bound to completed `rideId`, travel history, support case keyed to real ride | Completed record, receipt, correction/help accessible | Cross-device persistence, disputes, no false receipt |
| Cancellation | Traveler, server | `cancelTravel`, server transaction, provider refund idempotency key, durable refund pending on outage | Cancelled, refunded, refund pending or failed **distinct** | Synthetic failure recovery plus actual provider settlement |
| Scheduled Travel | Traveler, scheduler | `scheduled_rides` with `reserved / dispatching / dispatched / ... / cancelled` and bounded status listener | Future reserved Travel on Home; cancelled disappears from Home immediately but remains in Scheduled Travel record | Long-term cancelled history currently time-windowed; no permanent archive UX proven |

### Identity and trust: existing protections versus genuine completeness

- An Operator **does** confirm pickup and completion in the Operator app. The server, not the handset UI, changes payable status. A Traveler cannot mark a real ride onboard from their own UI; its local `boardRide()` is limited to explicit demo stand-ins.
- One Operator tapping **Arrived** does **not** prove they met the correct Traveler: GPS proves approximate vehicle location, not human presence. Teen verification is mandatory. Adult verification was implemented earlier but optional; before this PR, even when feature enabled, enrollment depended on the Traveler opening their code screen. An Operator could otherwise mark the ride onboard before enrollment. This PR moves conditional adult enrollment to the server's existing acceptance transaction without extra reads/writes. **The feature remains off** until both mobile roles and production secrets are explicitly qualified. Do not turn it on unilaterally.
- The adult PIN is known only to the authenticated Traveler and must be entered by the authenticated assigned Operator; five failed codes lock the flow. Reassignment invalidates earlier Operator verification (current UID required). This deters ordinary false-start claims but not a colluding pair, forged location data, coerced disclosure or a phone unattended after verification.
- Completion is Operator-confirmed and GPS gated within one mile. That is substantially stronger than a naked button, but **not proof of actual arrival at the exact curb**. A documented correction/report channel is needed for a premature complete, and payouts/disputes must be reconciled without fictitious outcomes.

### Exception matrix and test ownership

| Exception | Code path / existing regression suite | Expected fail-safe result |
| --- | --- | --- |
| Wrong Operator, expired coverage, stale screening, disabled payout | `eligibility.js`, `acceptance.test.js`, `synthetic-travel-lifecycle.test.js` | Deny acceptance, release unsafe offer for reassignment; no new charge |
| Decline, timeout, reassignment, duplicate accept | `travelprogress.js`, `booking.test.js`, `synthetic-travel-lifecycle.test.js` | Same paid ride/key, new eligible assigned Operator, declined Operator cannot progress |
| Operator marks arrived remotely or stale GPS | `travelprogress.test.js` | 409 and no status change |
| Operator falsely claims pickup / wrong private PIN | `adultpickup.test.js`, `teenpickup.test.js`, `synthetic-travel-lifecycle.test.js` | Mandatory Teen and enrolled adult code; wrong Operator blocked; legacy adult rollout **not yet universal** |
| Completion without boarding / wrong location | `travelprogress.test.js`, `synthetic-travel-lifecycle.test.js` | Reject and no payout due |
| Duplicate completion, payment settlement or receipt | `synthetic-travel-lifecycle.test.js`, `settle.test.js` | No duplicate transfer, no duplicate completion timestamp or receipt |
| Canceled paid booking during Stripe outage | `travel-cancel-uncertain-outcome.test.js`, `bookingrecovery.test.js`, `synthetic-travel-lifecycle.test.js` | Cancellation commits, slot frees, owed refund persists and recovers; never report refund success prematurely |
| Payment failure/no Operator, repeated retry | `bookingrecovery.test.js`, `dispatchfailure.test.js`, `payment-user-journey.test.js` | Distinguish payment facts; retry same id; no fictitious driver |
| Future scheduled cancellation | `scheduled-cancellation-status.test.js` (PR #197) | Remove from Home at confirmed cancellation, keep historical document |
| Operator app kill/restart, notification, network loss | `operator-parked-lifecycle.test.js`, `operator-coldstart-notification.test.js`, relevant state restore | Code tested; physical OS delivery and overnight recovery **not certified** |
| Family guardian revocation and Teen pickup | `teenpickup.test.js`, `familyrevocation.test.js` | Verified guardian and current Operator only; invalidate revoked access |
| Financial dispute, chargeback, refund failure | `payments-refund-charge.test.js`, `refund-webhook-recovery.test.js`, `disputeevidence-ui.test.js` | Durable provider facts; no invented payout/reimbursement |

### Design and engineering standards compared

1. **Apple Human Interface Guidelines**: status feedback must accurately disclose action success/failure, destructive confirmations and actionable recovery; do not show indefinite searching after terminal failure. See https://developer.apple.com/design/human-interface-guidelines/feedback and https://developer.apple.com/design/human-interface-guidelines/alerts .
2. **Google Firebase**: existing real-time subscriptions and transaction-backed states, rather than new polling or extra document writes. See https://firebase.google.com/docs/firestore/query-data/listen .
3. **Google SRE / secure distributed systems**: repeatable, idempotent state changes under lost responses, fail-closed payment reconciliation and explicit ownership. See https://google.github.io/building-secure-and-reliable-systems/raw/ch06.html .
4. **Lyft published Operator instructions and PIN safety**: driver confirms arrival, begins only after passenger boards, ends at drop-off; private PIN deters wrong-passenger pickup. See https://help.lyft.com/hc/en-us/all/articles/115012926147 and https://help.lyft.com/hc/en-us/driver/articles/8674172880-pin-verification-for-drivers .
5. **Uber published Operator guidance**: driver verifies name/destination, keeps riders informed, then begins with passenger seated. See https://help.uber.com/en/driving-and-delivering/article/picking-up-riders?nodeId=c57f4b7e-16a4-4508-80ef-3425deb1fcee .
6. **Stripe**: process asynchronous payment/transfer state from verified provider events and source-of-truth payment IDs; never infer success from device-only screens. See https://docs.stripe.com/payments/payment-intents and https://docs.stripe.com/webhooks .

No outside institution or licensed lawyer has personally certified American Rider, and these sources are not substitutes for direct test evidence.

## Outstanding before a justified claim of end-to-end commercial completeness

**P0 / release risk**: Adult pickup protection currently rollout-off; coordinate compatible Traveler and Operator clients, verified production key, and protected accepted ride creation before calling ordinary adult handoff trusted. Verify genuine paid booking, refund and operator payout reconciliation in Stripe test mode and physical devices.

**P1 / operational**: Establish robust correction route for alleged false pickup or premature destination completion; test reassignment and cancellation races on actual phones. Make permanent cancelled scheduled Travel history available from a bounded, index-supported authenticated view (currently only near-term records). Ensure aged `needs_attention` payment exception remains visible to Founder until resolved. Verify receipt deliverability and payout sweep behavior across app termination.

**P2 / UX/comprehensiveness**: Audit all related Traveler/Operator screens for accessibility (VoiceOver and readable labels), complete translations, real ETA uncertainty, safe back/cancel, legible progress, idle/error/offline states, and the same clean state on iPhone/iPad. Systematically compare each with HIG and published usability criteria; avoid speculative animation or redundant Firestore reads.

**Decision:** CI/source merges remain allowed once reviewed; no production deployment, feature-flag activation, signed distribution, Apple submission or TestFlight without separate explicit permission where applicable. The current Founder prohibition on new TestFlight remains absolute.
