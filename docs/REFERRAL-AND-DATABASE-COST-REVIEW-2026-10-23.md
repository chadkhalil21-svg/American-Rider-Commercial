# American Rider · Referral and Database Cost Review · 23 October 2026

**Founder standard:** One Founder, one phone, least human intervention, 99% Operator Fare unchanged. This is a *read-only architecture review and an opt-in cost scenario*, **not an authorization** to change quoted prices, operate new jurisdictions, enable referrals or pay recruits. No outside counsel or named Council member was contacted personally; external standards below are published guidance.

## Decision, in ordinary English

1. **Ordinary Traveler**: The current **Invite a Traveler** page remains unchanged. Share an ordinary invitation, **no credits, no cash**, and no recruiter status.
2. **Qualified Operator**: Once separately approved for compensated recruiting, use an already verified account and the existing native Share action. Award only for eligible completed paid Travels; batch cash earnings after funds are settled and disputes considered.
3. **Independent recruiter**: Invite only by Founder approval, with documented terms, verified identity and an approved payment method. **No general public recruiter sign-up**, separate mobile app or automatic recruiter approval.
4. **One recipient, one role, one inviter**: A first eligible invitation is attached to the server-owned inviter; repeats and direct self-referrals must not generate another credit. 15 cents per qualifying settled Travel for no more than 200 Travels / $30 per invited person is **a proposal**, currently OFF. When an eligible paid recruiter introduced both Operator and Traveler, reserve *up to* 30 cents in total. Do not credit unpaid Travelers.
5. **Money, not clicks:** Do not issue payables for shares, QR scans, app installs or signups. The existing referral accrual is a *held-only prototype*, not wired to Stripe or actual quote funding.

## What is actually coded

- `backend/referral-service.js`: authenticated opaque links, immutable once-per-invited-role attribution, no per-share write after link creation.
- `backend/referral-policy.js` and `backend/referral-accrual.js`: fail-closed eligibility, one event per Travel and invited role, capped at 200/$30 and budgeted per Travel, reward flag OFF, **no Stripe payout**.
- `backend/economics.js`: the base 99% Fare and 75-cent *modeled contribution* minimum. This PR adds an **opt-in, zero-by-default `referralReserveCents` scenario input (0–30)** to test if the quoted platform fee could fund one/both referral awards. It **does not** change existing calls, server quotes, live Stripe, authorization or Traveler Total.

**Reproducible synthetic example:** On $17.50 Fare + $2.50 Platform Fee, the pre-referral modeled contribution is 114 cents (U.S.-issued card) or 84 cents (non-U.S.). With a 30-cent model reserve, the respective contributions become 84 and **54 cents**. The latter is below the existing 75-cent safety minimum. Never promise fixed payouts when the approved economics cannot fund them, and never quietly change the Traveler Total without a new visible quote and consent. These are modeled transactions, not measured business profit.

## Real opportunities to save reads and writes

| Area | Current evidence | Disciplined next step |
|---|---|---|
| Operator on-duty presence | Native updates are throttled to about **90 seconds** while stationary; moving updates only when due. The server currently rereads one user plus one fleet record on each renewal to enforce safety. | Keep liveness and gates intact. First measure the real number of duty renewals and billed reads. Test whether authenticated, event-invalidated *short-term* safety attestations would preserve immediate insurance/screening/Stripe revocations **before** replacing any critical read. No safety caching deployed by this PR. |
| Dispatch discovery | `backend/geooperators.js` uses neighboring bounded **geohash** queries plus exact matching, not a global fleet scan. Saturated buckets use Firestore cursor pagination, not rereading the first page. | Instrument query count and billed index/doc reads (Query Explain in a safe test environment); compare with H3 only if actual dense-market evidence shows a gain. **Do not migrate solely because Uber uses H3**. |
| Live Operator inbox | `src/backend/operatorInbox.ts` already scopes a long-lived listener to that Operator's active assigned Travels. | Preserve listener reuse and safe reconnect. A listener is not billed merely for being open; avoid unnecessary remounts and wide historical queries. |
| Scheduling and compliance | The scheduler queries only near-due reservations, and `backend/sweepcadence.js` staggers administrative work from minutes to 24 hours. | Keep bounded query windows and slow nonurgent reviews; never delay payment, safety or legal expiration gates to save reads. |
| Paid recruitment | Referral setup uses one server-owned link per inviter and immutable claims. There is no database write per link click; no payouts or earnings polling today. | When launched, record one immutable financial event per qualified Travel, publish a *read-on-open* earnings statement or event-driven update, batch settlements, and perform no QR-scan writes. No continuously refreshed recruiter dashboard or new collection poll loop. |
| Geographic/price references | Cache and daily market-reference cadence already exist; no need to query thousands of routes frequently. | Verify cache hit rate and stale-data rules before changing frequency; check live price accuracy separately. |

**Important cost envelope:** At **100** on-duty Operators each working **8 hours** with one 90-second presence renewal, the simple upper-frequency model suggests ~32,000 presence writes and ~64,000 safety-related user+fleet reads per day, before dispatch and other operations. This is **not verified usage**: motion updates, delays, failures, open duty hours and implementation choices change the total. It identifies a measurement priority. Google publishes a daily 50,000-read / 20,000-write free quota on the eligible Firestore database; pricing depends on database location, indexes, billable usage and other services.

## Gates before any paid referral

- Approved recruiter allowlist / status and consent, enforceable **server-side** even if a person shares a link.
- Real Apple/Google published app link + signed domain association + installation/reopen testing. No fake deferred iOS attribution; Operator QR is optional and is **the same URL**, not a second system.
- Complete verified issuer/card-specific budget in authoritative quotes and settlement, preserving the 99% Fare and a defined minimum margin.
- Stripe-approved cash payout recipient, small-earnings batching, idempotent transfer, payment/refund/dispute reconcilers and no double payments.
- Clear paid endorsement disclosures next to the actual paid Share/QR and destination, commercial and tax terms, teen eligibility, privacy retention, and a genuine qualified counsel review. **Do not assert that external counsel reviewed the terms.**
- Signed-device and sandbox trials prior to staged monetary activation; no rollout from this document.

## Published guidance (not a personal adviser consultation)

- [Apple HIG design principles](https://developer.apple.com/design/human-interface-guidelines/design-principles) and [sharing](https://developer.apple.com/design/human-interface-guidelines/collaboration-and-sharing): concise, familiar native actions.
- [Android App Links](https://developer.android.com/training/app-links/about) and [Apple associated domains](https://developer.apple.com/documentation/xcode/supporting-associated-domains): verified deep links, not unverified store URLs.
- [Google Firestore billing](https://firebase.google.com/docs/firestore/pricing), [best practices](https://firebase.google.com/docs/firestore/best-practices), [realtime listeners](https://firebase.google.com/docs/firestore/real-time_queries_at_scale): bound result sets; use cursors, appropriate indexing and healthy long-lived listeners; index entries may also cost reads.
- [Uber H3](https://h3geo.org/docs/): optional spatial index, not a substitute for exact-distance and eligibility validation.
- [Google SRE eliminating toil](https://sre.google/sre-book/eliminating-toil/): automate routine labor, preserve clear failure modes.
- [Stripe idempotency](https://docs.stripe.com/api/idempotent_requests) and [Connect payouts](https://docs.stripe.com/connect/cross-border-payouts-to-recipients): safe retries and recipient eligibility; product availability and fee schedule still must be proven.
- [FTC Endorsement Guides](https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking): paid recommendations generally require clear, conspicuous disclosure of material relationships.

**Reality labels:** Merged source ≠ production Cloud Run ≠ signed app ≠ real payouts. Treat each as its own gate. All paid referral features remain OFF.
