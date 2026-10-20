# American Rider | Firestore read/write savings and geospatial comparison
**Evidence date:** 20 October 2026. **Source:** `release/current` 4dfdfc531; **scope:** measured-first efficiency without weakening paid Travel, Operator eligibility, safety or payouts.

## Already implemented, not proposals
- PR #138: bounded 9-cell geohash candidate retrieval, with cursor pagination for crowded cells.
- PR #159: two fewer Firestore document reads for each authenticated Operator duty renewal; suppress repeated unchanged denied-duty status writes. Includes synthetic safety tests.
- One Google Scheduler / leader lease, durable optional-maintenance cadence; do not create another timer.
- Due-only scheduled Travel and `needsPayout` queries, a bounded money-recovery cursor; do not abandon legacy unpaid Transfers to save reads.
- The scheduled-reservation `touchWaiting` method already avoids writing unchanged status repeatedly.

## This PR: prevent repeat stranded-assignment writes
`backend/monitor.js` checks every `assigned` Travel each minute until accepted, re-offered or expired. When a matching Operator is not found, it previously **updated `unanswered:true, unansweredAt:now` on every tick**, even though the durable marker already existed. This PR preserves every candidate/eligibility check, report and existing 60-minute stale refund/expiry handling; it only skips the redundant write if a prior valid `unansweredAt` exists. Missing legacy timestamp is repaired once.

Deterministic 60-tick example per stuck Travel: **60 prior marker writes versus 1 now, saving up to 59 Firestore document writes**. Two synthetic repetitions verify the gate, re-offer, expiry and paid refund obligations. This is a *potential per-case write saving*, not a measurement of current fleet workload. If a new offer resets `unanswered:false`, it can be stamped anew.

No existing Stripe hold, Connect fee, rider payment, matched Operator choice, H3, map engine, Firestore indexes, scheduler cadence, travel price or native UI changes.

## Google Firestore cost and index guidance
- A query is billed at least one read even when it returns no documents. Listener updates/reconnects can produce more reads. Query Explain `analyze` reports actual index entries scanned, execution and billing; use selectively because analysis itself executes reads.
- Composite index and automatic per-field fanout increase write latency and index storage. Verify unused descending, array, oversized-map and sequential timestamp indexes before issuing exemptions. Never exempt indexed `status`, `geohash`, `needsPayout`, `claimedAt`, `refundPending` or historical paging fields without testing all dependent queries and live index readiness.
- Firestore `offset()` charges for skipped documents; use cursors and bounded limits. The existing payout ledger MUST remain lossless and complete, so do not cap an account's lifetime balances to the first 100 records.

## Uber H3 versus existing geohash
H3 uses hierarchical hexagonal cells useful for regional aggregation and statistics. It **does not inherently replace Firestore search billing**, eliminate boundary checks or provide exact physical proximity. H3 hierarchy has only approximate geometric parent/child containment. American Rider's geohash retrieval already uses nearby cell ranges and exact distance/qualification filtering. Swapping requires dual index writes, backfill and new indexes.

Before any change, run 10k/50k/100k synthetic point distributions (urban sparse/dense, cell boundaries, antimeridian, high latitude), preserving EXACT eligible nearest Operator recall. Compare: document reads including duplicates, index entry scans, number of queries, p95 latency, extra writes/index storage, cold start, and billing in Query Explain on a separate safe dataset. Adopt H3 only if it wins with no recall/safety loss.

## Further candidates, sorted by practical priority
1. **Financial payout recovery:** #55/#56 require lossless historical backfill, indexed server-owned owed-funds records and Stripe transfer reconciliation. An indexed outbox can eventually avoid lifetime-history scans, but cannot skip missing legacy payments.
2. **Active Travel map listeners:** count subscriptions per screen and on app resume. Share a single authenticated Travel subscription per active Travel; avoid repeated identical subscriptions. Any reduced live GPS frequency requires independent iPhone/Android device and Operator safety tests.
3. **Monthly Operator Connect fees:** the six-hour sweep reads all payout-active account records, including `paid`. Eventually queue only pending due records with indexed bounded pagination and a proven legacy migration. A simple `where('feeStatus','!=','paid')` misses documents without feeStatus and risks skipped charges, so **not implemented here**.
4. **Minute scheduler empty-query minimums:** scheduled, assignment, booking-recovery and payout jobs each have guaranteed minimum query costs even at zero demand. Consider event-triggered durable next-due work only after proving full crash recovery, final 1-minute SLA, no stranded payouts/refunds and exactly one scheduler authority. Do not blindly throttle safety.
5. **Real-time monitoring:** currently reads all active accepted/arrived/onboard Travels per minute. Do not stop checking for emergency, stale GPS or unresponsive Travelers to save money. Quantify event counts before considering an indexed next-action queue with full legacy backfill.
6. **Firestore index exemptions:** inventory unused TTL, maps, descending/array fields against live Query Explain and Rules tests before changing indexes.
7. **Cloud Run scale and caching:** per-instance in-memory data cannot authorize geographic, screening or money decisions. Cache immutable market descriptions only; control maximum instance count and concurrency from measured p95 work, not hypothetical throughput.

## Legal/counsel review needed before commercial reliance
This is **not an attorney consultation or legal opinion**. Florida's official 2026 §627.748(7)(a)-(d) allows qualifying coverage maintained by the TNC driver or TNC, but (7)(d) explicitly requires TNC-maintained coverage to respond from the first dollar, with defense, **if driver coverage lapses or is inadequate**. An automatic lockout may reduce operational exposure, but does not establish that a zero-platform-insurance model satisfies the statute. The Founder-approved commercial insurance approach needs advice from a licensed Florida TNC insurance attorney. Preserve driver onboarding and all qualification gates; do not claim statutory clearance.

Separately obtain consumer/payments counsel review before turning on proposed 2-minute/$3 cancellation compensation, future payment holds, Connect fee pass-through and off-session authorizations. No lawyer has been contacted or retained by this PR.

## Primary sources
- Google Firestore best practices: https://firebase.google.com/docs/firestore/best-practices
- Pricing/read and listener rules: https://firebase.google.com/docs/firestore/pricing
- Firestore Query Explain: https://firebase.google.com/docs/firestore/query-explain
- Uber H3 background: https://www.uber.com/us/en/blog/h3/
- H3 developer guide: https://h3geo.org/docs/
- Official 2026 Florida TNC statute: https://www.leg.state.fl.us/Statutes/index.cfm?App_mode=Display_Statute&URL=0600-0699%2F0627%2FSections%2F0627.748.html

**Release gate:** complete exact-head CI; review whether tests are source/synthetic vs real usage. Merge this read/write-only PR without production or money mutations; cloud deployment and native builds are separate controlled steps.
