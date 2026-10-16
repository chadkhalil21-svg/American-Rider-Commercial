# ADR 0019 — Pause new Smart Travel before commercial launch
Date: 2026-10-15
Status: founder-directed release candidate; live only after exact-SHA CI and deployment evidence

## Decision
American Rider has **not commercially launched**; there are **no live paying Travelers**. Do not describe prelaunch test or recovery code as proof of commercial journeys. The founder explicitly directs that Smart Travel remain visibly grey and marked **currently unavailable** while standard Travel launch/readiness, real transit feeds and the planner are independently commissioned.

- Keep the Smart Travel option in the booking UI but grey, disabled, labeled from existing `traveler.transitUnavailable` language. No new planning request from current clients while unavailable.
- Fail closed on the **server** with HTTP 503 and `smart_travel_paused` on a v2 Smart Travel quote. Older clients receive safe 404 without incorrectly parsing a response.
- Block first Smart car-leg acceptance at the existing RideContext action boundary, including direct navigation/stale plans, without changing normal Travel.
- Preserve existing second-leg *recovery code* for defensive completeness, not because actual customers are using it. Do not delete the Smart implementation or pay for OTP.
- This pause should remain in force even if an optional OTP service later answers. Reenable only through a separately tested, Founder-approved commissioning decision with agency data freshness, phone transfer verification and cost consent.

## Capacity audit: what can and cannot be claimed now
Read-only Render service evidence: one $7 Starter 0.5 CPU / 512 MB Node backend, one instance, no automatic instance scaling configured. Light-traffic memory measured at approximately 100-120MB. Live build deployment is not load certification. Official current Render specs: https://render.com/pricing

User reports Firebase is on Spark, but read-only Render/GitHub views cannot verify Google billing state or production read/write counts. Standard Firestore free allowance: **50,000 document reads and 20,000 writes per day**, reset daily (official: https://firebase.google.com/docs/firestore/quotas). Google's Firestore auto-scaling does not remove Spark **quota ceilings**, one-server bottlenecks or hot-document limits: https://firebase.google.com/docs/firestore/understand-reads-writes-scale

Existing `backend/paid-scale-economics.test.js` models **100 reads and 40 writes per Travel** only as an illustrative assumption. Even if all other usage were zero, this implies at most **500 Travels/day** from either free quota (min(50K/100, 20K/40)), and does **not** establish 500 user accounts, 500 simultaneous Travelers, 500 Operators, throughput or production capacity. Idle sweeps, chats, dispatch, GPS, push, retransmissions, presence, payouts and security checks all consume operations. The historical prelaunch no-user quota exhaustion is proof that baseline can dominate. The million-case test is an arithmetic/synthetic test, not an observed million-customer stress test. **No credible registered-account or concurrent-journey limit can yet be certified.**

The appropriate next evidence is: authenticated Firebase consumption over a clean 24h period (billed reads/writes, latency, top queries, idle writes, peak baseline), 0/10/100/1000 concurrent HTTP request tests against an isolated identical test instance, realistic dispatch/GPS/Firestore emulator workload twice with p95/p99 timings and failure alarms, and staged rollout with cost caps and real-device checks. Do not load-test production with live Stripe. Blaze is pay-as-you-go with no required flat subscription; existing free allowance remains, but upgrading is not made here (https://firebase.google.com/docs/projects/billing/firebase-pricing-plans).

Commercial launch is **not yet verified**: no actual qualified connected Operator, physical-device full journeys and provider receipts, and real-world insurance and payment release evidence are not established by CI or Render build. No duplicate county-wide administrative admission gate is to be restored. Preserve individual screening, insurance and payment safeguards.

## Research guardrails
Google Firestore: measure and minimize billed reads, reduce idle load, avoid hotspots. AWS Builders' Library: one safe retry authority and idempotency. NASA software verification and validation: test the actual intended operating conditions, not merely arithmetic simulations. Keep default Traveler Total exactly from server; keep founder-ratified tariffs. No new subscription, provider or pricing change in this ADR.
