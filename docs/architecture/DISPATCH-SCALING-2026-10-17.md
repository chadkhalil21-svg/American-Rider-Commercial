# Dispatch scale: measured capacity, not subscription-based guesses
**17 October 2026.** Draft amendment to [capacity decision 0004](../decisions/0004-paid-scale-capacity-economics.md) and [issue #64](https://github.com/chadkhalil21-svg/American-Rider-Commercial/issues/64). No production rollout, new service, provider billing change or H3 migration is authorized by this document.

## Correction
The statement that a $25 Render Standard instance supports only 50–150 simultaneous Travels is an **unsupported estimate, withdrawn**. A server instance has CPU, memory, connection and latency constraints, **not a fixed count of Travels**. Registered accounts, Operators on duty, simultaneous active Travels, incoming dispatch requests per second, connected app listeners, and active payment/monitoring events must be modeled separately. The current $7/0.5 CPU/512MB and $25/1 CPU/2GB options require representative load testing before any capacity claim.

Render can manually scale multiple paid web-service instances with load balancing. Pro workspace enables CPU/memory-targeted autoscaling, **but the $25 Pro workspace alone does not enlarge a $7 server**. The server's existing shared Firestore lease protects the main periodic sweep when several Render instances run; this is not evidence of monitor throughput at 10,000 active Travels.

## Source-grounded engineering comparison

| Reference | Documented principle | Our actual source and action |
|---|---|---|
| Google Firestore | Distribute write traffic, avoid hot documents/indexes, ramp a new collection using 500/50/5; measure query and index-entry billing | `backend/geooperators.js` uses bounded geohash prefix queries. Retain indexed search, hard bounds, authorized transactions. New optional query stats count calls and returned rows, **not** provider-billed reads. Use Query Explain and collection-level usage to reconcile. |
| Uber H3 | Hierarchical hexagonal cells make nearby discovery and market analysis tractable | Existing geohash is already integrated. Compare **measured** query count, nearby misses, cell saturation and data migration costs before evaluating an H3 or RTDB presence pilot. H3 would require a dual-index/backfill/rollback design and does not itself eliminate per-phone GPS writes. |
| Google SRE | Measure actual work and p95/p99 response times under overload; degrade noncritical features, not safety | Preserve emergency, insurance, screening, money and recovery checks. Gate routing/providers by actual latency and error metrics. Never hide saturation by reducing safety scans or eligibility checks. |
| Render | Horizontal scaling adds server instances; each instance incurs a separate compute charge | Begin with the existing instance, baseline CPU/memory, request p95/p99, throughput and leased sweeps, then scale based on actual headroom and cost per Travel. |

References: https://firebase.google.com/docs/firestore/best-practices , https://firebase.google.com/docs/firestore/understand-reads-writes-scale , https://www.uber.com/us/en/blog/h3/ , https://render.com/docs/scaling , https://sre.google/sre-book/service-best-practices/ .

## Practical changes in this draft, built on the existing PR #62
1. **Nearest eligible Operator selection:** `backend/matching.js` scans the candidate set once, with O(n) time and O(1) auxiliary memory, instead of filter/map/sort (O(n log n) sort). All existing eligibility filters are retained: live availability, one-Travel queue rule, 5-minute presence, screening, insurance, disclosure, commissioning, document state, requested class, and correct nearest-first tie behavior. Tests compare the result against an independent sort-based oracle with **12,000 synthetic candidates** twice.
2. **No database read storms for queued Operators:** the older `Promise.all(fleet.map(...))` could launch thousands of Firestore Travel lookups concurrently. `forEachBounded(..., 8, ...)` processes **every candidate** with up to eight simultaneous lookups. A 3,000-candidate two-pass regression proves complete coverage and bounds, including rejection handling.
3. **Opt-in no-write geo instrumentation:** set `AR_GEO_QUERY_METRICS=1` temporarily on a controlled staging backend to emit an aggregated sample every 100 calls. Per sample: executed query RPCs, document rows returned, searched tiers, saturated prefixes, unique candidates, and whether a safe nearby-first stop avoided a broader tier. The callback is nonfatal and records no location, name, Operator UID or Trip ID. **It does not count billable index-entry reads, retry billing, whole-ride monitoring or listener fanout.** Disabled by default, so no new logs or Firestore operations in ordinary use.
4. **Existing PR #62:** avoid duplicate saturated query pages, allow proven fine-grid early exit, reduce unchanged GPS publications, stop redundant app polling, and enforce an indexed bounded inbox. Those are still draft features, not production claims, and index/device gates remain open.

## Explicit load evidence gates, per market and in aggregate

| Concurrent active Travels | Questions to measure |
|---:|---|
| 100 | Baseline paid booking, offer, accept and receipt (p50/p95/p99), Operator hours and position cadence |
| 500 | Dense/sparse dispatch queries, saturated cells, provider retries and connection use |
| 1,000 | Server CPU/memory per instance, Firestore per-minute monitor coverage, listener fanout, queue-eligibility reads |
| 5,000 | Multi-instance leasing, re-offer fairness, slow consumer/backpressure, GPS/push latency |
| 10,000+ | Sharded/event-driven **safety-equivalent** monitoring, live-position architecture, budget, queue workers and overload control |

The **current monitor scans every active Travel each minute** (`backend/monitor.js`). At 1,000 sustained concurrent Travels, that source path alone requests approximately **60,000 active document returns/hour** or **1.44 million/day**. At 10,000: **600,000/hour** or **14.4 million/day**. These are idealized query-return counts, not provider billing or achieved processing capacity; this excludes index-entry reads, writes, position updates, listeners, payments and retry amplification.

**Required measurement before any upgrade claim:** Render time-series CPU/memory and p95/p99 latency; Firebase collection-level billed reads, writes and index reads; the opt-in sampled counts above; physically verified iOS/Android location cadence; controlled isolated staging dispatch/push/Stripe **test-mode** campaigns at the loads above; webhook replay and critical recovery under failed provider/instance. Do not run synthetic high-volume tests against live Firestore or live Stripe.

### Scale-out stages (do not execute without evidence)
- **Stage A:** Keep $7 backend while measuring and resolving existing Render build quota separately. Publish this approved code only after all CI/index/phone gates pass.
- **Stage B:** When measured CPU or memory saturates, consider the $25 Standard (1 CPU/2GB), or multiple smaller instances if concurrent HTTP traffic is the bottleneck. Instance price alone does not establish throughput.
- **Stage C:** As traffic becomes bursty, consider Render Pro **workspace** autoscaling plus multiple **charged** runtime instances. Confirm the lease and idempotency across instances.
- **Stage D:** For sustained thousands of active Travels, benchmark event-driven/partitioned due-time safety monitoring and RTDB or other ephemeral GPS channel against the Firestore ledger, plus H3 vs geohash. Preserve lawful market admission, insurance, screening and payment authority in the durable server.

**Council rubric as design lenses, not literal consultation:** Ford: remove duplicated work; Rockefeller: attributable unit cost; Jobs: no extra user-facing complexity; Google SRE: production measurements before capacity commitments. A cash subscription choice alone cannot certify national-scale operations.
