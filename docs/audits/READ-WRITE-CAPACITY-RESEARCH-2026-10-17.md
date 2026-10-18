# Commercial read/write and capacity audit
17 October 2026. Source-led research, not production certification.

## Already staged, do not duplicate
- Draft PR #67 already reduces GPS write cadence, bounds Operator inbox and diagnostic reads, improves nearby-first geohash matching, and hardens payout retries.
- Draft PR #70, replayed from prior #16, bounds the Family age-out scan to due Teen records, paginates reserve cancellations safely, and preserves pending work after failure.
- PR #68 added two composite index declarations. Previous live commissioning run 39054270115 proved the original 17 READY, not the newly added two. Require a new verified 19/19 live READY audit.
- Draft PR #69 distinguishes unsent Plan Ahead Cancel from server-authorized cancellation of a saved booking. The founder's requested screenshots are not yet present in this conversation.

## Ranked new opportunities
1. **Idle duty renewal.** Source uses a 90-second renewal. At 50 Operators for 8 hours, that means 16,000 calls. At the model's 7 reads + 1 write per call: 112,000 reads + 16,000 writes, even with no Travels. Assess authenticated short-lived cache and explicit invalidation only if insurer expiry, screening revocation, account closure and payout restrictions always fail closed. Do not just stop eligibility checks.
2. **Index fanout.** First search all repository and Firestore query paths for opLat, opLng, opAt, stillSince and monitorSeen. If these safety telemetry fields are truly never queried, a tested per-field single-field index exemption may reduce index storage/latency, but NOT the number of billed document writes. Do not commission exemptions without a full source query inventory and tests.
3. **Location and safety read amplification.** Monitor anchor updates share the Travel document with actual GPS. Measure listener reads, repeated writes, stale packet handling and emergency delivery before considering a separate ephemeral location stream.
4. **Uber H3 comparison.** Benchmark H3 against the current safe bounded geohash approach at equal coverage and density in the South Florida service area; include borders, water, empty grids and high churn. Collect p95/p99 dispatch time, false misses, billed query reads and indexing costs. No automatic migration.
5. **Payments.** Retry-safe IDs require durable idempotency beyond 24 hours. A connected Stripe account showing zero Transfers does not certify that all historic Travel payout obligations are settled unless it is the account used by Render.
6. **Load.** Isolated 0/10/50/100/300/500 concurrent Travels, plus separately 0/50/100/500 idle Operators; measure Render CPU and memory, Firestore billable reads/writes/index entries, full quote/payment/dispatch/monitor lifecycle, and actual dollars per completed Travel. Do not treat synthetic traffic as live certification.

## Published engineering guidance
- Google Firestore: https://firebase.google.com/docs/firestore/best-practices
- Google Query Explain: https://firebase.google.com/docs/firestore/query-explain
- Google billing: https://firebase.google.com/docs/firestore/pricing
- Uber H3: https://www.uber.com/us/en/blog/h3/
- Amazon idempotent retry: https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/
- Apple sheets: https://developer.apple.com/design/human-interface-guidelines/sheets

No price, live provider, index exemptions, Render deployment, Stripe action or TestFlight build authorized by this audit.
