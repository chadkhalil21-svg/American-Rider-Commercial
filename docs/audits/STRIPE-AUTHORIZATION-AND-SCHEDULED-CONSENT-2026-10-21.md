# American Rider | Stripe authorization at booking: verification and counsel review (21 Oct 2026)

## Founder-approved behavior
- Immediate Travel: a single, server-priced PaymentIntent with `capture_method=manual`; Stripe returns `requires_capture` and a valid `capture_before` before dispatch. **Only server-verified Travel completion** captures the authorized full amount. A fee-free cancellation cancels the original PaymentIntent and frees the remaining hold, not a separately funded refund.
- Future scheduled Travel: booking records a reservation **without reserving any funds yet** if the pickup is many days away. Ask permission to store/reuse a card for a future off-session authorization; near dispatch, locate a qualified Operator first, request a Stripe off-session authorization, then dispatch only on provider-confirmed and still-valid hold. A bank may require a customer-present challenge, in which case do not dispatch and transparently request action. Never imply an indefinite authorization.
- Card-network windows **vary**. Stripe documents Visa merchant-initiated 4 days + 18 hours, Visa customer-initiated 7 days, and other major online cards generally 7 days, but classification and issuer/network conditions matter. **Read the actual Charge `payment_method_details.card.capture_before` and require a safety buffer**. Do not hardcode “a guaranteed seven days.”
- If Stripe captured, a genuine overcharge/duplicate uses the verified refund/correction process, including chargeback reconciliation. Do not issue a second refund for a bank-reversed payment.
- Operator Connect transfers remain after capture, tied to the original source charge and idempotent provider IDs. A failed Connect account must not prevent capturing a completed Travel before its hold expires; it may delay the Operator transfer.

## Source reviewed
- `backend/payments.js`: manual capture behind `AR_MANUAL_TRAVEL_CAPTURE`; Checkout via PaymentSheet; scheduled off-session authorize at dispatch; idempotent full, partial, and release paths.
- `backend/payment-hold-policy.js`, `backend/manual-capture.js`, `backend/booking.js`, `backend/travelmoney.js`, `backend/webhook.js`, `backend/scheduler.js`.
- PR #212 merged at release `962ebb4`: interrupted mobile return verifies and reuses the **original** hold without a second PaymentSheet.
- New change in this branch: future scheduled manual-mode reservations refuse a missing affirmative consent or missing saved card **at booking**, while remaining uncharged until a dispatch candidate is found. Existing automatic-capture scheduled bookings remain unchanged until the rollout flag is activated. Five language disclosures and a test-key-only provider acceptance workflow included.

## Engineering comparison and restraint
- **Stripe:** one PaymentIntent per Travel, verified ownership, idempotency, real capture deadline, partial capture only against a previously disclosed legitimate fee; provider status rather than app assertion decides money.
- **Google Cloud Run:** release the same tested SHA as zero-traffic revision, verify readiness and preserve secrets/scheduler; promote and automatically roll back if probes fail. Source `962ebb4` deployed as revision `00012-2sw`; actual provider transaction remains separate.
- **Google Firestore:** use indexed, bounded due-reservations queries and atomic state transitions; avoid new always-on pollers, full collection reads and redundant writes. This change uses a *single Stripe saved-card lookup when creating a new manual scheduled reservation* and no additional Firestore read or write for normal maintenance.
- **Uber H3:** index nearby Operators for candidate discovery only; H3 cell closeness is not road-route duration, actual Operator proximity, permit, insurance, availability, or verified Travel completion. Retain exact GPS + routed ETA checks where material. No new spatial engine needed for this payment change.
- **Apple / Google Pay:** use official native PaymentSheet wallets with correct merchant provisioning and explicit amount and hold terms; real-device tests remain required. A mocked wallet is not a device-certified wallet.
- **Commercial simplicity:** no new provider, queue, cron, geospatial index or subscription.

## Independent Florida counsel review required
Review (1) clear fare/estimate before commencement and electronic receipt duties under Fla. Stat. §627.748, (2) affirmative stored-payment-method and merchant-initiated transaction consent, (3) full cancellation/no-show and $4 gross/$3 Operator terms **separately** before turning on `AR_MANUAL_CANCELLATION_FEE`, (4) whether service terms and cardholder notices adequately explain authorization holds, unsuccessful authorization, no guaranteed assignment and issued refunds, (5) transport category / network merchant-initiation rules, and (6) dispute evidence retention, privacy, and participant appeal process. No independent attorney response or approval was obtained by this automated audit; this document is a review packet, not an opinion.

## Acceptance decision
- **Source only:** static and synthetic payment-policy tests, plus complete GitHub CI.
- **Provider test mode:** run founder-triggered `stripe-manual-sandbox-acceptance.yml` using a securely configured `STRIPE_TEST_SECRET_KEY` (test-only). Confirm three actual Stripe TEST PaymentIntents: full capture, fee-free canceled hold/no refund, and one final 400¢ partial capture. Never attach a live key or create real payments from this script. Record receipt IDs and provider deadlines privately.
- **Further required before live flag:** authenticated end-to-end immediate+scheduled booking through Firestore, 3DS `requires_action` / decline, stale/failed scheduled dispatch reversal, exactly-once webhook/payout, signed iPhone Apple Pay and Android Google Pay and fallback cards, explicit receipt and support recovery, actual Stripe/Connect fee terms, counsel review of separately proposed cancellation fees.
- **Activation:** do not enable `AR_MANUAL_TRAVEL_CAPTURE` or cancellation/no-show fee flags from this PR. Stale TestFlight/native binaries without updated scheduled authorization consent must be upgraded before the flag can safely be activated.

Sources:
- https://docs.stripe.com/payments/place-a-hold-on-a-payment-method
- https://docs.stripe.com/payments/mobile/accept-payment?platform=ios&type=setup
- https://docs.stripe.com/connect/marketplace/tasks/accept-payment/separate-charges-and-transfers
- https://docs.cloud.google.com/run/docs/rollouts-rollbacks-traffic-migration
- https://firebase.google.com/docs/firestore/best-practices
- https://h3geo.org/docs/
- https://developer.apple.com/app-store/review/guidelines/
- https://www.flsenate.gov/Laws/Statutes/2026/627.748
