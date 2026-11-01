# 1 November 2026 — Founder cost and capacity audit, Build 60 unchanged

**Management planning only.** No live fare, monthly fee, connected-account payout interval, referral switch, Cloud Run configuration, Firestore security rule, mobile binary, or market admission is changed by this audit.

## Stripe Connect fees: expense versus recovery

The founder's standing policy is that the Operator or independently eligible Recruiter funds every actual Stripe Connect account/payout/funds-routing fee, on top of the separate 1%-of-Travel-Fare platform commission. Stripe may **bill the platform first** and the platform then recovers the **exact verified provider charge** from the correctly consented recipient. Both legs must appear in accounting. A billing source and its intended economic owner are different concepts.

- Existing code: `backend/connect-fee-importer.js`, `backend/connect-monthly-account-fees.js`, `backend/verified-connect-fee-transfer.js` and `backend/connect-fee-offset-plan.js` prove the source has provider-identity, consent, once-only and transaction/fee recovery guards. The recovery path is deliberately gated by `CONNECT_VERIFIED_FEE_RECOVERY=enabled`; synthetic and Stripe TEST success do **not** establish that an actual production fee was collected from an actual qualified recipient.
- Actual connected **live account surfaced in this chat**: Stripe API GET /v1/accounts returned zero Connect accounts, and GET /v1/balance_transactions returned zero rows on 1 November 2026. This does not establish that there are no other Stripe organizations or accounts outside the surfaced connection.
- `backend/economics.js` still budgets 0.5% of the Operator share plus a fixed 6¢ per Travel. It is a **provisional conservative price-sufficiency allowance**, not the expected long-term company-borne Connect fee after verified collection. Do not delete the safety allowance and silently lower accepted Traveler totals while collection is not verifiably commissioned; Build 60 source/Cloud Run compatibility and actual provider recovery must remain intact.
- `backend/fleet-economics-forecast.js` now permits **management-only** `connectFeeRecoveryFraction` (0–1, default zero), independently of existing `collectionFraction` for the $2 monthly active-account fee. Expenses still include the actual expected Stripe charges; `connectTransactionFeeCollectedUsd` is separately reported as prospective reimbursement, and `netCompanyConnectExpenseUsd` captures incomplete collection. Full recovery makes net zero **in that scenario only**. No new production flag is created.

Source: https://stripe.com/connect/pricing

## What services actually exist in this code

| Domain | Already implemented / configured in repository | Cost or capacity boundary |
| --- | --- | --- |
| Mobile commercial API | `src/config.ts` points to existing paid Google Cloud Run `american-rider-api-production` | Cloud Run request-based free allowance 2M requests, 180K vCPU-s and 360K GiB-s per month in eligible region; beyond that pay for consumed CPU/memory/requests/network, plus build/artifact/logging/secrets/scheduler where applicable |
| Founder control and auxiliary server | Authenticated Render `American-Rider-Server`, 1 instance `0.5c-512mb` | $7/month compute list price, not a guaranteed count of users; Render serves more than static website; signed mobile primarily calls Cloud Run |
| Authentication | Firebase Auth; possible Identity Platform upgrade is separate | Base Firebase auth and Identity Platform MAU price models differ; if Identity Platform upgraded, 50K free social/email MAUs then per-MAU fees; SMS authentication separately billed |
| Firestore | Blaze paid project and indexed, bounded geohash dispatch, on-demand counts, operator duty renewal ~90s | Free **allowance**, not cap, of 50K reads/20K writes daily for one Standard free-tier eligible DB; $0.30/million additional reads and $0.90/million writes in us-central1; billable index reads, listener fanout, storage, network, TTL and additional databases can add costs; region and exact invoices still need provider evidence |
| Maps imagery | MapLibre with OpenFreeMap vector tiles/fonts in `src/components/mapStyle.ts` | Hosted tile price $0; commercial permitted, but no SLA; paid Stadia $20/month backup is **not deployed** |
| Address and POI search | `backend/place-search.js` uses own authenticated private Photon endpoint when configured; otherwise HERE Autosuggest; 10/min emergency HERE cap and cache | HERE usage and applicable commercial/search contract **not yet verified** from billing; every search can be a separately metered transaction; do not budget as $0 |
| Driving routes | `backend/streets.js` configured regional private OSRM or OpenTripPlanner, else no route | Actual regional routing instance/capacity and hosting bill not independently proven; earlier $96/mo dedicated 16-GB scenario is NOT verified provisioned |
| Tolls/route fallback | `backend/tolls.js` HERE toll-cost API, 60s identical-quote TTL; further HERE route summary fallback when other router fails | HERE explicitly counts toll request as **additional transaction**; no certified bill/call mix yet |
| Email | Connected Resend currently free (100/day, 3K/month); notification/receipts and support send paths | $20/month Pro includes 50K transactional messages with $0.90/1K overage; 2 emails/Travel is an assumed load, not live measurement |
| Private documents / storage | Cloudflare R2 backed document uploads, local OCR | R2 Standard 10GB storage + 1M A and 10M B requests per month free, then per-unit fees; actual bucket storage, origin access, upload rate unknown |
| Support / notices | Deterministic support plus optional Anthropic model in `backend/support.js`, Expo push, optional SMS | AI tokens, outgoing carrier texts, human safety escalations and delivery costs depend on actual events, not zero |
| Mobile distribution | Expo EAS, Apple TestFlight and Google Play | Recurring EAS plan/build/update MAU charges depend on **selected plan**; Build 60 is retained; app-store and signing/provider fees separate |
| Corporate/legal and compliance | TNC operator-paid insurance and screening eligibility logic | No verified company-level statutory insurance/backstop quote, attorney, accountant, permits or critical response costs; must not silently fold into the 25¢ allowance |

Sources:
- https://firebase.google.com/docs/projects/billing/firebase-pricing-plans
- https://firebase.google.com/docs/firestore/pricing and https://cloud.google.com/firestore/pricing
- https://cloud.google.com/run/pricing
- https://render.com/pricing
- https://openfreemap.org/
- https://stadiamaps.com/pricing
- https://docs.here.com/routing/docs/routing-v8-tolls-for-route and https://www.here.com/get-started/pricing
- https://resend.com/pricing
- https://developers.cloudflare.com/r2/pricing/
- https://expo.dev/pricing
- https://firebase.google.com/docs/auth/

## 25-cent operating allowance: explicit illustrative coverage test

**Do not double count.** The production per-Travel quote already subtracts its own 25¢ operating allowance once. This management coverage check asks whether the **actual vendor/corporate spending** likely fits inside that reserved envelope. It does not subtract the reserve a second time to estimate net margin.

Assumptions from existing `backend/fleet-economics-forecast.js`: 17¢/Travel other operations (SMS/support/observation/egress) + 3.5¢/on-duty Operator-hour of cloud-processing budget + $7/month existing Render compute + a $20/month hypothetical Resend Pro. On-duty Operators: 10 / 15 / 45 for 150 / 600 / 1500 monthly Travels; each operates 20 days and 6 hours/day. This deliberately excludes unmeasured HERE requests, routing infrastructure, commercial map SLA fallback, Cloud Run separately charged capacity *if not already included in the hour budget*, corporate legal/insurance, cash losses beyond contingency, taxes and owner labor.

| Monthly Travels | 25¢ available | 17¢ variable | Operator-hour allowance | Render + paid Resend | Modeled subtotal | Coverage gap |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 150 | $37.50 | $25.50 | $42.00 | $27.00 | $94.50 | -$57.00 |
| 600 | $150.00 | $102.00 | $63.00 | $27.00 | $192.00 | -$42.00 |
| 1,500 | $375.00 | $255.00 | $189.00 | $27.00 | $471.00 | -$96.00 |

**Result:** The current 25¢ allowance is NOT proven adequate at these low-Travel/high-duty-hour utilization assumptions. More completed Travels per on-duty hour improve coverage; a free Resend plan avoids $20 cash spending only until 100/day or 3,000/month limits are reached. Models must not invent flat per-user prices where providers charge by real workload.

## Scale: model operations, not user registrations

Example, **not a capacity certification**: one Operator stays online 8 hours/day on 20 days/month; a 90-second successful renewal cadence implies ~6,400 renewal HTTP requests/month/active Operator before Travel API calls and location-movement accelerations. Thus the 2M/month request free allowance (if fully available) is exceeded by only about 313 such actively renewing Operators even with zero other requests. Exceeding it is billable, not a service shutdown. Google Cloud Run also meters CPU, memory and network, and concurrency or actual load-test certification is essential before promising any active-Operator ceiling.

For **one million registered users**, the invoice depends on whether 0.1%, 1%, or 10% are active simultaneously and on reads/writes, map searches, emails, documents and completed Travels. Registration itself does not imply a fixed Cloud Run/Firebase/Render price. Avoid implying Blaze has a 50K-read hard maximum, or that a single 512 MB Render service can certify one million concurrent requests.

## Next verified source / operational boundary

- Last authenticated read-only GCP audit run 41273797104 found production Cloud Run `american-rider-api-production-00040-lcf` ready and serving 100% traffic with live Stripe bindings and public /live HTTP 200, **but not matching** GitHub release `25ad8eb677a1f78a5a4781edaf023b1499d1a3d7`.
- GitHub and Render deployment DO NOT establish Cloud Run deployment. No protected Cloud Run deployment, provider settings, market opening or production fee collection is performed in this management audit.
- Actual HERE account tier, Cloud Run/Firestore invoice, R2 bucket bytes, EAS subscription and Operator fee-recovery source evidence remain separately measurable external facts; do not assert all verified from a green test.

**Change policy:** Keep Build 60 and its current card-selection and accepted price. No new build. Keep safe dispatch cadence, bounded reads and once-only finance accounting. Any production fee-reserve removal demands actual verified recovery and native/API pricing parity first.
