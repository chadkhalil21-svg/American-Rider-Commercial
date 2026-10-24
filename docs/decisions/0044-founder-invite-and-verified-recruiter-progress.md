# ADR 0044 | Independent recruiter invitation and verified-activity foundation

Date: 24 October 2026. Status: source candidate, no commercial or legal approval.

Supersedes only the second-Founder-approval step of ADR 0043. No recruiter Stripe Connect accounts by default; no bank details in our Firestore database; no invented commission rate, cap or Friday payday. Recruiters are intended as independent commission-only contractors, subject to applicable real-world classification review.

Founder invitation grants participation approval. An authenticated named-MFA Founder sends one email through the same private service as the website. Only the matching Firebase-authenticated verified email may accept a short-lived invitation. No second routine Founder approval is needed, while separate legal identity, signed agreement, bank/TIN and payout approval continue to block compensation and links.

ChatGPT's existing Founder OAuth service gains a distinct recruiter invitation scope. Scope never bypasses the separate Founder allowlist and launch gates. Same recipient/role cannot be inadvertently invited repeatedly.

Operator qualification progress is based only on a fresh platform assessment, not recruiter or applicant assertions. A retryable immutable event for each server-verified settled Travel supports accurate historical activity counts once separately commissioned; it is not a refund-reconciled earning or payout. The tracking flag remains OFF until production evidence and reversal handling are verified.

The payment system cannot be activated from the disabled 15-cent prototype. A lawful, funded, versioned commission plan, refund/dispute reconciliation, secure W-9/TIN and ACH provider onboarding, and confirmed cash disbursement ledger remain required. Preserve Operator 99% Fare and Traveler Total.

Source audit and references: docs/audits/RECRUITER-END-TO-END-TRACE-2026-10-24.md.
