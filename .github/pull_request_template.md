## What changed
Explain the proven defect or requirement, the smallest fix, and exact affected modules.

## Evidence
- [ ] Exact baseline and final head SHA verified
- [ ] Relevant test reproduces the defect and passes on final code
- [ ] `npm run check` and required exact-head CI/release suites pass (state exceptions and reasons)
- [ ] Real provider/device/payment/legal/market evidence is distinguished from mock or CI evidence
- [ ] Deployment, if merged, will be verified independently on exact SHA; no premature "live" claim

## Continuity and founder policy
- [ ] Read [PROJECT-LEDGER.md](../PROJECT-LEDGER.md) and linked decision records first
- [ ] For a major decision/change or verified external setup, updated BOTH the newest `PROJECT-LEDGER.md` entry AND its CURRENT STATUS TABLE with date/evidence, completed versus pending, and exact source/merged/staged/live/device status; do not merely append stale history\n- [ ] Updated ledger if behavior, founder policy, jurisdiction, cost assumptions, production commissioning or release posture changed; otherwise explained why no ledger update was needed
- [ ] Created a superseding ADR if a previously accepted architectural decision changed; did not silently rewrite old decisions
- [ ] No bypass of named Operations authority, insurer/CRA authenticity, market admission, money reconciliation or operator qualification
- [ ] No secrets, reports, personal insurance documents or sensitive Operator/Traveler information in PR, issue or Git

## Remaining blockers
Name external evidence, real test or human authorization that cannot be completed in code. Do not mark it complete merely because this PR passes.
