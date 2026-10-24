# American Rider | Three-role launch acceptance and sequence trace | 24 October 2026

**Governing standard:** A single public app and supporting website for Travelers, Operators and Recruiters; one Founder, one phone, few routine manual interventions. This file is an acceptance trace, **not** a claim that any real person completed a Travel or a bank transfer. Use current source, provider records and review decisions, not old unmerged planning notes.

## 1. Traveler | one continuous account journey

| Step | Evidence in existing source/tests | Exact launch acceptance |
| --- | --- | --- |
| Sign up, verify, delete account | Firebase-auth flows, accountdeletion.test.js, authstatemachine.test.js | Physical iOS/Android and Apple/Google account-deletion disclosure |
| Enter Pickup → Destination → quote → all-in Total | faremodel.test.js, pricing; server /fare-quote and /travel/prepare | Quoted total = agreed, captured and receipted total; correct card/toll |
| Add card/wallet, book, wait for eligible Operator | payment-user-journey.test.js, booking.test.js, bookingrecovery.test.js | Production Stripe charge and no-Operator safe decline or refund |
| Operator accepts, arrives, picks up, completes | acceptance.test.js, dispatchgate.test.js, eligibility and Travel state tests | Signed two-device handoff; reject stale/uninsured Operator |
| Receipt, refund/dispute, support/emergency, reconnection | email-safety.test.js, payments-refund-charge.test.js, emergencyretry.test.js | Real provider receipt delivered and appropriate charge/refund confirmed |

Synthetic traces exist and are exercised by the repository's exhaustive and release gates. Real end-to-end phone/device + Stripe proof not established by this GitHub-only audit.

## 2. Operator | one continuous eligibility-to-bank journey

| Step | Existing evidence | Acceptance condition |
| --- | --- | --- |
| New Operator in active service area; never in unopened region | operator-first-class-onboarding.test.js, operator-onboarding-start.test.js | Real device/market sign up |
| License/vehicle/insurance/screening, independent verification | qualification.js, insurance-monitoring.test.js, external-screening.test.js | Authenticated broker/CRA proof and required Florida coverage, not synthetic documents |
| Stripe Connect hosted bank, agreement, current payer identity | payments.js, connect-onboard-atomic.test.js, connect-account-identity.test.js | Provider account shows payouts enabled and correct recipient |
| Go available, accept booked Travel, complete | acceptance.test.js, insurance-horizon.test.js, matching / dispatch tests | Expired or lapsed insurer immediately blocks new assignment |
| 99% Fare settlement, Stripe transfer, bank payout, reversal | payout-transfer-guard.js and tests, settle.test.js | Real provider transfer/receipt/refund and operator bank payout observed |

Florida §627.748(7)(d) still requires independent legal resolution of TNC coverage when Operator's insurance lapses; a platform lockout is not a proven legal substitute.

## 3. Recruiter | one continuous referral-to-bank journey

| Step | Present verification | Outstanding until fully commissioned |
| --- | --- | --- |
| Founder private invitation and verified-mail acceptance | recruiter-invite-service.test.js, recruiter-portal.test.js | Real emailed invitation accepted and signed-in website |
| Complete current legally approved agreement | recruiter-agreement.js and synthetic test (PR #309 source) | Externally approved exact terms version and affirmative acceptance in production |
| Stripe-hosted independent recruiter bank/tax/identity verification | recruiter-connect-finance.js and synthetic test (PR #309 source) | Stripe Express account created, payouts enabled, verified identity/bank, tax obligations met |
| Personal link/QR → real Operator or Traveler attribution | referral-service.test.js, recruiter-qr-source.test.js, recruiter-roster.test.js | Real iOS Universal Links and Android App Links after install |
| Qualified Operator/Traveler, genuinely completed paid Travels | recruiter-travel-activity.test.js, referral-accrual.test.js | Event-driven, immutable identity and confirmed charge/Operator transfer evidence |
| Approved funded commission → held/available/reversed journal | referral-accrual.js currently OFF; PR #309 transfer rail not a full accrual pipeline | Ratified rate, funded margin, maturity, refunds/disputes, no double credit |
| Payable to provider → verified ACH bank payout/reversal | existing recruiter-ach-batch.js **PREVIEW ONLY**; PR #309 newly adds duplicate-safe provider transfer but not bank payout reconciliation | Exact-once source transaction, Stripe payout.paid/failed/returned reconciliation, recipient bank proof |
| Private dashboard and exception recovery | corporate-recruiter-portal.cjs, recruiter-portal.js | Real, role-scoped pending/available/transferred/**bank-paid** amounts; secure self-service retry |

**Explicit result today: recruiter finance is NOT end-to-end complete.** Do not activate rewards or assert a bank payment until every stated financial and legal control passes.

## Critical external verification and last-mile actions

1. Synchronize current approved GitHub release SHA to the existing production Cloud Run using the pre-existing zero-traffic deployment/rollback workflow; audit workflow 40076999717 reported SHA mismatch. Keep exactly one signed provider webhook route and one scheduler.
2. On signed iOS and Android devices complete the three actual role paths, including interruptions, inaccessible/failing payment methods, no supply, lost network, forged referrals and bank returns. Source-only synthetic tests cannot truthfully replace hardware/store/provider evidence.
3. Confirm commercial insurance/screening/legal terms with qualified Florida counsel and providers; do not invent a written opinion, worker classification or compliance waiver.
4. Complete approved commission economics and bank provider execution/reconciliation, then certified Apple App Review and Google Play **production** submission and approvals.
5. Verify Google Cloud/Firebase Firestore real billed reads/writes after true usage, not from fixture counts.

## Engineering and compliance comparisons

- **Google SRE:** remove recurring human interventions, preserve alarms and a small exception-only Founder view (https://sre.google/sre-book/eliminating-toil/).
- **Google Firestore:** use bounded indexed queries and cursors, minimize index fanout and transaction writes; billing on reads/index entries still applies (https://firebase.google.com/docs/firestore/best-practices and https://firebase.google.com/docs/firestore/pricing). Existing geohash dispatch is bounded; do not replace it with H3 without real measured benefit (https://h3geo.org/docs/).
- **Stripe Connect:** reuse provider-hosted bank/identity verification and transfer/payout reporting; a platform transfer is not automatically a bank payout (https://stripe.com/connect/1099).
- **FTC:** compensated recruiter endorsements need conspicuous disclosure at invitation/link use (https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking).
- **IRS:** generally 2026 nonemployee reportable compensation threshold of $2,000, with exceptions and withholding duties (https://www.irs.gov/businesses/small-businesses-self-employed/am-i-required-to-file-a-form-1099-or-other-information-return).
- **Apple/Google:** review guidelines, location/use permissions, account deletion, safety and truthful data disclosures (https://developer.apple.com/app-store/review/guidelines/ ; https://support.google.com/googleplay/android-developer/answer/13327111).
- **Florida:** statute 627.748(7)(d) expressly addresses lapsed/insufficient Operator coverage (https://www.leg.state.fl.us/Statutes/index.cfm?App_mode=Display_Statute&URL=0600-0699/0627/Sections/0627.748.html).

No historical adviser, lawyer, Stripe employee or named university was personally consulted here. These are public research benchmarks, not endorsements or legal opinions.
