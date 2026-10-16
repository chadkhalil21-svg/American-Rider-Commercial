# ADR 0020 — Local lost-item return search and realistic Firestore read envelope
Date: 2026-10-15
Status: proposed; exact-head CI and deployment required before calling live

## Problem and decision
The authenticated lost-item return endpoint in `backend/server.js` first checked the requester’s valid lost-item relationship, then fetched every Operator in Firestore to select the original Operator or a replacement. As the fleet grows, this single Traveler action scales with the entire nationwide Operator database, despite unrelated Operators being irrelevant. It conflicts with Google's Firestore bounded-index query guidance and the founder's Ford/Rockefeller principles.

Use one direct indexed document lookup for the original, authorized Operator, keeping the same strict `matchOperator` eligibility/screening/insurance gates. If that Operator cannot take the return, reuse the production `availableOperatorCandidates(db, destination, excludeIds)` geographic search and the unchanged `matchOperator` rules. If the database fails, report an error rather than inventing an Operator or an estimated return price. Preserve the existing lost-item relationship check, original-Operator preference, free original return, alternate-Operator authoritative quote, single Traveler Total, settlement and region safeguards.

## Audit correction: repeated reads in saturated cells
`backend/geooperators.js` queries 2 geohash precision tiers x at most 9 neighboring cells. A saturated cell reads 40 documents and then re-queries at a limit of 120. Both queries can incur billed reads even if the later result overlaps the first. This makes **2,880** returned documents per fully saturated geographic search, excluding added queue-eligibility and other authority reads; `backend/scale.test.js` previously budgeted 2,160 only for second pages.

An immediate booking can perform this geographic search at least twice: before opening payment and again after verified payment for final assignment. Consequently **up to 5,760 billed documents** for these two saturated searches, plus unrelated reads and background work. At the Standard Firestore free 50,000 reads/day and zero idle traffic, that implies **eight complete Travels/day** in that extreme workload, *not* eight Users or an observed capacity; with unsaturated cells, actual reads are considerably lower. A simple 100-read/40-write per-Travel cost assumption implies 500 theoretical Travels/day with zero background usage. Neither model certifies server throughput, index production readiness, Google billing state, or user concurrency. The quota may already be consumed by idle work. Firestore Blaze usage can exceed free allocations and incur variable costs; changing billing is a separate approved owner action.

## Test and evidence boundaries
- Add fail-closed source regression proving lost-item return never calls `db.collection('operators').get()`, resolves the original document by ID, and falls back to bounded geographic retrieval.
- Extend scale test to count both saturated query pages and show a conservative two-search free-tier scenario.
- Reuse full release/finance/auth/booking/insurance/screening tests on PR exact head. Do not mark code as launched without actual merged commit, successful six workflow checks and backend deployment.
- Existing Family age-out full-scan and deferred-booking bug remains separate PR #16 pending *actual production Firestore composite index* commissioning; do not merge it because offline evidence is insufficient.
- No change to founder-approved geographic configuration, Operator-paid qualifying coverage, tariffs, 99% fare share, Smart Travel unavailable state, or paid purchases.

## External engineering grounding
- Google Cloud Firestore: https://firebase.google.com/docs/firestore/best-practices and https://firebase.google.com/docs/firestore/pricing
- AWS Builders' Library, safe retries with idempotent APIs: https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/
- Google SRE load testing and graceful degradation: https://sre.google/sre-book/service-best-practices/
- NASA-STD-8739.8B, independent verification and intended-environment validation: https://standards.nasa.gov/sites/default/files/standards/NASA/B/0/NASA-STD-87398-Revision-B.pdf
