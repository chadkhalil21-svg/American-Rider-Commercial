# American Rider | Founder-first complete launch trace
**24 October 2026 | Controlled review of release/current source and published requirements**

## Executive judgment
American Rider is a transportation marketplace whose first public product is the **Traveler and Operator app**. Recruiter referrals are an invited auxiliary acquisition channel, not a requirement to publish a correctly functioning booking product. Reuse a single account, an existing authenticated Founder Operations console, Firebase, Google Cloud Run, Stripe, Resend and bounded Firestore queries. Freeze nonessential interface redesign until physical end-to-end booking and both store reviews succeed.

**Evidence vocabulary:** source exists is not deployed; deployment is not device tested; synthetic payment is not a real bank settlement; app-store candidate is not published. No live private Operator/Traveler totals, signed physical device tests, real revenue or Google Cloud Run revision were fetched in this review. Live counts are not fabricated.

## End-to-end trace and required next action

| Stage | Source evidence | Current disposition and proof missing |
| --- | --- | --- |
| 1. Traveler installs / opens | `src/state/AuthContext.tsx`, `app/index.tsx`, Firebase email + Google/Apple | Verify currently signed iOS and Android apps with genuine account creation, sign-in/recovery and deletion. Apple requires account deletion and review access. |
| 2. Operator chooses service area | `app/operator/qualify.tsx`, `backend/qualification.js`, geographic configuration | Preserve open-area-only onboarding and operator-specific screening, insurance, background eligibility, vehicle and payment-account checks. No self-verified clearance. |
| 3. Price, consent and booking | `backend/fares.js`, `backend/fareauthority.js`, `backend/booking.js`, `/fare-quote`, `/travel/prepare` | Show authoritative all-in Traveler Total; capture one agreed quote with genuine payment method, prevent duplicate charged booking. |
| 4. Operator offer and dispatch | `backend/geooperators.js`, operator eligibility, app inbox | One real eligible Operator on current signed hardware, actual location, notification background/locked-phone acceptance. |
| 5. Pickup/Travel safety | `backend/travelprogress.js`, safety/emergency, existing cases | Test real arrival, identity handoff, acceptance, cancellation, emergency, safety and low-network recovery; special Teen flow only where offered. |
| 6. Completion and money | `backend/manual-capture.js`, `backend/travelmoney.js`, webhook, Stripe Connect | Prove genuine capture after completion, original-charge transfer, 99% Fare to Operator, correct Platform Fee, no duplicate transfer, payout and receipt. Test declined/expired/refund/chargeback. |
| 7. Scheduled, cancellation, support | existing scheduler and `/ops/cases`, `/ops/scheduled-exceptions` | Single schedulers/exception queue; safe no-Operator, no-show and cancellation states, durable receipts, appropriate refund vs void. Avoid an extra admin engine. |
| 8. Founder oversight | Existing `/ops` shows bounded samples, NOT complete national population counts | This PR adds **on-demand Firestore index `count()`** at protected `/ops/overview`: registered user profiles, registered Operator profiles, self-reported available Operators, completed Travel records (not paid), recruiter accounts. Each count partial failure displays Unavailable, never zero. Users can also be Operators. **Exact Traveler-only count is unavailable** until a verified role marker or suitable migration exists, so DO NOT subtract Operators from users. |
| 9. Recruiter invitations (optional) | PRs 290, 291, 293, 297 include invitation, accept/Create Account, private dashboard + profile display | No need to delay core app for optional recruiter payouts. Cloud Run API still unverified, financial ledger/FTC disclosures/hosted payments unresolved. Do not advertise paying recruiting until commission economics are funded and payment/tax provider actually commissioned. |
| 10. Production serving stack | Render site and Render server deployed after PR 297; separate Google Cloud Run production API URL referenced in recruitment website | Verify real serving **Cloud Run** SHA/revision, authentication, public routing for the signed mobile apps, secrets, Stripe webhook target and exactly one scheduler. Never migrate by deploying another unverified backend or starting two money webhook processors. |
| 11. Apple and Google publication | Existing EAS build workflows, TestFlight and Android AAB submission support | Apple's App Review requires functional backend, complete metadata/privacy, working demo accounts and physical device tests. Google Play Console requires production-ready signed package, privacy/data safety and any applicable closed-testing rule (not all organization accounts require 12 testers). Independent store approval and appearance in both stores remain unproven. |
| 12. Regulatory proof | Florida 2026 s. 627.748 and operator screening/insurance restrictions | Section 627.748(7)(d) explicitly says a TNC's maintained coverage steps in if a driver's insurance lapses or is insufficient, first-dollar including duty to defend. Disabling ineligible Operators is prudent but **not demonstrated to replace** that statutory duty. Founder policy to avoid a platform-wide backstop does not itself create a legal exception. Qualified Florida TNC insurance counsel must review; not yet personally consulted. |

## Founder action priority
**P0 (critical app launch):** Confirm one serving paid Google production API and signed iOS/Android real-user Travel → capture → Transfer → support/refund acceptance. Commission any mandatory insurance/permit obligations. Obtain accurate store metadata, review accounts, uploads and store review. Check market geography and actual qualified Operator supply.
**P1 (founder management):** Publish the exact counts page once the protected production backend matches source; real genuine metrics and exceptions, no synthetic “profit.” Add exact Traveler-only records only after historical data can be reconciled.
**P2 (optional growth):** Enable private referral program after signed download attribution, real commission amounts/rights, reversals, financial rails and proper disclosure. Do NOT treat recruiter onboarding as a blocker of initial Traveler/Operator app publication.

## Institutional source review (not an attorney or Council consultation)
- Apple official App Review https://developer.apple.com/app-store/review/guidelines/ and https://developer.apple.com/help/app-review/before-submitting-for-review/complete-review
- Google Play testing, specific to **new personal** developer accounts https://support.google.com/googleplay/android-developer/answer/14151465
- Florida actual 2026 TNC coverage https://www.flsenate.gov/Laws/Statutes/2026/627.748
- Firebase index-supported counts https://firebase.google.com/docs/firestore/query-data/aggregation-queries
- FTC compensated endorsements https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking
- IRS applicable independent-contractor information reporting https://www.irs.gov/businesses/small-businesses-self-employed/reporting-payments-to-independent-contractors

**Council reference:** Ford: stop duplicating infrastructure, focus on repeatable booking. Rockefeller: reconcile retained Platform Fee, chargebacks and compliance expense before committing commission rates. Jobs/Apple: seamless two-role real-device journey and accurate displays. Google SRE: one scheduler, observable exception queues, not another poller. Emirates: reliable support, calm precise copy, strong handling of failure. This is a written design standard, not personal advice from these figures/institutions.
