# Smart Travel temporary hold and current infrastructure capacity — October 15, 2026

## Decision
Founder directs **Smart Travel visibly grayed out / Currently unavailable** until real multimodal routing, current schedules, transfers, handset handoffs and pricing are commissioned. Keep all trains, buses, stop data, routing code and tests. Ordinary car Travel remains unchanged. No vendor subscription, plan upgrade or fare change.

**Implementation**: `src/backend/smart.ts` has a false availability flag and makes no network requests for a disabled new plan. `app/reserve.tsx` shows its existing gray Smart Travel card with the translated transit-unavailable message, no price or active navigation, even before route coordinates exist. The direct `/smart` screen cannot revive an old preview plan. `src/state/RideContext.tsx` refuses new Smart first-car starts but preserves second-car recovery for any preexisting genuine Smart journey. Backend `POST /smart-quote` explicitly fails closed (503 for current clients, 404 legacy) without invoking OpenTripPlanner. `POST /smart-revalidate` is preserved for an already-started journey to prevent abandoning someone in transit. Existing normal car booking and server tariff remain unchanged. CI regression checks both app and backend paths twice.

## Confirmed resources
- Authenticated Render backend `American-Rider-Server` is **one** `0.5c-512mb` Starter instance, **$7/month public list price**, no configured automatic fleet of instances. Three public-facing static sites are separate from this server. Source: authenticated Render configuration; [Render official compute plans](https://render.com/docs/compute-plans); [pricing](https://render.com/pricing).
- Live Render recent measured idle-ish usage in the Oct 15–16 observation window was approximately **106–122 MB memory** of 512 MB, with very low processor use and a few dozen recorded requests. This is **not** a stress measurement and cannot yield a proven simultaneous-user count.
- Firebase is founder-reported to remain on Spark; actual project billing plan and daily usage were **not accessible** to this audit. Google [official Firestore pricing](https://firebase.google.com/docs/firestore/pricing) confirms Standard's no-cost quota of **50,000 document reads and 20,000 writes per day**, storage 1 GiB and 10 GiB outbound data per month, reset near midnight Pacific. Other services, including auth reset/SMS, listener re-reads, storage and indexes, have independent constraints. [Firebase Authentication limits](https://firebase.google.com/docs/auth/limits) also show **150 password reset emails/day on Spark**, and **100 account creations/hour/IP**. There is **not** a single hard cap on total registered users from these figures. Cloud Firestore data limits matter as soon as people are *active*.
- Blaze retains Firestore's no-cost allowance and charges when above it. No fixed Firebase Blaze monthly subscription; plan/billing change is a **real account action**, not a code alteration, and no change was attempted. [Official Firebase plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans).
- Prior Chicago research writes and assigned-Travel idle scan (67 stale records potentially causing 96,000 reads/day) were investigated and repaired in prior merged releases. Do not reopen settled defects without new post-fix measurements.

## Honest scenario — daily operations, NOT registered accounts or capacity proof
`backend/spark-capacity-envelope.js` is a **no-network arithmetic illustration**. It assumes 100 Firestore reads + 40 writes per completed Travel (earlier ledger assumption), and one Operator presence renewal every 90 seconds while on an eight-hour shift, with **five document reads and one write per renewal**. Actual backend code checks closure, users, eligibility, fleet and may perform transactions/provider calls; five reads is illustrative and may understate or overstate billable usage.

| 8-hour Operator shifts/day | Baseline Firestore reads from renewal | Baseline writes | Remaining hypothetical Travels/day at 100 reads + 40 writes each |
|---:|---:|---:|---:|
| 0 | 0 | 0 | 500 |
| 10 | 16,000 | 3,200 | 340 |
| 25 | 40,000 | 8,000 | 100 |
| 30 | 48,000 | 9,600 | 20 |
| 35 | 56,000 | 11,200 | 0 — baseline alone exceeds read quota |

**These are not measured throughput numbers, predictions, user registrations or safe commercial passenger allocations.** Add own idle database usage, dispatch queries, active ride monitor, mobile listeners, receipts, insurance checks, security events, retry storms and payments; real headroom falls. If actual renewals are less frequent, headroom improves; if client/device updates or eligibility checks are more expensive, it worsens. `scale.test.js` runs a million arithmetic fare computations but does **not** execute a million API requests, real Firestore transactions, simultaneous devices or Stripe flows. Thus **there is no defensible verified “supports N users today” answer** from these records. Enforce site load and real cloud quota checks before setting maximum active Travelers/Operators.

## Action before commercial scaling
1. Keep Smart Travel unavailable; test ordinary car quotation and booking unaffected, direct Smart deep links and older app versions blocked, and started Smart second-leg recovery preserved.
2. Use Firebase authenticated usage dashboard after a daily reset to measure **idle billed reads/writes**, Operator-hour and completed-Travel counts, listener/index charges, email resets and project tier. Render checks alone cannot read Firebase usage.
3. Instrument bounded counter snapshots (not per-event write storms), run controlled isolated emulator and safe low-volume authenticated API load tests with real route patterns; record p95/p99 response times, memory/CPU, limit saturation and provider throttling. Stop before affecting real users or live funds.
4. Prepare Blaze for paid demand, with spend alerts and fail-closed critical services, after actual owner-approved billing connection. Prepare higher Render/multi-instance capacity **only at measured usage thresholds** and independently verify cross-instance leases.
5. Preserve existing source-backed fare/Operator/compliance policies and deployment verification. Synthetic CI is valuable but not operational certification.

## Reference standards
Google Firestore [best practices](https://firebase.google.com/docs/firestore/best-practices), [pricing](https://firebase.google.com/docs/firestore/pricing) and [realtime listener billing](https://firebase.google.com/docs/firestore/standard-edition); Amazon [idempotent retries](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-apis/); NASA [software validation](https://swehb.nasa.gov/spaces/SWEHBVD/pages/102695440/SWE-055%2B-%2BRequirements%2BValidation); Render [scaling](https://render.com/docs/scaling). The Council provides a research rubric, not literal third-party consultation.
