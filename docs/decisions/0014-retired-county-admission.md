# ADR 0014 — Retire county admission administration
Date: 2026-10-14
Status: implementation candidate pending CI

## Decision
County service availability is determined by the configured service geography. The extra
county-wide approval system is no longer used to authorize individual bookings or duty.

Delete the retired county-admission evaluator, Firestore admission-record writer, Founder
admission-intent sweep, separate county evidence submission script, legacy Operations
approval screen, and admission-driven fleet shutdown process. Keep the Operations page
as a read-only list of configured service counties.

Do not delete or rewrite historical evidence already stored. It remains a record, not an
authorization signal. Financial reconciliation, fraud protections, restricted pickup
locations, provider-signed status changes, individual Operator documentation, insurance,
screening, account closure, and payout readiness remain independently enforced.

The independent pricing research catalog, jurisdiction registry, toll policies, geography
registry, and individual qualification workflows are not part of this cleanup.

## Tests
Keep a regression test that fails if any production booking, Founder connection, or
Operator duty path starts reading the old admission register. Verify the active South
Florida counties, unserved pickup refusal, individual insurance/screening failure,
concurrent account closures, and signed Stripe payout downgrades.

Run the entire release campaign (including twice-run exhaustive tests) before merging.
This change does not establish that production is deployed or that real-world external
obligations have been fulfilled.
