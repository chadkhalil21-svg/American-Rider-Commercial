# American Rider Commercial: whole-service invariant audit
**17 October 2026 • Draft only • Not released**

## Objective and source of truth
Review American Rider as a complete service, not an isolated screen. Read the current `AGENTS.md`, `PROJECT-LEDGER.md`, `docs/COUNCIL-STANDARDS.md`, `docs/APPROVED-UI-BASELINES.md`, `docs/CODEX-ROUTE-STATE-INVENTORY.md`, and actual code. Follow historical Council criteria as a rubric, not as an invented interview or endorsement.

**Institution-first external checks:** [Google Firestore cursor pagination](https://firebase.google.com/docs/firestore/query-data/query-cursors); [Stripe saved payment method detachment](https://docs.stripe.com/api/payment_methods/detach); [Stripe Customer default configuration](https://docs.stripe.com/api/customers/update); [Nielsen Norman Group error guidance](https://www.nngroup.com/articles/error-message-guidelines/). Validate outcomes by unit/emulator tests and real devices before production; do not treat source or mock tests as external commissioning.

## Inventory and actual coverage
- Listed `app/` (35 entries), `app/operator/` (23 source files), `src/state/` (11 files), `src/backend/` (35), and `src/components/` (17), plus top-level `backend/` (372 entries, including tests), `infra/`, `scripts/`, and release workflows.
- Source-scanned Traveler/account screens, core Travel/safety screens, Operator onboarding/operations screens, shared state, and 35 client backend modules for inert taps, uncontrolled timers, Firestore direct writes/large queries, misleading empty states, and placeholder claims. These are heuristic hits, **not** findings until checked by reading surrounding code.
- Examined actual `app/wallet.tsx`, `backend/payments.js`, `backend/server.js`, `firestore.rules`, `src/backend/lostitem.ts`, `app/lost.tsx`, `app/account-mobile.tsx`, and current test/emulator entry.
- Inspected earlier route inventory and approved UI baselines; do not replace a past approved design with arbitrary larger controls.
- **Remaining before claiming an exhaustive repository audit:** inspect each remaining backend server module and test in detail; audit every rendered journey on real iOS/Android, permission/restart/error states, navigation graph and links, translation semantics, provider wiring, Render/Stripe/Firebase runtime readiness. This first-pass finding set does not certify that all such work is complete.

## Verified defects and draft corrective changes

### 1. Wallet default card lacked a removal path
**Evidence:** `app/wallet.tsx` rendered `Default` in place of **both** card actions, despite `backend/payments.js` implementing an authenticated detach endpoint. Owners could remove other cards but were trapped with their default saved card. The modal's inner no-op pressable intentionally prevents accidental dismissal through the scrim; it is **not** an inert customer action.

**Draft fix:** Always show **Remove** with explicit confirmation, including on a default card; preserve the existing typography, cards and button sizing. If the removed method was Stripe's default, the server selects another already-saved card or clears the default pointer before detaching, and attempts compensation if detachment fails. Do not hide that the change may affect scheduled Travel. All five languages explain the consequences; none claims a refund or authorizes a new charge.

**Safety requirement:** Verify the exact Stripe mode, Customer ownership, update/detach ordering, failures, and scheduled booking payment selection in a sandbox. Because Stripe detachment is irreversible for that payment-method object, never perform this on a real Customer while auditing.

### 2. A newly created lost-item record could forge recovery
**Evidence:** `firestore.rules` allowed a client to create `lost_items` with almost any initial `status` and `return`; only subsequent updates were restricted. A modified client could attempt to file a report falsely marked `returned` or `operator-notified`. The original app creates only `reported` but client behavior is not an access-control boundary.

**Draft fix:** Firestore create rule now limits new reports to exact `reported` state and null `return` and `photoUrl`; caps description/arrays and checks data types. Operator and backend recovery alone may author later evidence. Adversarial emulator tests cover legitimate filing, fabricated status, forged return, oversized text, extra attributes, and another account.

**Remaining:** Server lost-item dispatch must still independently validate the linked Travel, real Operator assignment, and notification delivery; a client-supplied Operator name list is not proof of delivery.

### 3. Lost-item history read every record and hid failures
**Evidence:** `fetchMyLostItems()` queried all reports for a UID, sorted them on the phone, and returned `[]` on any Firestore error. It could make an offline account appear to have no reports, while continuing to increase read cost as reports accumulated.

**Draft fix:** Introduce `fetchMyLostItemsPage` with an authenticated UID query, newest-first `createdAt`, cursor pagination and bounded reads (20 visible by default). The compatibility lookup returns just one page; it no longer disguises a failed read as a valid empty history.

**Commissioning dependency:** Added a `lost_items(travelerUid ASC, createdAt DESC)` composite index declaration. **It is not known to be commissioned/READY in production**; do not deploy query changes or imply production readiness without verified index evidence.

**Caller integration (verified):** Patron Support previously called `fetchMyLostItems().then(...)` with no failure handler. Simply making the backend function throw would create a new unhandled rejection. Updated `app/issues.tsx` itself to show the last known reports if refresh fails, give an explicit Retry, and fetch additional history only when the Traveler selects **Show more**. Pages deduplicate report IDs, and new failure/next-page text is translated into all five languages. The two-pass regression asserts this caller behavior, not just the helper.

### 4. Account Mobile silently treated a failed read as an empty number
**Evidence:** `app/account-mobile.tsx` fetched the `users/{uid}` record and swallowed any error. A network failure showed an empty field, inviting overwriting of an unknown existing contact number.

**Draft fix:** Explicit loading/unavailable/readable states, on-demand Retry and no editing or saving until the authoritative record was loaded. Guard late asynchronous results after navigation; no new continuous polling. Keep standard primary-button dimensions and explain failures in all five languages.

**Separate investigation, not a proven defect:** The number is described as **contact information only**, not a verified sign-in or recovery credential. Trace safety/SMS/notification consumers before imposing or claiming phone verification.

## Related existing draft fixes, not duplicated here
- Commercial PR #52: Scheduled Travel final review, vehicle/person selection, multi-reservation list, cancellation consent, Firestore deletion boundary, and an independently required scheduled-rides composite index.
- Commercial PR #53: Email change, pending verification and one consistent account entry point.
- Those PRs are separate branches; work based on `release/current` must be reconciled with their actual merges to avoid losing changes.

## Follow-up watchlist (investigation required, not declared defects)
- Account Mobile writes user-supplied contact number without visible ownership proof. The approved copy says this is contact information only, **not** sign-in or recovery. Determine whether any downstream SMS, safety, Operator, or notification feature treats it as a verified phone before changing its policy.
- Check Operator screening/review polling, emergency incident location updating, and active Operator presence for bounded cadence, unmount cleanup, and error recovery. Timers are not inherently defects.
- Scheduled reservation direct delete is open in PR #52, not fixed on `release/current`; do not mark production secure until that PR, emulator proof, and real rules deployment are verified.
- Validate Wallet default-card removal against future scheduled reservations, and against another account whose payment method should never be detached.

## Council review and acceptance
Ford: reuse one existing Wallet and loss-recovery process; no shadow database. Rockefeller: limit Firestore reads and Stripe retries, avoid new providers. Jobs/Apple: every action works and keeps familiar dimensions. Harvard/Stanford/MIT: verify outcomes with real users/providers, not just a source signature. Hospitality: actionable failures and clear consequences. NASA/safety: demonstrate actual intended-environment behavior and deny false authorizations.

**Release boundary:** This branch and PR remain DRAFT. No real payments, user accounts, emergency reports, messages, bookings, rules, indexes, or TestFlight artifacts were changed as a result of this audit. Automated checks must be tied to the exact final SHA; real Firebase emulator, Stripe sandbox, native handset and production-index readiness remain separately evidenced gates.
