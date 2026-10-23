# ADR 0043 — Bank-first independent recruiter payments, cap provisional
Date: 2026-10-23
Status: Founder direction, source-only; financial and legal activation prohibited

## Decision
Independent paid recruiters will NOT be placed on Stripe Connect merely to receive commissions. Prefer ordinary bank ACH deposits using a duly approved business bank or payout provider, in a single scheduled Friday batch per eligible recruiter when practicable. An existing Operator's Stripe payout setup is separate from the independent recruiter compensation rail; no new monthly active recruiter Connect fee is assumed or passed through.

The initial 15-cent per qualifying settled Travel / 200-Travel / $30 maximum from the disabled prototype is only a financial research scenario. It is NOT a legal requirement, contractual promise or settled long-term compensation policy. Final pricing must be versioned, demonstrably funded after costs, and reviewed by qualified counsel before public recruiting.

## Controls
- Founder issues exactly one authorized invitation by email (including potentially via a permissioned ChatGPT command after the action exists); verification and acceptance satisfy ordinary activation without a second manual Founder review. A forwarded token cannot authorize another email/identity. Revoke, expire and audit credentials.
- Authenticated private web dashboard on the existing American Rider web platform; aggregate recruiter-only counts, paid/disputed status and own URL/QR; no exposure of recruit or ride private records.
- No raw bank details in the app datastore; external bank-provider onboarding and recipient tokens only. Tax and legal identity verification are separate from controlling an email inbox.
- Weekly Friday is an initiation schedule; receiving-bank availability may differ. Unpaid under-threshold balances carry forward under clear disclosed contract terms.
- Actual payouts require verified independent funding, reversible holds, atomic disbursement IDs, bank acknowledgments, returned/rejected-item reconciliation, anti-fraud gates, 1099 handling where applicable, and dispute correction.
- All new tests and prototypes remain disconnected from deployed live routes and cannot pay out. The existing Traveler Invite a Traveler experience and Operator 99% Fare remain unchanged.
- Corporate counsel and bank/provider agreements are real external approvals; published Apple/Google/FTC/Nacha and institutional sources are benchmarks, not direct consultations.

## Considered alternatives
Stripe Connect: rejects recurring monthly-active charges for small recruiter rewards, despite existing separate use for Operators.
Direct bank ACH: preferred once origination, pricing, funding, verification, returns and controls are commissioned.
ACH intermediary: acceptable if bank direct ACH is unavailable or uneconomic, only after comparing actual written pricing.
Uncapped per-Travel commissions: rejected pending net-margin and retention evidence, rather than mistaken for a mandatory legal cap.

## Verification
Reference: docs/APPROVED-RECRUITERS-OPERATING-PLAN.md, backend/recruiter-ach-batch.js, backend/recruiter-ach-batch.test.js, public/recruiter-preview.html, GitHub issue #249. Preview and pure planner are OFF and not financial execution. Do not infer bank commissioning, completed public website, Cloud Run release or counsel approval from this ADR.
