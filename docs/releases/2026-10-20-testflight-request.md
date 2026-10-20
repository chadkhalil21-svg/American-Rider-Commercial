# American Rider | iOS TestFlight request | 20 October 2026

## Purpose
Founder requested an up-to-date signed iOS TestFlight candidate from the **current** Commercial `release/current` branch after PR #161 merged. This record is a build request and checklist, **not** proof that a build, Apple processing, or device testing succeeded.

## Reuse existing controlled workflow
- Existing workflow: `.github/workflows/submit-certified-ios-testflight.yml`.
- This document's release commit deliberately includes the `[testflight]` trigger. The workflow must verify the exact current release SHA before it builds.
- Use the existing Expo `production` profile with the paid Google Cloud Run API and the existing App Store Connect iOS app identity.
- Authenticate only with private `EXPO_TOKEN` and `ASC_API_KEY_BASE64` Actions secrets. Stop cleanly if either is missing; do not expose credentials in source, tickets, or logs.
- Build and submit the exact EAS build ID to Apple TestFlight. Verify GitHub Actions completion and Apple processing separately.
- No fare, Stripe, Firestore, Scheduler, market, operator qualification, or server deployment changes are authorized by this request.

## On-device acceptance
Test physical iPhone and iPad installation, Apple/Google sign-in, location permission, booking, authoritative quoted total, payment sheet, Operator duty and offer acceptance, pickup/Travel progress, background and post-restart notifications, cancellations/refunds, support, and logout/account recovery. Record actual device/OS/build and failures. Use Stripe sandbox for synthetic money paths; do not mistake them for live paid-booking evidence. Android internal testing requires the separate existing Android workflow.

## Release evidence still required
The GitHub workflow run must explicitly report EAS success and App Store Connect submission; then obtain actual TestFlight availability, tester invitation, installed build and end-to-end device observations. Confirm the deployed Cloud Run API source separately before claiming app/server exact parity.