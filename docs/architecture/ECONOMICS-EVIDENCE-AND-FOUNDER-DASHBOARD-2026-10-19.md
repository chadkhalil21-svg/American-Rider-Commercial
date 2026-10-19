# American Rider | Economics evidence and founder dashboard | 2026-10-19

**Decision, not a profit certificate.** Unit calculations in `backend/economics.js` are code facts. Real card mix, completion volume, Google invoices, payouts, insurance, legal costs, losses and personnel expenses are **not observed here**. This forecast is **synthetic**. No customer money or provider credentials are used. The default $2,000 company monthly overhead and $0.10 variable third-party costs per Travel are **illustrations**, not actual quoted costs. $300 introductory Google credit is temporary, not operating revenue.

## What the Founder should read first

1. **$20 example Travel:** $17.50 Fare + $2.50 Platform Fee. The Operator receives $17.33 of Fare (99%, rounded by existing source). Domestic-card modeled contribution = **$1.14** and international-card = **$0.84**, **after** a 25¢ speculative operating-overhead allowance and 25¢ contingency reserve. The 25¢ overhead line is a placeholder, not proof of actual spending.
2. **Transparent cash scenario:** `commercial-economics.js` restores the placeholder 25¢ once, preserves the 25¢ risk reserve, then deducts **all explicitly assumed actual overhead once**, including cloud/doc charges, provider fees and monthly fixed costs. At 95% domestic card mix that gives about **$1.375** room before actual overhead per $20 Travel. This is NOT gross profit, operating profit or a price guarantee.
3. **Break-even is volume-dependent:** Using assumptions of $2,000/month fixed overhead and $0.10 of non-cloud incremental service cost per Travel, the baseline ~50 completed Travels/day is **below** illustrative monthly break-even; ~100/day is above it. Higher costs, taxes, chargebacks or an unquoted TNC insurance obligation can reverse that finding immediately. **Do not advertise profitability.**
4. **Cloud costs:** Render's small baseline web instance is $7/month (0.5 CPU, 512 MB). Google Cloud Run is request-billed with up to 180,000 vCPU-seconds, 360,000 GiB-seconds and 2 million requests monthly under applicable free allowance. Firestore Standard's daily free quota is 50,000 reads/20,000 writes; after quota, illustrative us-central rates are $0.03/100k reads and $0.09/100k writes. Actual production region, billing account, logging, network egress, build, provider and database SKU may differ. Free tiers may already be consumed by **other projects on the billing account**.
5. **GPS scaling:** Each on-duty Operator renewing once per 90s for 8 h generates about 320 daily presence writes; 500 active Operators imply ~160,000 daily writes before a single Travel. That is not a large Firestore bill at unit rates but signals quota exhaustion and database pressure. Preserve the 5-minute stale duty cutoff and 15s safety-critical Travel telemetry; measure cold-start/locked-phone reliability before increasing intervals.
6. **One Founder, one phone:** A daily report should show *completed paid Travels*, *actual Stripe gross and fees*, *verified Operator transfers and unresolved exceptions*, *current Cloud Run/Firestore billed spend* and *risk/legal budget*. Anything unverified should say “unknown,” **never $0**. Make exceptions actionable; routine eligible bookings and payouts automated. A synthetic forecast does not confirm real cash.

## Synthetic model definitions

Run `node backend/commercial-economics.test.js` and review `backend/commercial-economics.js`. Inputs: daily completed Travels; number and duration of daily on-duty Operators; realistic document reads and writes per Travel; on-duty heartbeat period; free-tier eligibility; instance billed seconds (request concurrency matters); card mix; extra variable third-party fees; assumed fixed business expenses. Outputs: estimated monthly contribution after documented transaction fees, expected presence/read/write counts, estimated Firestore/Cloud Run *only* and illustrative remainder/break-even. In particular, there is no actual billed-Google credit lookup from GitHub alone.

**Audit vocabulary:** `proved in source` = arithmetic and syntax on pinned commit; `synthetic` = scenarios and mocked user events; `live verified` = specific Google/Stripe/Render result with a matching account/date; `unverified` = Apple/Android signed physical release, completion/payout flow, provider quotes and bank reconciliation. Never silently promote an estimate into verified profit.

## Engineering decisions and further write/read savings

- **Retain bounded geohash matching** now. Merged PR #138 avoids refetching crowded prefix pages, saving 40 document reads per completely full prefix. Uber's H3 is an attractive hierarchical hexagonal index, **not** an instant Firestore pricing reduction. A change would require index migration, spatial boundary tests, live eligibility rechecks and benchmark parity. Defer until measured candidate misses or billing justify it.
- **Use Firestore Query Explain** for geo, pending payout, diagnostic and due-reservation queries. Avoid offset pagination, unnecessary full collections and expensive index entry scans. Do not delete compound indexes used by operations.
- **Possible next optimization:** bound the Operator's lifetime inbox listener server-side *only after* confirming index availability and no older pending offers are lost. Smaller payloads, listener cleanup and stationary-Operator write suppression can help. Avoid sacrificing real-time acceptance, dispatch safety or regulatory evidence for marginal savings.
- **One clock**: Render sweeps off; Google signed scheduler enabled via successful GitHub workflow run 39268828128. Confirm actual post-activation jobs and Cloud Run revision parity; source branch publication does not redeploy existing Cloud Run revision.
- **Unresolved release evidence:** real Apple/Android release, cold-start notification response and locked-phone duty behavior, real payment/refund/payout, and independent TNC insurance legal analysis. These are not established by the green source tests.

## Presentation style

Use three clearly distinguished figures: **per Travel margin**, **monthly scenario range**, and **actual Google/Stripe bills once available**, with visible assumptions and a bright line between simulated and observed. Plain-English summary and a short next-action list first, optional detail below. Never label a scenario “profit” absent actual fixed costs and verified realized paid Travels.

## Source links

- Google: https://cloud.google.com/run/pricing ; https://firebase.google.com/docs/firestore/pricing ; https://firebase.google.com/docs/firestore/best-practices
- Render: https://render.com/pricing
- Uber H3: https://github.com/uber/h3
- Florida TNC coverage: https://www.flsenate.gov/Laws/Statutes/2026/627.748
- Expo push lifecycle: https://docs.expo.dev/versions/latest/sdk/notifications/
- Original source amounts: `backend/economics.js`, `backend/paid-scale-economics.test.js`; *all quoted estimates subject to current provider terms.*

**Florida law caveat:** Florida §627.748(7) addresses TNC-maintained coverage if driver insurance fails. Individual driver commercial policies alone do **not automatically discharge** any entity-level statutory obligation. This is issue spotting based on primary statute, not an attorney opinion or a new automatic platform shutdown flag. Request formal interpretation from Florida transportation/insurance counsel before representing any structure as legally compliant.
