# Verified Operator progress before a $3 Traveler cancellation fee

## Scope and authority (2026-10-19)
- Founder-approved: **2 minutes free after Operator acceptance**; $3 only when real, independently verifiable Operator progress toward pickup or arrival qualifies. Do not charge when Operator is at fault, excessively late or evidence is absent.
- This change is **prepared but DISABLED** by default. Server environment variable `AR_VERIFIED_ENROUTE_CANCEL_FEE` must be explicitly `true` to activate. **Do not activate without qualified counsel review of disclosures, exact signed-device/Stripe sandbox tests, proper localization and refund/account reconciliation.** No change to settled 99% Fare.
- Live source before activation continues automatic Stripe capture at booking, 100% refund before arrived and a $3 arrival-only withholding thereafter. PR #143's manually captured holds are **a separate unmerged proposal**, not enabled by this change. Do not merge overlapping billing rules blindly.

## First principles / no unnecessary read, write or routing call
`backend/eligibility.js` already reads `rides/{travel}`, `operators/{operator}` and `users/{operator}` when accepting an offer and already performs one `tx.update(ride)`. The same update now includes the Operator's then-current, server-observed position and timestamp **only if fresh, physically plausible, and currently reserved for this Travel**. No extra query, remote map route or extra document write.

`backend/travelmoney.js` already reads the same Operator document inside the cancellation transaction to release the reservation. The consent-gated evaluation uses **that same snapshot** and writes a compact reason/progress proof into the existing cancellation transaction; no GPS history collection, telemetry polling, new database lookup, HERE charge or route API.

The proposed `firestore.indexes.json` also exempts four unqueried cancellation fields from individual indexes to reduce write amplification. **These exemptions do not affect the live database until its configuration is separately deployed.**\n\nAt cancellation, strictly require:
1. Server-authenticated acceptance and cancellation at least **120 seconds later**.
2. Current active Travel (not pre-booked queued Travel); valid pickup coordinates and accepted baseline.
3. Recent Operator position at acceptance and cancellation (max 2 minutes), measurements separated by more than 30 seconds, with plausible net speed up to 75 mph.
4. Closing straight-line pickup distance by at least **0.20 mile AND 15%** of original distance. Directional efficiency = closing miles / net displacement at least **0.55**. This geometric ratio is a cheap **proxy** for movement toward pickup, NOT measured road-route efficiency: detours or unreliable GPS are denied automatic fees rather than commissioning paid route calls.
5. An already server-verified arrival may qualify after grace, based on existing GPS-and-radius arrival proof.
6. If Operator fault is server-recorded, or Operator still hasn't arrived and is more than five minutes beyond original stored pickup ETA, waive.
7. If uncertain, late, stale, implausibly fast, sideways/away from pickup, location queue mismatched, missing old baseline or within grace, fee is **$0**. Do not guess.

Pure deterministic synthetic tests exercise movement, jitter, reversed movement, side route, implausible GPS, stale and mismatched Operator, 2-minute timing, arrival grace and late/no-progress exceptions. A transaction-level fake Stripe test checks a single existing Operator read and refund-minus-$3 with idempotency. **No live charge** occurs in tests.

## Design comparisons / counsel caveat
Uber: official guidance says cancellation fees may be waived if no progress or driver excessive lateness, and may depend on distance/time traveled. This proposal adopts the verifiable concept, but does NOT copy unverified proprietary thresholds (the 0.20 mile, 15%, 55% numbers are our conservative **synthetic policy parameters**, not Uber metrics).
- https://help.uber.com/en/riders/article/review-cancellation-fee?nodeId=6bec690f-ee35-40ba-96ee-c38a8ae796e0
- https://help.uber.com/riders/article/canceling-an-uber-trip?nodeId=56270015-1d1d-4c08-a460-3b94a090de23
Firestore: avoid repeatedly writing indexed GPS or querying broad historical tracks just to calculate $3; use the two records that are already transactionally read. At real volume, measure document/index scans and hotspot risk; this logic has no new repeating writes.
- https://firebase.google.com/docs/firestore/best-practices

**Counsel NOT engaged by this research:** legal counsel should review the clear pre-booking/disclosed free cancellation period, $3 triggers, whether GPS/ETA evidence is adequate and dispute/waiver process, refund rights, Florida TNC operations and consumer laws before enabling. This is not a legal opinion.

## Conditions before merge/activation
- GitHub release checks, exact tested source SHA, sandbox/Stripe fixture and device tests pass.
- Reconcile PR #143's proposed boolean-only progress rule with this actual computed proof; prevent two competing fee engines or accidental double charges.
- Test poor GPS, urban canyon, tunnels, clock drift, outdated TestFlight and phone backgrounding.
- Localize Traveler and Operator terms and fee disclosures; have qualified Florida consumer/TNC counsel approve.
- Deploy with the flag **off**, inspect metrics, then independently authorize limited activation and watch reversals/disputes. No blind switch at commercial launch.
