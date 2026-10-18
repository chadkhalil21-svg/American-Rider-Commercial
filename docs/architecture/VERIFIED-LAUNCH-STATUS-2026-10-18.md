# American Rider · Current verified delivery, 18 October 2026

**Canonical authority: [PROJECT-LEDGER.md](../../PROJECT-LEDGER.md), FIRST current-status table.** This file is a dated digest for external release reviews, not the live production API. Current Commercial repository: `chadkhalil21-svg/American-Rider-Commercial`, `release/current`.

## Built, not to be rebuilt
- Nearby Operator matching: center and surrounding geohash cells, then broader nine-cell tier. Each dense cell has a bounded 40-record query expanding to 120; exact distance and insurance/screening/availability filtering follow. The search does **not** grow indefinitely or search all Operators nationwide. Optimisation PR #81 is separate.
- Duty: every 90-second renewal re-evaluates qualification using stored actual insurance/screening records; dispatch and booking re-check eligibility. This is not a new insurer/CRA call every 90 seconds or every Travel.
- Operator Accept / Decline fix PR #51 merged. Scheduled Travel PR #52 and Family/Teen menu PR #73 merged.
- Isolated Cloud Run preparation PR #85 merged, without changing current map/provider or paid traffic.

## Verified live backend
- Render American-Rider-Server, live commit `5102ae7caf8d2d46aaed86150eb9219039e85d02` following verified successful deploy at 2026-10-18 06:21 UTC.
- Owner increased Render WORKSPACE build monthly spending ceiling to $5. The $7 Starter instance is unchanged; Cloud Run is NOT yet commissioned.

## Open, distinct PRs
- #79: incoming Travel offer must show exact Traveler Total and Operator pay. Test on native devices, reconcile quote/charge/payout and tolls.
- #72: cancel action/uncertain refund must be physically and provider-tested. Do not claim refund without provider settlement.
- #63: durable payout, but historical Stripe transfers, ambiguous provider outcomes and sandbox reconciliation remain. Overlaps #67, do not blindly merge both.
- #81: optimise and profile existing nearest-eligible dispatch, preserve safety/eligibility. #82: scheduled query and index-economy improvements needing actual database evidence.
- #84: mixes Cloud Run with uncommissioned autocomplete provider. Do not merge as-is; #85 already delivered Cloud Run staging code.
- #86: offline request/write capacity estimate only, no measured service-level promise.

## Paid launch signoff, in plain terms
Before saying 'ready for paid customer launch', independently verify: (1) active tri-county protected market admission and legal obligations; (2) genuine qualified/screened/insured and payout-enabled Operators; (3) complete live/sandbox provider-authorized paid Travel and refund/payout reconciliation; (4) real iPhone and Android request, accept/decline, cancel, background location and safety; and (5) current code deployed and phone app matched to the correct build. Verify in app and provider records, not just CI. No real customer data in GitHub.

## Source references
- Google Firestore: https://firebase.google.com/docs/firestore/best-practices
- Cloud Run autoscaling: https://cloud.google.com/run/docs/about-instance-autoscaling
- Uber H3: https://h3geo.org/docs/
- Stripe Connect transfers: https://docs.stripe.com/api/transfers
- Florida TNC statute: https://www.flsenate.gov/Laws/Statutes/2026/627.748
