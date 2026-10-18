# ADR 0034: Measure scale before an H3 or production cloud cutover
Date: 2026-10-18. Status: review-only; NO live Traffic, Firebase schema, Stripe or dispatch changes.

## Decision
Keep the working bounded geohash plus exact eligibility/distance checks for Operator dispatch. Do not switch to Uber H3 merely because it is advanced technology. Add deterministic, offline request and Firestore write projections and require real-world safety, database and payment measurements before asserting capacity.

## Comparison with engineering guidance
- **Google Firestore**: Reduce unused index fanout, avoid sequential indexed timestamp hotspots, ramp writes under its 500/50/5 recommendation, and test measured query costs with Query Explain. Changing location indexing does not erase billed document writes.
- **Google Cloud Run**: HTTP containers autoscale, but direct app-to-Firebase writes, provider limits, payment idempotency and durable scheduled safety work need separate proof.
- **Uber H3**: Hierarchical hexagon cells can help regional clustering and neighborhood search. Compare H3 and current geohash using the same area, same bounded Firestore candidate budget, same Operator qualification gates and dense/coastal neighborhoods. H3 alone does not guarantee fewer reads or the closest qualified Operator.
- **Stripe**: Idempotency keys can be pruned after 24 hours. Durable per-Travel payment/payout records and reconciliation are still necessary.

## Non-duplicate scope
PR #85 already merged the isolated cloud staging code. PR #84 contains a separate unapproved destination-search provider change and an H3 experiment; do not merge as-is. PR #81 proposes bounded matching and diagnostics, #82 index/scheduler improvements, #63 payout guards, #72 cancellation and #79 Operator offer pricing. Retain their independent release requirements. This PR adds only an offline arithmetic model, tests, CI, and guidance.

## Launch acceptance order
1. Restore Render's WORKSPACE build pipeline and confirm the running server is current.
2. Finish and verify Operator incoming requests, price, cancellation/refunds and durable payouts against test Stripe, Firebase, and real phones. No blind merger of payment-affecting draft PRs.
3. Commission separate authenticated Cloud Run staging and external scheduler before changing live payment/webhook routes; use only one authoritative scheduler and payment backend.
4. Benchmark 100, 1k, 10k and 100k active Travels. Record latency p95/p99, real Firebase billed reads/writes, candidate misses from saturated geo cells, provider quotas, errors, safety clock delay and full cost.
5. Decide whether H3 merits replacing geohash only with actual equality of geographic coverage, Operator eligibility and a reversible migration.

Sources: https://docs.cloud.google.com/firestore/native/docs/best-practices ; https://docs.cloud.google.com/firestore/native/docs/query-explain ; https://docs.cloud.google.com/run/docs/configuring/billing-settings ; https://www.uber.com/us/en/blog/h3/ ; https://h3geo.org/docs/ ; https://docs.stripe.com/api/idempotent_requests ; https://sre.google/sre-book/monitoring-distributed-systems/ .
