# American Rider | Private recruiter dashboard: truthful metrics, privacy, and money

**24 October 2026. Source under review, program OFF. No real recruits, earnings or payments inferred.**

## Findings from actual release source
- Already deployed source: private web recruiter sign-in at `/recruiters/portal/`, Firebase authentication, `GET /recruiters/me` with two indexed introduction counts, founder-reviewed account status, role-specific invitation links/QR, and explicit compensation-not-commissioned status.
- Not implemented yet: consent-backed recruit names; verified qualified Operator roster or fleet-readiness status; verified paid Travel counters attributable to recruiter; earned, held, available, transferred, failed, reversed payout ledger; secure hosted bank/identity/tax onboarding; actual payout provider. The `referral-accrual.js` helper is OFF and does not create payable money.
- A link click, QR scan, downloaded app, submitted qualification or incomplete Travel is never an earned referral reward.

## Dashboard v1 scope
One **Recruitment Overview** on the first-party website. It shows:
1. Separate server-owned Operator and Traveler introduction totals. "Introduction" means an account accepted the referral code and the server recorded an immutable attribution, not a click or an install.
2. A private, indexed 20-row paginated list, filtered by role and owned by the verified Firebase uid plus the email authenticated at recruiter invitation acceptance. Each item has a non-identifying, stable recruitment reference, date, "Introduction recorded" and "Qualifying Travels: Not verified". No names, Firebase UIDs in rendered cells, emails, telephone numbers, route histories, addresses, payment cards or financial account identifiers.
3. Qualified Operators, qualifying Travels and paid compensation truthfully show **not verified** / **not commissioned** until authoritative sources and program approvals are deployed. No zero that could imply measured or accrued money. No speculative reward calculations.
4. Share/QR controls remain disabled unless current legal, program, app link and recruiter identity/agreement/payout eligibility conditions *all* pass. No public self-enrollment.

This is an incremental interface and private API. No new recruiter app, H3 database, cron polling, contact imports or regional dashboards. Google Firestore supports index-backed `count()` totals and cursor pagination. **No new index needed:** the roster reuses the existing `referral_attributions(inviterUid ASC, role ASC)` index and orders by stable document ID. Records display dates but are not newest-first. Official Firestore documents confirm the index's implicit `__name__` ordering. No separate index rollout or added infrastructure is required.

## Phase 2: events required for meaningful money and qualification metrics
- Only server-reviewed Operator eligibility may advance a record from "Introduction recorded" to "Qualified Operator"; do not disclose reasons for screening denial, insurance contents, licence IDs, personal addresses or private correspondence to recruiters.
- A completed Travel counts as **qualifying for the recruiter** only after actual captured payment, successful Operator settlement as required by the approved program, anti-fraud rules, and settled reward eligibility. Keep total completed Travels separate from capped *reward-qualifying* Travels; do not show a number that silently stops at a reward cap and call it all Travels.
- Record immutable events per `(travelId, role, programVersion)`, exactly once, and maintain read-only ledgers: **Held**, **Available**, **Paid**, **Adjusted**. Match "Paid" to actual bank/provider confirmation, not a requested transfer. Refunds, reversals, returns and disputed charges must reconcile against the original event.
- Every account sees only its own detailed compensation statement. The Founder sees restricted, aggregated network/exception operations separately. Query only scoped indexed records on demand; no full national fleet scan and no continuous app or website polling.
- If the recruiter needs a person’s name for direct follow-up, offer **separate opt-in** at Operator signup, explaining exactly which name/progress fields the named referring recruiter will see. Absent valid consent, show private reference and permitted stage, not a person’s identity. For Travelers, favor aggregate counts; never show routes, addresses, passenger identity, or individual Travel times.

## Counsel-reference review required before activation
- FTC Endorsement Guides: compensated endorsements need conspicuous material-connection disclosure alongside links and QR cards, and a reasonable company training/monitoring process: https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking
- FTC business privacy guidance: purpose limitation, protection of personal information and reasonable security remain essential: https://www.ftc.gov/business-guidance/privacy-security
- Google Firestore official count and pagination reference: https://firebase.google.com/docs/firestore/query-data/aggregation-queries ; https://firebase.google.com/docs/firestore/query-data/query-cursors
- Uber own published pattern distinguishes a referral’s sign-up/status, completed trips and earned reward: https://help.uber.com/driving-and-delivering/article/how-referrals-work?nodeId=854e98a9-0d73-45f0-9fce-cb40a6f7a37c
- IRS guidance notes calendar-2026 $2,000 Form 1099-NEC service threshold in applicable cases, subject to withholding and payer/payment method exceptions. Threshold is not a tax exemption: https://www.irs.gov/businesses/small-businesses-self-employed/am-i-required-to-file-a-form-1099-or-other-information-return
- Qualified outside counsel still must approve: recruitment contractor/agency agreement, roles, state consumer/contact/privacy law and marketing communications, names/progress disclosure basis, cancellation/refund reversal rules and permissible record retention. Tax professional and approved payout provider separately validate tax reporting and secure bank setup. No adviser, Operator or lawyer was personally contacted; these are **published benchmarks**, not outside approval.

## Exit criteria
- Current source PR complete, deterministic tests pass and green exact-head CI; Founder-reviewed merge.
- Existing indexed referral query verified against production Firestore and source parity with production Google Cloud Run; no new index needs deployment. Authenticated negative tests (other recruiter, missing verification, changed email, wrong role, forged cursor, suspended account), real web sign-in, back navigation, mobile accessibility and account-switch leakage checks.
- Genuine consent, qualification events and financial statements *only* once policy, money events, and real bank-provider reconciliation are operating. Public recruiter program remains OFF until independently commissioned.

## 24 October 2026 counsel-source refinement

Official FTC FAQs say a personal code alone may not clearly disclose recruiter compensation; retain disclosure adjacent to every link/QR and train recruiters. The IRS publishes a $2,000 threshold for calendar-2026 nonemployee compensation information returns in applicable circumstances, which is **not** an exemption from taxes. The U.S. Department of Labor's February 26, 2026 independent-contractor proposal remained a **proposal** in the sources reviewed, not a blanket permission to classify recruiters as contractors; counsel must assess actual control and state law. California's CCPA may give consumers rights to know and limit personal-information sharing where applicable; do not give recruitment agents passenger route histories or contact details. Published advice is not direct attorney engagement.

Sources: https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking ; https://www.irs.gov/businesses/small-businesses-self-employed/am-i-required-to-file-a-form-1099-or-other-information-return ; https://www.dol.gov/agencies/whd/flsa/misclassification/2026rulemaking/faqs ; https://oag.ca.gov/privacy/ccpa ; https://firebase.google.com/docs/firestore/query-data/index-overview .
