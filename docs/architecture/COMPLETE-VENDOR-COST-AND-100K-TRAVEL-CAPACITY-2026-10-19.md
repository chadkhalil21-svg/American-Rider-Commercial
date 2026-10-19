# American Rider — verified service inventory, real cost mechanics, and scaling scenarios
Date: 2026-10-19. Supersedes older hypothetical $2,000 operating overhead and older small-scale cloud-only tables. Code reference: backend/service-scale-economics.js (pure offline forecast) and backend/economics.js (fare split).

## Executive verdict
- Price a $20 example Travel as $17.50 Fare and $2.50 Platform Fee. The platform retains about $2.67 gross (1% Fare plus fee); Stripe domestic card processing is $0.88, but actual mix may add international costs. The model also conservatively deducts Connect transfer/payout allowance and an explicitly NONCASH $0.25 risk reserve before gross operating room ~$1.375 per Travel at 95% domestic. This is not audited net profit.
- No invented $2,000 baseline. The known configured paid legacy hosting line remains $7/month until successfully retired. Modern Cloud Run/Firestore use paid meters and free tiers; cost can remain low at small real demand, but can be >0 with NO Travels due to online Operators, background checks, logs, egress, maintenance, contractual minimums.
- Unknown unit prices or volumes are **null / excluded**, not provider-is-free. In particular: HERE Autosuggest/toll billing, real OSRM/OTP service hosting and capacity, commercial screening/insurance compliance, paid operator telephony, signed-device / Expo build fees, promotions, accounting, support, taxes and actual chargebacks.
- From a law-trained Founder perspective: the rightmost modeled remainder is NOT legally/corporately distributable net income. 100k/day requires external operational validation.

## Actually referenced in release/current code, not an imagined technology stack
| System | Exact role and proof | First-principles money trigger | State |
|---|---|---|---|
| Stripe Payments | backend/payments.js; 99% Fare, platform fee, card authorization, capture and Operator transfer | 2.9% + $0.30/domestic card; foreign card +1.5%, other alternatives extra | ACTIVE source/live account, zero live completed Travels on last checked statement |
| Stripe Connect Express | backend/payments.js creates type:'express' connected accounts | depends on actual platform-fee regime: $2 per payout-active account, 0.25%+25c per bank payout + funds routing 0.25%, or Stripe-managed option direct connected billing; 1% Instant optional | regime not verified from a connected live payout; 0 connected accounts in most recent API |
| Google Cloud Run | backend/server.js production API | request-billed CPU, memory and requests above 180k vCPU-s, 360k GiB-s, 2m requests monthly (if free quotas available). Additional network, logs and builds | Paid production service; actual usage invoice not accessed |
| Firebase Auth | login and email-verification / sign-in | ordinary auth independent of custom mail; Blaze address verification up to 100k/day; SMS or Identity Platform are different meters | Used; no unlimited transactional receipt support |
| Firestore Standard | operator, location, active Travel, scheduled bookings, compliance and support | first 50k reads /20k writes per day free, 1GiB stored free, 10 GiB external bandwidth free; subsequent read/write/storage/index/egress billed | Used; physical billed reads per action not measured |
| Google Cloud Scheduler | server-backed periodic dispatch/maintenance | 3 jobs free per billing account then $0.10/job/month; executions do not incur per-run Scheduler fee, but the invoked Cloud Run service bills | 1 planned/activated scheduler from recent commissioning |
| MapLibre Native | src/components/MonoMap.tsx and HomeMap.tsx and RouteMap.tsx | open-source renderer free, no MapLibre subscription | CHOSEN primary mobile cartography |
| OpenFreeMap + OSM | src/components/mapStyle.ts public vector tile + glyph URLs | free tiles publicly, **as is, NO SLA**, potential operational risk if huge viewer footprint | USED; zero vendor invoice assumed, but future fallback hosting not priced |
| Apple Maps (residual code) | src/components/LiveMap.ios.tsx uses expo-maps AppleMaps.View for in-Travel iPhone screen | no separate MapLibre/Google Platform API bill for this source | actual residual code CONTRADICTS final unified MapLibre decision; issue #146 |
| HERE Autosuggest | backend/place-search.js default when private Photon is absent | request count includes *nonbooking searches*, contract-specific tariff UNKNOWN | presently invoked routinely unless other geocoder enabled; founder intends exception only |
| HERE Tolls | backend/tolls.js | provider transaction for unresolved exact tolls | legitimate final fallback, but approved official rates catalogue EMPTY, issue #147 |
| OSRM + OTP | backend/streets.js, backend/transit.js, region env | requires reliable own route host when configured; compute/storage not evidenced | source adapters, actual live provider hosting/billing not confirmed |
| Photon | backend/place-search.js has optional adapter | a commissioned separate VM+disk could cost extra, but Founder has deferred it | no Photon VM assumed in model |
| Resend | backend/email.js personalized itinerary receipts and other notifications | free 100/day AND 3,000/month, $20 Pro/50k without daily cap and 90c/1000 overage | ACTUAL current custom email sender, FREE quota can block |
| Firebase auth / Stripe receipts | Firebase verification/password reset; Stripe receipt_email on card intent | included identity/card-charge services within applicable quotas | already available; DOES NOT replace detailed Travel receipt |
| AWS SES **PROPOSED** | issue #145; future custom mail transport | $0.10/1k **à la carte**; default new Essentials $0.16/1k since July 2026. SES sandbox 200/day until production approval; send rate/quota must be raised | NOT currently connected or deployed. Current simulator uses this as ALTERNATIVE only |
| Cloudflare Email Routing + Gmail | verified test incoming support/insurance @americanrider.app → americanrider.communications@gmail.com | free forwarding to established business Gmail | working for .app; does NOT depend on Resend inbound; .com addresses not proven |
| Cloudflare R2 | backend/r2.js private operator documents | standard 10GiB, 1m A, 10m B free monthly, thereafter $0.015/GiB-month, $4.50/m A, $0.36/m B | code configured, real invoice/retained GB unknown |
| Render | historic API and four static websites | existing paid $7/month API; separate static-site quota/usage | do NOT retire until client links/callbacks verified |
| Twilio Voice | backend/voice.js token/call endpoints | if configured and used, USD local calls e.g $0.014/min outbound and app SDK $0.004/min/leg; number fee extra | conditional readiness; live service use or contract NOT VERIFIED |
| Local document OCR | backend/documents.js Tesseract local | local CPU cycles included in Cloud Run time, no separate image-AI per-document service fee | code present; requires qualified human compliance review |
| Expo EAS builds, Apple Store and Google Play | mobile build/distribution | build usage can cost; Apple Developer $99/year, Google Play $25 one-time | enrollment/build actual invoices unknown |
| GitHub workflows, domain + Cloudflare DNS, social SSO | code, release and account plumbing | public GitHub Actions within published limits; domains billed separately; Gmail mail routing free | actual bills and quotas unverified |

**No general Google Maps API billing can be inferred from MapLibre.** Old docs/MAPS.md incorrectly states Apple/Google should be the permanent main maps platform. Current source is more authoritative.

## Scenario methodology (30 calendar days)
Inputs disclosed in backend/service-scale-economics.js: $20 charged; 95% domestic cards; daily on-duty Operators = 0.5 × daily completed Travels rounded up; eight hours on duty at one acknowledged presence check per 90s; 100 Firestore reads +40 writes and eight CPU-seconds per completed Travel; five more reads, one write and 0.2 synthetic CPU-seconds per presence check; other baseline reads/writes and calls; 1GiB Cloud Run request-based instance; one KiB of outbound API response per server request (not measured); 10KiB stored each Travel retained 90 days; 3MiB of private R2 Operator files per on-duty Operator (retained population is an assumption, not a ledger); 2.12 custom SES emails per completed Travel incl. onboarding/insurance allowance; $2 per on-duty monthly Operator account **NOT recovered**; $7 existing Render API not retired; no paid Photon, no Google Maps API; number of HERE requests **displayed but cost null**; no fees invented for insurance/marketing/voice/route host.

Per Travel contribution AFTER estimated Stripe processing, the model's conservative Connect variable provision and 25c reserve, BEFORE all modeled operation ~= $1.375. 25c speculative operating allowance in the live price engine is restored so it is not deducted twice. The model DOES NOT assume account-fee collection has succeeded.

| Completed Travels/day | Daily on-duty Operators | Personalized emails/month | Domestic payment costs/month (2.9%+30c only) | Named operating-tech subtotal/month WITH SES alternative | Extra unrecovered Connect $2/account/month | Remainder BEFORE unpriced business costs/month |
|---:|---:|---:|---:|---:|---:|---:|
| 5 | 3 | 318 | $130.50 | $7.03 | $6 | $193.22 |
| 10 | 5 | 636 | $261 | $7.06 | $10 | $395.44 |
| 50 | 25 | 3,180 | $1,305 | $7.32 | $50 | $2,005.18 |
| 100 | 50 | 6,360 | $2,610 | $8.03 | $100 | $4,016.97 |
| 1,000 | 500 | 63,600 | $26,100 | $54.50 | $1,000 | $40,195.50 |
| 10,000 | 5,000 | 636,000 | $261,000 | $545.63 | $10,000 | $401,954.37 |
| 50,000 | 25,000 | 3,180,000 | $1,305,000 | $2,729.06 | $50,000 | $2,009,770.94 |
| 100,000 | 50,000 | 6,360,000 | $2,610,000 | $5,458.34 | $100,000 | $4,019,541.66 |

Card-cost column above intentionally **domestic-only** for comparability; underlying remaining-margin calculation uses **95% domestic, 5% international** (+$0.30/foreign card), making its actual blended monthly card-processing assumption a little higher. Gross platform take is 1% Fare plus Platform Fee, not the full $20.

**Important sensitivity:** Every actual extra $1 per completed Travel costs $150/month at 5/day, $3,000/month at 100/day, $1.5 million/month at 50,000/day, and $3 million/month at 100,000/day. Because actual vendor costs (HERE address searches, OSRM/OTP compute, support, insurance, legal, recruiting, customer acquisition, taxes, losses) were *not* priced from actual usage, the "remainder" is NOT company profit.

## Delivery/capacity requirements before publicly promising 50k–100k/day
- 100k Travels/day × ~50k on-duty Operators/day × 8 hours × 3600/90 = **16 million Operator renewals/day** (average ~185 renewals/sec, burst much greater). Add route/quote/app requests; the model's 8× traffic peak approaches 1,667 API requests/sec. Server/Firestore service limits, index hotspots, hot partitions and asynchronous SDK quotas must be measured, not inferred from a low dollar estimate.
- Firestore warns sequentially indexed timestamps can cap a collection at ~500 writes/second. Confirm current index consumption and exemptions before high volume; ramp with documented 500/50/5 practice.
- Google Cloud Run has default max-instances settings, concurrency and regional quotas; test at escalating request rates, measure p95 and p99, cap connection pools, ensure auth, payment and provider throttles, idempotent dispatch/capture/retry. A low monthly estimate does NOT equal proven production throughput.
- Public OpenFreeMap tiles have no availability guarantee; plan fallback before relying on nationwide map UI. Maps rendering degradation must not corrupt paid dispatch.
- SES must have production approval and an increased daily recipient quota; an initial sandbox is only 200/day. Keep resilient custom-mail outbox so booking and payout remain correct during email outages, but undelivered required receipt triggers safe alerts/retries.
- Source geocoder CURRENTLY uses HERE Autosuggest as primary without Photon, not just exceptional toll pricing; its bill can be material if searches and non-bookers greatly exceed Travels. Example: SIX address requests per completed Travel = **18 million/month at 100k/day**; hypothetical $1/1,000 would equal $18,000/month BEFORE toll calls. This rate is NOT a verified HERE contract.
- Govern real revenue/expenses: Stripe settled bank and transfer reconciliation, provider invoices, Cloud Billing exports/metrics, actual insurance costs, legal review, store publication, physical devices. ONE Founder should only receive compact exception alerts and daily reconciliation.

## Primary published references
Stripe: https://stripe.com/pricing ; https://stripe.com/connect/pricing
Google: https://cloud.google.com/run/pricing ; https://firebase.google.com/docs/firestore/pricing ; https://cloud.google.com/scheduler/pricing ; https://firebase.google.com/docs/auth/limits
Cloudflare: https://developers.cloudflare.com/r2/pricing/ ; https://developers.cloudflare.com/email-service/platform/pricing/
MapLibre / maps: https://maplibre.org/ ; https://openfreemap.org/tos/
AWS SES (July 2026 change): https://aws.amazon.com/ses/pricing/ ; https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html
Resend: https://resend.com/pricing ; Twilio https://www.twilio.com/en-us/voice/pricing/us
Reliability: https://docs.cloud.google.com/run/docs/about-load-testing ; https://firebase.google.com/docs/firestore/best-practices

**State:** This file, backend/service-scale-economics.js and its tests are synthetic source-only additions to PR #144; no emails sent, provider subscriptions purchased, live Stripe charge/payout, Cloud Run deploy, DNS change or store submission.
