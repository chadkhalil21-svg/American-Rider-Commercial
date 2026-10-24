# American Rider | Recruiter complete-journey trace (24 October 2026)

**Status:** source review only; no private recruiting email, provider payment, Cloud Run deployment, store build or outside lawyer consultation performed. The company uses independent, commission-only recruiters, NOT employees. This describes founder policy, not a conclusive federal or state worker-classification determination.

## Sequence and evidence

| Stage | Source truth | Remaining external verification |
| --- | --- | --- |
| 1 Founder authorizes by command | Existing named Ops MFA plus new `invite_recruiter` OAuth scope; founder allowlist and independent launch gate required, one named account | Installed plugin must re-authorize new scope, signed real request and email |
| 2 Invitation sent | Same mail helper for protected web and OAuth; email-and-role duplicate suppression, 48-hour invitation, one-use SHA256 token | Valid Resend sender, inbox delivery/retry/revoke tests |
| 3 Signup | Firebase-authenticated verified mailbox bound to invitation | Real email/SSO/device testing |
| 4 Participation approval | Verified acceptance of founder-issued invitation is already Founder approval; no second human approval click | Founder account gate, 2-factor identity, legal review |
| 5 Tax and bank | **Missing**: hosted third-party W-9/TIN, secure bank account token, KYC, ACH authorization and bank returns. Do not store raw info locally | Selected bank/ACH partner agreement, proper reporting and all states |
| 6 Legal agreement | **Missing**: versioned signed independent commission-only contractor agreement, termination, geographic solicitation and marketing rules | Qualified counsel state-by-state review, current classification facts |
| 7 Personal link | Existing role-specific 12-character personal code, signed app-link gate, QR/share with compensation disclosure | iOS AASA, Android assetlinks, signed devices and install return |
| 8 Claim | Atomic authenticated immutable `referral_attributions` keyed by invitee and role; no clicks/installs counted | Native device tests and wrongful/duplicate/family/self-referral tests |
| 9 Operator verified | New page-bounded private read of recent server assessment `users.qualification` without insurance/screening details | Check under live source and confirm freshness after expiry |
| 10 Travel settled | New fixed-document, transactionally idempotent and bounded observed settlement activity, queued only after confirmed Operator transfer and Traveler capture | **Feature flag OFF** pending real Cloud Run, refunds/disputes and data backfill |
| 11 Eligible commission | **Not wired**. Existing `referral-accrual.js` hardcodes an illustrative, disabled 15 cents and claims store `rewardEnabled:false`; this is NOT an authorized financial product | Founder approves written rate, window/cap, funded margin and counsel agreement; real provider evidence |
| 12 Earnings ledger | **Missing**: immutable HELD / AVAILABLE / PAID / ADJUSTED journal, after payment capture, transfer, fraud and refunds | Stripe funds/reversals, durable replay, quality/financial controls |
| 13 Bank payout | Existing `recruiter-ach-batch.js` only previews, sends zero dollars; direct bank ACH preferred, no unnecessary Stripe Connect charge | Approved provider, verification, idempotent execution and bank return reconciliation |
| 14 Privacy/exception | Private verified email/UID authorization, capped records, pseudonymous roster, MFA Founder approve/suspend/lookup | End-to-end signed web/login and cross-account negative tests |

## Immediate engineering improvements proposed

- Reuse one invited identity and one verified email, no second recruiter app or additional approval click.
- Shared invite delivery with duplicate protection, OAuth-Founder permission and existing site route, all disabled until independently commissioned.
- Separate verified Operator *recent assessment* from mere introduction. Historical/current eligibility may change; age out the assessment after one hour.
- Record successful settled Travel activity without changing the Operator's 99% Fare or promising a reward, with one durable pending flag and transactional fixed event IDs for crash/retry safety.
- Do **not** call a settled observation a qualifying commission or confirmed bank payout. Separate refund/reversal processing remains mandatory.
- No invented Friday schedule, commission cents, lifetime cap, pay threshold, provider, auto-1099 filing or tax verification.

## Legal and accounting references (published, no attorney consultation)

- IRS contractor onboarding: request W-9 for correct name/TIN, preserve appropriately; qualifying calendar 2026 payments of $2,000 or more generally require 1099-NEC, with exceptions and backup withholding rules: https://www.irs.gov/businesses/small-businesses-self-employed/forms-and-associated-taxes-for-independent-contractors and https://www.irs.gov/instructions/i1099mec
- FTC disclosures for compensated recommendations next to the link and adequate recruiter training: https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking
- Independent contractor vs employee is determined by actual relationship and applicable state/federal tests, not the contract label: https://www.dol.gov/agencies/whd/flsa/misclassification/2026rulemaking/faqs
- Google SRE toil reduction, Apple secure and plain UX, and Founder Council rubric: https://sre.google/sre-book/eliminating-toil/ and https://developer.apple.com/design/human-interface-guidelines

## Highest risk blocking commercial completion

Commission terms and net economic funding have never been authorized. In addition to bank and tax vendor setup, a provider-confirmed settlement/refund/dispute/ACH-return accounting trail is necessary to avoid false earnings and duplicate transfers. **All financial execution remains disabled.** Cloud Run production is separate from Render and must be independently verified at its exact approved release and authenticated browser routes. No source test proves live banking, identity, tax or legal readiness.
