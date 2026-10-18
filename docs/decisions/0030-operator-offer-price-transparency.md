# ADR 0030: Disclose both prices on every Operator Travel offer

**Decision:** 17 October 2026. **Status:** Founder-directed; engineering under review, not deployed.

Every incoming Operator Travel request must show, *before acceptance*, the exact all-in **Traveler Total** and the amount **You Receive**. These are monetary disclosures, not an earnings forecast or competitor comparison. The second amount includes 99% of the Travel Fare and any 100%-reimbursed toll. The UI calls out toll reimbursement when nonzero. No invented pickup time, fare, or revenue is permitted.

**Authority:** The server alone prices a Travel and persists `rides.costCents` (Traveler Total), `rides.travelCostCents` (Travel Fare), and `rides.tollCents` (pass-through). The Operator's already-authorized Firestore assignment listener supplies all three; do not add a quote request, a read, an index or a duplicate price engine. Compute the display's operator amount in integer cents using the server's settlement rule `travelFareCents - floor(travelFareCents * .01) + tollCents`. Do not derive the fare by reversing a client-side Platform Fee formula.

**Failure policy:** No amount is shown as exact if a required field is missing or incoherent. The Operator may decline; the app must disable acceptance until a trustworthy, internally consistent price is available. The server remains the final authority for accepting, settling, and refunding.

**Acceptance criteria:** Test zero/nonzero toll, public pass-through fees, cents rounding, stale/missing/malformed price, five locales, decline/timeout races, acceptance, and app restart restoration. Operator and Traveler numbers must agree with the same server Travel record. Check on physical iOS and Android devices, including Dynamic Type and the 15-second offer window.

**Economics and release:** No extra reads, external services or Firestore composite indexes. New code is review-only until exact-head CI and device acceptance pass. Do not interpret a merged PR as a deployed app.

**Reference:** [Council standard](../COUNCIL-STANDARDS.md), [canonical settlement math](../../backend/economics.js), [Operator offer screen](../../app/operator/index.tsx), [Operator offer utility](../../src/operatorOfferMoney.ts).
