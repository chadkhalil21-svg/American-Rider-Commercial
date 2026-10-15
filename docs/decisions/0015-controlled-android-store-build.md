# ADR 0015 — Controlled Android production bundle

**2026-10-15 — Candidate until merged.** This decision concerns only release preparation, not geographic activation, Operator qualification, fares, or production payment authorization.

## Source-led finding

The current Commercial repository has a configured Android package and EAS production build profile, but lacks an Android store-build workflow. Its existing iOS TestFlight manual workflow is only present on `release/current` while the repository default branch is the older `approved/account-security-2026-09-27`. GitHub requires `workflow_dispatch` workflows to exist on the default branch before the manual Run control is available. Therefore **manual triggering is not currently proven**, even though the workflow source exists.

Expo's official documentation says a standard EAS Android `production` build produces a Google Play `.aab`, while store submission requires separate Play Console setup and signing/submission authorization. References:
- https://docs.expo.dev/submit/android/
- https://docs.expo.dev/eas/cli/
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
- https://support.google.com/googleplay/android-developer/answer/9799150

## Chosen correction

A manually invoked GitHub workflow checks the requested *exact* current `release/current` commit, Android package and production build profile, requires an existing authenticated EAS account, and builds a signed Android store bundle. It **never auto-submits or publishes** to Google Play. Any charged EAS build runs only after an authorized human starts it. A separate static regression executes in normal backend CI.

To make the manual launch controls available, repository administration must still change the default branch to `release/current` (or deliberately install an independently audited manual dispatcher on the existing default branch). No supported connected GitHub operation currently changes the repository's default-branch setting, so this action is **not claimed complete**. Google Play Console signing and listing, policy declarations, internal track, and physical-device evidence are separate.

## Council and engineering standards

- **Ford:** One repeatable exact-release workflow rather than asking the founder to assemble an Android file manually.
- **Rockefeller:** No build, paid service, or market-price polling on every commit. Explicit manual trigger only.
- **Jobs and Apple:** A working signed mobile build is more meaningful than a web preview or simulated app.
- **Google SRE:** Trace exact release source; verify dependence on EAS credentials and handle failure without false release success.
- **NASA:** Store-built software is still not certified for physical Android location, authentication, payments and safety until observed on devices.

Tests must pass on the change's exact PR head before merge. No live fares, Operator account, paid Travel, or external provider setting is changed by this code.
