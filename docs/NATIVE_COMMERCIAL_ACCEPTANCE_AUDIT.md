# American Rider native commercial acceptance: evidence-based audit

Reviewed 2026-10-27 against the actual QA branch (PR #383) and official Expo, Maestro, GitHub Actions, Stripe guidance. This document is a testing plan, **not proof of a commercial launch pass**. Nothing here authorizes production payment or synthetic production eligibility.

## Current factual evidence

- Run 40472035990: local Firebase/Stripe TEST preparation and isolation checks passed. Android release APK installed on emulator, but first Maestro `launchApp` failed because its ADB device transport reported `device offline` and a dead Maestro device server. The app was not proved defective or healthy by this transport failure. Saved Android debug artifact: 12720188260.
- Same run: iOS native Release build exceeded the 105-minute test job window and was canceled. There is no completed iPhone paid journey. iOS artifact: 12725171273.
- Follow-up run 40497037683 attempts one infrastructure-only Android transport retry and uses a macOS arm64 runner with 155-minute timeout. Its outcome must be checked separately; changing a runner does **not** establish a pass.
- Only two native Maestro scripts exist in this QA branch: `.maestro/qa-commercial-traveler.yml` and `.maestro/qa-commercial-operator.yml`. They are **one standard paid Travel scenario**, not exhaustive commercial acceptance.

## Comparison with current official guidance

| Topic | Existing implementation | Recommended action and acceptance gate |
| --- | --- | --- |
| Build and test stages | Each OS job builds native source and runs the emulator, Maestro, and reconciliation in a single costly job. | Separate native **build artifacts** from on-device **smoke**, full UI, and backend settlement checks. Upload an iOS simulator .app ZIP and an Android APK, then reuse exact-commit artifacts for test-only reruns. Expo's EAS E2E sample uses build jobs feeding Maestro jobs. |
| Build tool | Uncached Xcode release build can exceed 105 minutes; Android rebuilds every test tweak. | Add dependency caches keyed to lockfiles, pin runner/tool versions, preserve per-step logs and artifacts. Try a minimal launcher smoke test before payment tests. Keep an explicit upper timeout and flag hanging builds. |
| Runner resources | Changed from macos-26-intel (14 GB) to macos-26 arm64 (7 GB) to attempt a faster CPU. | Check actual iOS build memory and time. ARM64 is **not** guaranteed faster for this dependency graph; revert or use EAS build when evidence supports it. Check GitHub's current runner specs. |
| Emulator instability | Android Maestro got `device offline` during app launch; latest branch retries only on that infrastructure signature. | Wait for boot + package readiness, check `adb devices` and a launcher-only smoke, capture system and Maestro logs; an infrastructure-only retry is permitted, but do not mask UI/business failures. |
| UI selectors | Sign-in depends on `testID=auth-primary-action`; numerous other script taps are tied to translated labels. | Give critical controls unique stable React Native `testID` values, check the UI hierarchy on each OS, and wait for UI state rather than fixed sleeps. |
| Test isolation | App uses Firebase Auth/Firestore local emulators and backend on localhost / Android `10.0.2.2`; Stripe TEST mode. | Preserve this strict isolation. Expo cloud device runners cannot reach a GitHub job's loopback server without additional safe networking; do not migrate blindly to EAS without solving that architecture. |
| Stripe | Maestro enters a TEST card in a native PaymentSheet; server later retrieves PaymentIntent and transfer. | Keep a *small dedicated native PaymentSheet interaction test*; test declined cards, 3DS, lost-network, failed capture, webhook duplication, release of holds, and refunds with mocked client outcomes and isolated backend fixtures. Periodically reconcile genuine Stripe TEST API records. Stripe warns that automated UI tests for some hosted/payment elements may be blocked and recommends response simulation in CI. |
| Evidence | One ride must be completed and Stripe TEST PaymentIntent succeeded with Connect transfer, a strong but narrow assertion. | Produce trace IDs / timestamps and screenshots for Traveler, Operator and Recruiter and receipts; verify fare/fee/toll ledger amounts, cancellation and no-show outcomes, and replay/idempotency. No green pass without each gate and artifact. |
| Production parity | QA-native release uses a special local backend, QA firebase project, TEST Stripe, and **unsigned** simulator app. | Separately compare candidate commit/build stamp and prod configuration, real signed app entitlements, Apple/Google SSO, deep links, permissions, Cloud Run, Resend receipts, and App Store/Play review. Emulator test evidence does not prove production eligibility or payout bank arrival. |

## Must-pass commercial scenario matrix (both iPhone and Android)

1. **Startup/authentication:** fresh install, Apple and Google sign-in where supported, email, session persistence, invalid credential, account deletion.
2. **Standard paid Travel:** real native Traveler search, exact fare/tolls/fees, Stripe TEST authorization, eligible on-duty Operator receives offer, accept/decline, verified pickup, onboard, complete, server capture, ledger/Connect reconciliation, Traveler/Operator history and receipts.
3. **Negative money cases:** failed authorization, expired/unused hold, cancellation in and outside fee window, Operator/Traveler no-show, failure during/after capture, duplicate webhook, transfer failures; never double-capture.
4. **Operator safety:** no duty/dispatch without actual insurance, screening and payout eligibility; expired insurance, suspension, geolocation unavailable, 24-hour safety windows, availability lapses.
5. **Other commissioned journeys:** airport/port dropoff restrictions, scheduled Trips, family/teen PIN and guardian notifications, Courier and Team/Family Travel where enabled, and no legacy Smart Travel openings.
6. **Recruiter:** link / QR / code / invite persistence, attribution for Operator and Traveler, 200-Travel cap, $0.15 each participant, $0.30 dual referral, Connect onboarding/fee consent, actual TEST payout eligibility, fee and ledger reconciliation.
7. **Release-specific:** review login, privacy/terms/deletion web pages, app-store metadata, accessible Google/Apple sign-in artwork and size, push/notifications, device return from background, iPad and Android screen variants.

## Execution policy

- **Fast gate:** lint/TypeScript/unit/security/contract tests and backend deterministic payment traces run before expensive native builds.
- **Build gate:** separate per-OS artifacts, one build per exact source/native configuration; never assume an old app contains new JS.
- **Smoke gate:** install app, launch on simulator, validate `adb` / `simctl`, confirm Auth emulator API, sign in/out, capture screenshot; this gate distinguishes infrastructure from app errors.
- **Commercial gate:** exercise role interactions against the *same* isolated Firestore and local API; complete payment and verify Stripe TEST ledger exactly once; track positive and negative cases.
- **Production parity gate:** run separate signed-build checks; do not substitute a local QA-enabled unsigned simulator build for review or live readiness.
- **Failure handling:** preserve screenshots, hierarchy, Metro logs, Android logcat / Xcode logs, provider TEST IDs, and classified failure reason; rerun only the failing stage against an unchanged binary when possible.
- **Status wording:** distinguish `setup passed`, `build passed`, `smoke passed`, `commercial UI passed`, `Stripe TEST reconciled`, and `signed production ready`. Never use **full journeys passed** until all relevant scenario evidence exists.

## References (official)

- Expo E2E tests: https://docs.expo.dev/tutorial/cicd/e2e-tests/
- Expo EAS Maestro jobs and recordings: https://docs.expo.dev/eas/workflows/pre-packaged-jobs/
- Expo GitHub iOS simulator article (October 2026): https://expo.dev/articles/cloud-simulators/run-expo-simulators-in-github-actions
- GitHub runners and RAM: https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job
- GitHub concurrency: https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency
- GitHub cache/artifact distinction: https://docs.github.com/en/actions/concepts/workflows-and-actions/dependency-caching
- Maestro stable `testID`: https://docs.maestro.dev/get-started/supported-platform/react-native
- Maestro wait guidance: https://docs.maestro.dev/maestro-flows/flow-control-and-logic/wait-commands
- Android emulator action: https://github.com/ReactiveCircus/android-emulator-runner
- Stripe automation: https://docs.stripe.com/automated-testing
