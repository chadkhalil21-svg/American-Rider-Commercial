# ADR 0044 — The public company website is backend-served, not the Expo static site

Date: 23 October 2026
Status: Correction prepared, pending exact-head tests and Google Cloud Run deployment

## Problem
The Founder pointed to https://americanrider.app/ and questioned the claim that the website is current. The previous claim cited Render `american-rider-platform` and `american-rider-preview-ng4p` on SHA `7400fd848c49734a69bc37986fd9f073272fadfa`. Those services export the Expo **application web client** from `app/`. They do not establish what visitors actually see on the brand domain.

The separate **public corporate site** is rendered by `backend/site.js`, `backend/shell.js`, and `backend/legal.js` and mounted from `backend/server.js` at `/`, `/operate`, `/travel`, `/safety`, `/support`, `/about`, `/terms`, and `/privacy`. Its root page still said only "Miami", quoted old static fare examples, and used an old test-program notice; its About page incorrectly said Traveler card transactions were settled by bank transfer.

## Decision
- Treat these backend route files as public-company-site source. The current signed mobile app points to Google Cloud Run for its API, while Render also independently deploys a backend copy. Neither a Render **static site** deployment nor a GitHub merge certifies the brand domain.
- Update public homepage and Operator and About copy to the established 99% Operator Fare, minimum $2.50 Platform Fee, Miami-Dade/Broward/Palm Beach initial geography, card payments through Stripe and separate Operator connected-account payout. Avoid promises of released apps, live supply or nationwide bookings.
- Protect existing Privacy/Terms wording, support, safety and deep links: site updates are not legal or backend economic rule changes. Do not display paid recruiter links, payment features, QR codes or projected earnings while referrals remain off.
- Add a source regression test proving every public page is wired in `backend/server.js` and preventing the stale financial statements from reappearing.
- Independently verify the live domain DNS/custom-domain routing, HTTP content/fingerprint and Cloud Run routed revision before claiming https://americanrider.app/ was updated. Cloud Run synchronization must follow its existing guarded workflow; do not use Render service deployment as a proxy or change production traffic blindly.
- Current edits are source-only on a review branch. Published Apple web design and Google operational guidance are references, not counsel advice or endorsements.

## Follow-up gates
1. Exact-head automated checks and merge.
2. Existing guarded Cloud Run deployment at the exact merged SHA, with payments/booking secrets and Scheduler preserved, candidate probes and rollback.
3. Public-domain HTTPS GET for `/`, `/operate`, `/about`, `/terms`, `/privacy`; inspect response headers, content and redirects on both apex and www, from independent network.
4. Verify live signed-app API and original Traveler Invite a Traveler are unaffected. A valid public website does not prove booking, recruiting, bank ACH or app-store readiness.
