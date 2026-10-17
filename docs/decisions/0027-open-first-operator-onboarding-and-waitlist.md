# ADR 0027 — Service opens before Operator onboarding
**2026-10-16 · Founder-ratified, supersedes proposals to prepare Operator compliance in unopened areas**

## Binding decision (closed)
- The geographic service area must be **active/open first**. Only then may an Operator in that area begin registration, document/PDF review, insurer confirmation, background screening, payout setup, and—after independent individual qualifications—paid Travel.
- Unopened areas, including unconfigured states such as Colorado, display a calm **Coming soon** message. Interest registration is **optional and inexpensive**. Selecting a county is not consent to be added to a marketing or notification list.
- The current Traveler front door already has a pickup-area unavailability message and rate-limited account-bound `POST /waitlist`; preserve a comparable lightweight Operator option. Store only coarse location or county where needed. Do not assert notifications are sent until an actual verified opt-in delivery mechanism is commissioned.
- Do not treat registration, geographic service readiness and Operator's independent eligibility as interchangeable. The open-market gate permits registration; it does not grant insurance, screening, identity or payments approval. No unqualified Operator may accept a Travel.
- Do not recreate the retired administrative `market_admission` blocker. The actual configured active geography and existing individual safeguards remain the sources of authority. Unknown geography must fail closed for paid service.
- Minimize Firebase reads/writes and external contacts for unopened areas. No Stripe, R2, OCR, insurance, third-party reports or screening for waitlisted accounts. Market status should be cached where safe; server must independently check the market at any costly/action boundary.

## Superseded or retired language
- Any claim that screening, documents, qualification or other Operator onboarding may begin in `waitlist` or `onboarding` status is superseded.
- Closed, unmerged PR #47 had proposed such advance preparation. It was rejected explicitly and must never be merged.
- Early-preparation descriptions in old audit/decision files or superseded tests are **historical**, not policy.

## Why
Founder rejects national early onboarding: unlimited out-of-area applicants would create unnecessary personal-data collection, third-party/provider and storage cost, server load, and expectations before a market is commercially offered. Interest is welcome without demanding a regulatory application.

## Acceptance checks
1. Open county and independently configured state policy: valid Operator may start and be assessed, subject to all real eligibility checks.
2. Active county but missing legal rules: no shortcut to screening or insurance approval.
3. Waitlisted county: no document upload, screening, private evidence reading, payouts initiation, qualification submission, duty, or booking. A real account may **choose** to register interest.
4. Unsupported Colorado: coming-soon explanation; no Florida rule copied; no paid eligibility.
5. Closed/unavailable location check: fail closed, no false `Verified` badge or fake notification.
6. No automatic waitlist record merely for selecting a county.
7. Maintain previous Traveler lost-item/photo uploads and existing paid routes; no loss of support features.
8. Test on real iPhone and Android before accepting a release, including back, foreground, app restart, location unavailable, account email consent and permission refusals.

## Evidence and limits
- Source: `backend/markets.js`, `backend/server.js`, `backend/screening-jurisdictions.js`, `app/operator/qualify.tsx`, `app/index.tsx`.
- Separate documentary UX audit: `docs/audits/OPERATOR-ONBOARDING-END-TO-END-UX-2026-10-16.md`.
- Source-level and twice-run tests are **not** production device verification. No state was opened, no email sent, no real screening/insurer contacted, no fares changed.
