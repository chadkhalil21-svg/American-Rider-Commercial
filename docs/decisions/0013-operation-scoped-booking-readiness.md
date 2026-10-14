# ADR 0013 — Booking readiness must match the operation
Date: 2026-10-14
Status: proposed pending release verification

## Decision
A configured open county permits ordinary Travel booking without a second county approval. Production route checks depend only on the services used by the route, not a platform-wide checklist.

- Quotes need the service database and valid deployment mode. Existing routing, restricted-facility, authoritative-fare, and unknown-toll handling still refuse unsafe or unpriceable routes.
- Immediate paid Travel still requires live Stripe, verified payment webhook configuration, and durable Firebase records.
- Scheduled Travel also needs an authenticated scheduler.
- Going on duty still requires a verified Stripe payout connection and individual screening, insurance, documents, disclosures, and account status.
- Ongoing Travel progression must remain available during unrelated provider outages.

Screening intake, the market-reference research store, the administrative Operations login, and a globally configured HERE fallback are not second authorizations to sell Travel in an already served county. Screening and coverage continue to be checked for each Operator; unresolved tolls still fail the route-level price check. No provider evidence is fabricated and no unknown geography is activated.

## Scope
`backend/booking-readiness.js` declares a small dependency set by route. The server retains broad health diagnostics but uses operation-specific readiness for API admission and the Traveler payment configuration.

## Verification
`backend/booking-readiness.test.js` runs its route matrix twice. The existing backend lint, full unit suite and release workflows must pass before promotion. A merged PR is not proof of production deployment or live payment readiness.
