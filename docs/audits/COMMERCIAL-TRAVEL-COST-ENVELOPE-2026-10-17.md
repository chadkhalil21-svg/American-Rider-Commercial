# Commercial Travel operating-cost envelope — 17 October 2026

**Status: analysis and automated regression tests in DRAFT PR #62. No production deployment, measured throughput, invoice inspection, provider permission changes, or fee change.**

## What is a read or a write?
A read is one database document retrieved or a chargeable live update delivered to a listening phone. A write is one changed database document. Firestore can also charge query minimums, index entries, storage and bandwidth. The counts below are **source-based estimates**, not measured bills.

## A concrete one-hour simultaneous-Travel scenario
Assume 1 Operator/Travel, 90-second Operator duty renewals (7 reads + 1 write each), moving GPS publication every 30 seconds (120 writes/Travel-hour), 2 live listening screens (240 reads), 2 candidate searches averaging 36 document reads each, and 1 safety-monitor read per minute. A monitoring checkpoint MAY additionally update the Travel every minute, resulting in up to 60 more writes and 120 additional reads for those two listening screens.

| Concurrent 60-minute Travels | Illustrative lower reads/writes | With 60 safety checkpoints: reads/writes | Firestore Standard us-central1 high case* | Double-rate sensitivity* |
| ---: | ---: | ---: | ---: | ---: |
| 100 | 65,200 / 16,000 | 77,200 / 22,000 | $0.04296 | $0.08592 |
| 300 | 195,600 / 48,000 | 231,600 / 66,000 | $0.12888 | $0.25776 |
| 500 | 326,000 / 80,000 | 386,000 / 110,000 | $0.21480 | $0.42960 |

*Google's Firestore Standard us-central1 published October 2026 price: $0.03 per 100,000 reads, $0.09 per 100,000 writes. Second column doubles both prices as a sensitivity exercise. Region and billing edition of the REAL database are unverified. No free tier subtracted. These dollar totals cover **only** listed database operations, not the whole operating cost.

The 36 reads/search assumption is illustrative. **Dense, saturated two-tier searches may return 2,160 documents each; two searches may return up to 4,320**, before index charges, minimum query costs and other operations. With this worst-case assumption, the 100-Travel high model becomes **502,000 reads, 22,000 writes = $0.17040** at listed us-central1 prices, not $0.04296. Nearby-first matching in PR #62 can eliminate the broad tier only when the server proves no closer eligible Operator was omitted.

**Important:** 500 concurrent *ongoing* one-hour Travels is not 500 new bookings per second. The count does not establish whether Render handles the required bursts of new requests.

## Does the current Platform Fee fund this?
The deployed `backend/economics.js` model currently provides a **minimum $2.50 Platform Fee**, plus the 1% of Fare kept by the platform, with Stripe processing, Stripe Connect, 25-cent Travel contingency reserve, a distinct **25-cent operating-overhead allowance**, and a minimum 75-cent modeled contribution after those allowances. Those are existing assumptions, not validated final invoices.

For illustration, a domestic-card $20 Traveler Total ($17.50 Fare + $2.50 Platform Fee; no toll or tax) gives a **$1.14 modeled contribution**, AFTER its $0.25 operating-overhead allowance and $0.25 reserve. The contribution is not necessarily actual net profit: uninsured corporate risks, legal obligations, live mapping bills, support, taxes and other costs may remain unpriced.

Using 100 one-hour Travels, the modeled high-end database cost is **$0.0004296 per Travel**, or **0.04296 cents**. Allocating an example $25/month Render service across 1,000 completed Travels adds **2.5 cents/Travel**. Adding hypothetical 10 cents/Travel for other infrastructure produces an illustrative **12.54296 cents/Travel** compared with the existing **25-cent operating allowance**. Neither $25 nor 10 cents is a verified American Rider bill, and the 25 cents also has to absorb any other real operating overhead. At 100 Travels/month, that same $25/month host alone costs 25 cents/Travel.

**Decision:** Do NOT increase the fee based on modeled Firebase counts. Gather actual paid-provider and legal expenses; increase the fee only if the ALL-IN verified cost model fails its required contribution.

## Practical savings roadmap (not all deployed)
1. **Already in draft PR #62:** remove duplicate Operator candidate pages; search nearest cells before wide search with strict fallback; halve moving-GPS writes; cap active inbox and diagnostic reads; stop redundant mobile sweep polling. Verify iOS/Android, index READY and accurate safety updates before merge.
2. **Duty-renewal investigations:** seven document reads every 90 seconds accumulate even with zero Travels. Investigate a short-lived validated qualification summary with immediate invalidation on insurance, screening, payment-account or document changes. Never postpone an insurance expiry or trust stale credentials merely to save reads. First measure actual renewal call graph and revocation latency.
3. **Live-location experiment:** compare Firestore vs Firebase Realtime Database (or another short-lived presence store) for live moving coordinates only. Keep financial and safety authority in Firestore. Benchmark connected clients, actual network bandwidth, reconnection and phone battery costs; no blind migration.
4. **Broadcast savings:** do not rewrite the full Travel record solely to move a map marker once an audited separate live-position channel exists. This can avoid waking payment/status subscribers. Preserve urgent safety escalation and accurate real-time Traveler tracking.
5. **Paged history and indexes:** separate current Operator inbox from historical Travel records; use bounded cursor pages instead of unbounded scans, no skipped record in finance reconciliation. Run Firestore Query Explain on every hot query; remove unused indexed fields only with verified query coverage.
6. **Retry discipline:** replace repeated queries with event-driven work where safely possible, bound background queue attempts and use idempotent payments. Preserve emergency checks, retry authorization, and manual review of uncertain transfers.
7. **H3 evaluation:** Uber H3 is a candidate for future large fleets, not an automatic savings switch. Compare existing 3×3 geohash vs H3 at equal density using actual Miami/Broward/Palm Beach distributions, query charges, cross-cell moves, missing-Operator rates, migration cost and p95 latency. Avoid introducing a new indexing system until measured benefits exceed its complexity.

## Measure to decide, before release
- Inspect REAL Firebase project ID, Standard/Enterprise edition, region, Blaze plan and actual billed document/index reads, writes, bandwidth, and storage. Add billing budget alerts.
- Use Firestore Query Explain in sparse/dense test markets and save evidence for 0/20/50/500 available Operators.
- Repeat actual 10/50/100/300/500 simultaneous **Travel** load tests and booking bursts on the real Render plan with isolated test payments, proper permission and zero production financial side effects. Report P50/P95/P99 time, CPU/memory, failure rate, total billed read/write quantities, chargebacks, and total per-Travel expense. Stress 10,000/100,000/1,000,000 *daily Travels* separately as an extrapolation until genuinely measured.
- Confirm safety check-ins, Operator renewal, insurance expiry, queued assignments and real-time tracking on physical iOS AND Android. Verify Stripe reconciliation PR #63 independently.
- Publish a 30-day cost ledger dividing actual Render, Firebase, Stripe, maps/routing, notifications, support, insurance, legal, and other provider invoices by real completed Travels and on-duty Operator-hours. Compare to the source-owned `economics.js` tariff before any fee decision.

Sources: [Google Firestore pricing](https://cloud.google.com/firestore/pricing), [Firestore Standard](https://firebase.google.com/docs/firestore/standard-edition), [Google geohash design](https://firebase.google.com/docs/firestore/solutions/geoqueries), [Query Explain](https://firebase.google.com/docs/firestore/query-explain), [Uber H3](https://www.uber.com/us/en/blog/h3/), [Google SRE overload](https://sre.google/sre-book/handling-overload/), [Render pricing](https://render.com/pricing).

Test: `node backend/full-cost-envelope.test.js`. Models are isolated and cannot alter prices, transfers, dispatch or billing.