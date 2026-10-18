# American Rider · Requested 60-day insurance-status review
Date: 2026-10-18. Status: code change proposed; NOT LIVE; legal/compliance approval required before release.

## Change
- The recurring **independent insurer/broker status refresh** period is now **60 days after the last genuine independent confirmation**, rather than 30.
- The existing **five-day grace** remains. At age 60 days the Operator is still approved if all other conditions are met. At age greater than 60 days without a fresh independent reply, a single new Operator attestation is needed to stay eligible until age 65 days. After age 65 days, new Travel is blocked until fresh independent confirmation.
- Invalid/expired coverage, cancellations, nonrenewal, coverage reductions, policy vehicle removal and failed eligibility checks still block **immediately** when known, even on day 1. A printed expiry date does not establish continuing coverage. The first independent verification is still mandatory before commencing service.
- **No new insurance report or screening report is ordered per Travel.** Assignment, duty renewal and acceptance compare already verified evidence and current known status.
- Scheduled insurer/broker contact is not triggered merely because a legacy document still carries the old 30-day due timestamp. New independent confirmations update that due timestamp to 60 days and reset reminder attempt counts for the next cycle. Historic records containing 30-day dates or already-exhausted old request attempts must receive a separately audited, bounded migration before a full 60-day refresh rollout. Do not silently overwrite real adverse reports or insurer evidence.

## Existing automated evidence
`backend/insurance-monitoring.test.js`, `backend/insurance-reminders.test.js`, `backend/insurance-monitoring-pagination.test.js` (620 synthetic Operators), `backend/presence-insurance-contract.test.js`, `backend/synthetic-travel-lifecycle.test.js`, `backend/payments.test.js` and the new `backend/insurance-review-60-days.test.js` exercise the logical cycle, prior data, escalation, and failure paths. Check current PR-head CI. These are deterministic software tests, not direct insurer replies or verification of production traffic.

## Release approvals and limits
Florida Statutes 2026 §627.748 requires TNC insurance protections while drivers are logged on or engaged in a ride. In particular, §627.748(7)(d) says the TNC's insurance must respond on a first-dollar basis if a driver's insurance lapses or lacks required coverage. There is no established statutory 'safe harbor' based on a 60-day periodic document check. This PR **does not establish lawful commercial launch**, and the founder's preference that the platform carry no insurance does not eliminate statutory obligations. Licensed Florida insurance counsel/broker must verify the insurance model, confirmation mechanisms, frequency, grace policy and any response to a coverage lapse BEFORE a production rollout.

The 30-day period for **upcoming printed policy expiration warnings** on the Operator Insurance screen is deliberately unchanged: it is separate from the 60-day status-review interval. The five-minute **Operator presence freshness** cutoff is also unchanged.

## Production sequencing
1. Review and pass exact PR-head tests, including day-60 and day-65 boundaries, cycle reset and previously stored day-30 dates.
2. Obtain signed insurance/legal operating-model review and a controlled migration plan for old `insuranceMonitoring` records, without modifying current provider histories.
3. Commission Google Cloud isolated staging, using the new project ID and active billing, and test authorized carrier/broker status with non-production data.
4. Collect actual provider and signed iPhone/Android evidence, then authorize one coordinated backend/native release. Do not use this policy change as a substitute for production launch evidence.

Official references:
- https://www.flsenate.gov/Laws/Statutes/2026/627.748
- https://firebase.google.com/docs/emulator-suite
- https://docs.stripe.com/testing
