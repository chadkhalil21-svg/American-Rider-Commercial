# American Rider: Google, Uber H3 and launch scale comparison
Prepared 2026-10-18. Research and reproducible planning, not proof of production capacity.

## Current architecture
- Traveler quote/prepare and payment happen on the server. Incoming Operator Travel requests use a short response window. Decline fix PR #51 merged; displaying Traveler Total and Operator compensation PR #79 is still unmerged.
- The server currently searches **geohash** neighbor prefixes at two precisions, each initially limited to 40 Operators and possibly extended to 120. Busy cells can hide later records. The eligibility and distance checks remain server-authoritative.
- Phones write active Travel positions directly to Firebase. Operator presence renews through the HTTP API. Cloud Run scaling HTTP does not scale upstream provider quotas nor cancel Firebase per-document charges.
- PR #85 staged a Cloud Run-friendly external safety/dispatch scheduler, but production remains at Render commit e3f0ba4 because later builds are blocked by exhausted workspace pipeline minutes.

## Reference => recommended action
| Guidance | Engineering action |
| --- | --- |
| Google Firestore | Measure candidate documents, indexes and write hotspots; review index exemption proposal PR #82 separately |
| Cloud Run | Simulate HTTP bursts and monitor p95/p99; stage one scheduler with durable lease |
| Uber H3 | Offline parity benchmark with the SAME bounded candidate/page count and nearest eligible Operator rules; do not yet alter production |
| Stripe | Verify unknown payments and payouts without duplicate transfers; complete draft PR #63 evidence |
| Google SRE | Record latency, traffic, errors, saturation and safety tick delay |

## Work estimate for 100,000 simultaneous Travels
Explicit assumptions: 1.5 on-duty Operators per active Travel; 90-second Operator renewal; 15-second active Travel position writing DIRECTLY to Firebase; 60-minute mean active Travel; one modeled hour at peak.
- 150,000 on-duty Operators.
- 1,667 HTTP Operator renewals/sec and 6,000,000 in one modeled hour.
- 6,667 Firestore position writes/sec and 24,000,000 in that hour.
- ~27.8 replacement/new Travels/sec for a steady-state 60-minute average duration.
These are selected lower-bound operations, **not** total requests, guaranteed capacity, Firestore measured writes, or a monthly cloud invoice. Do not assume the peak persists 24 hours/day.

## Practical sequence
1. Render: Open workspace Build Pipeline settings at https://dashboard.render.com/w/tea-dapfjs740ujc739hnic0/settings#build-pipeline and adjust the spend limit. Last backend build failed before code compilation. Do not change server keys.
2. GitHub: Cloud Run-only PR #85 is merged. PR #84 is not. PR #72 (Travel cancel), #79 (price in Operator request), #63 (duplicate payout) remain launch-review items, some with separate live-device/provider gates.
3. Commission isolated Google/Firebase staging, secret identity, Stripe sandbox and one authenticated Cloud Scheduler, then verify all booking, refund, settlement, Operator, Family and safety journeys.
4. Progressive real load tests 100/1k/10k/100k active Travels with backend, Firebase, external quotas and cost measurements; no premature capacity promises.

The comparison reflects public engineering documentation, not a personal consultation with the named advisers.
Sources: https://docs.cloud.google.com/firestore/native/docs/understand-reads-writes-scale ; https://docs.cloud.google.com/firestore/native/docs/best-practices ; https://docs.cloud.google.com/firestore/native/docs/query-explain ; https://cloud.google.com/run/docs/about-instance-autoscaling ; https://www.uber.com/us/en/blog/h3/ ; https://h3geo.org/docs/ ; https://sre.google/sre-book/monitoring-distributed-systems/ ; https://docs.stripe.com/api/idempotent_requests .
