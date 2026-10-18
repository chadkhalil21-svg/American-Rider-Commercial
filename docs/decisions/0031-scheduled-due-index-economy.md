# ADR 0031 · Due-only scheduled Travel reads and lean telemetry indexes
**17 October 2026. Status: review-only candidate; not deployed.**

## Findings from active `release/current`
- The scheduled worker ran once per minute and fetched as many as 100 reserved appointments sorted by time, then dropped future appointments in JavaScript. When 100 far-future records were stored and none were imminent, this could mean 100 document returns per minute rather than the empty indexed query's minimum one billed read. Up to approximately 144,000 returned documents per day versus 1,440 minimum empty-query reads in that **illustrative** no-due case. Actual billing, attempts, indexes and client listeners must be measured; this is **not a promise** of daily savings.
- An appointment inside the 25-minute dispatch window could receive the same `lastSweepResult` every minute even though neither its status nor readiness changed. Such writes also send fresh documents to live listeners, which Google bills as reads where applicable. The result/diagnostic note is not an authority for payment, eligibility or dispatch.
- The existing `scheduled_rides(status ASC, atMs ASC)` composite index is already declared. Adding another copy does not save reads; use the existing index correctly instead.
- `rides.opLat`, `opLng`, `opAt`, `stillSince`, and `monitorSeen` change frequently during onboard Travel. No current application query was found using these as search or sort criteria. Retaining their values is critical for safety, but **automatic single-field indexes on these attributes are not required for document-ID reads or existing status queries**.

## Narrow changes
1. Server-side `where('atMs','<=',now+WINDOW_MS)` on reserved appointments, continuing to `orderBy('atMs','asc')` and `limit(100)`. Eligible and overdue reservations are still considered each minute; this neither weakens last-minute safety nor changes when Stripe charges.
2. All appointments are **still re-evaluated on every tick**. Write the same waiting explanation only on change, missing checkpoint or every five minutes. Report a changed market-admission reason immediately. Dispatched, failed, cancelled or otherwise advanced statuses and all payment/insurance/screening verification are untouched.
3. Stage five `rides` single-field index exemptions with `indexes:[]`. Do **not** drop composites, the existing `pricing_quote_views.expiresAt` TTL, `rides.status`, Operator geohash, or actual Travel lifecycle fields.
4. Twice-run synthetic query/test case proves the due-time boundary, backlog bound, unchanged-reason throttling, changed-reason immediate write, index presence, and a source-query policy test scans JS/TS app/backend for newly indexed uses. CI is necessary but not sufficient.

## Engineering comparison
- **Google Firestore:** A composite index helps the database filter only due items *before* returning them. Query Explain distinguishes documents returned, index entries scanned and billable reads. Index exemptions reduce index write *fanout* and storage, **not the number of billed document writes**, and must not be used for a field involved in a filter or sort. See [Firestore best practices](https://firebase.google.com/docs/firestore/best-practices), [Query Explain](https://firebase.google.com/docs/firestore/query-explain), [Firestore billing](https://firebase.google.com/docs/firestore/pricing), [index field overrides](https://firebase.google.com/docs/reference/firestore/indexes).
- **Uber H3:** H3 groups geography for matching and marketplace analytics. It would **not** optimize a time-indexed reservation queue or automatically reduce Firestore GPS document writes. Keep geohash unless a matching load test shows that H3 provides better completeness and measured cost. [Uber H3 engineering](https://www.uber.com/us/en/blog/h3/).
- **SRE / Council lenses:** Henry Ford: avoid repeated work. Rockefeller: measure actual costs before buying servers or indexes. Jobs: no new user-visible complication. These are analytical references, **not** communications with living advisors or institutional endorsements.

## Release and compatibility gates
- Confirm the existing composite index is READY in the **actual** Firebase project `american-rider-35688`. Current GitHub index-checking action only audits/adds **composite** indexes; it **does not install single-field exemptions**. Deploy the five exemptions only through an authenticated, project-pinned Firebase index-definition deployment with a backup and verification; do not equate a GitHub manifest change to a live index update.
- Execute release CI twice and physical-device schedule tests for no reservations, future-only, one due, exactly at window boundary, 100+ due, an expired reservation, a cancelled reservation, missed/failed Stripe, Family revocation and interrupted network. If queries require an index not ready, surface an error and hold dispatch rather than silently reporting no bookings.
- Query Explain/analyze in controlled staging, actual 24h billing and listener behavior. No automatic increase in paid Render or Firebase plans, no migrations, and no live Stripe activity.
- Do not pursue extra composite indexes without a query that needs one and live evidence that existing index scanning is excessive. Additional unneeded indexes increase maintenance cost.

## Further priorities, separate decisions
- **Operator idle renewals:** measure existing 90-second account/coverage reads before introducing an invalidation cache; never defer screening or insurance lockout.
- **Safety monitor:** every active Travel is read on each minute sweep; rearchitecture toward partitioned due-time work requires safety-equivalent detection, queue leases, retry/restart and real-device proof.
- **Location fanout:** benchmark Firestore vs short-lived Firebase RTDB or another location channel, leaving fare, booking, screening, insurance and payout authority in Firestore.
- **H3 trial:** comparative benchmark of H3 vs existing geohash with identical radius/eligibility, denser markets, coastal edges and missed pickups; migration only if measured gains offset index and data-backfill costs.
