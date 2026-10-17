## Further audit: Operator payout recovery must scale without abandoning a debt

**Confirmed source behavior:** `POST /operator/settle-pending` currently runs
`db.collection('rides').where('operatorId','==',uid).get()` and inspects every
historical ride on each recovery request. Each completed ride with
`!transferId && paymentIntentId` is then considered for payment. This does
**not** scale at a reasonable Firestore read cost as one Operator's trip
history grows. `src/backend/connect.ts` also returns zero settled/cents
when the server is offline or refuses the request; this is not evidence
that there are no unresolved payouts. The caller currently ignores that
result.

**Do NOT 'fix' by selecting only the newest 20/100 completed trips or by
adding a date cutoff.** An older completed Travel for which the Operator
is genuinely owed a fare must remain recoverable. A bounded, complete
replacement requires an authoritative outstanding-payment index or
durable queue, with a historical migration/backfill, server-authenticated
ownership, retry-safe Stripe transfer identity, atomic settlement-status
records, and tests for old/missing `payoutPending` fields, concurrent
retries, Stripe partial success and Firestore commit failure. For any
finance-related data store, the migration must be checked before enabling
a new query: relying solely on `payoutPending == true` loses historical
rides that lack this field.

**Existing safety worth retaining:** `backend/payments.js`
`transferToOperator` uses the stable `ar_transfer_${rideId || pi.id}`
Stripe idempotency key, source Charge, and checks that the PaymentIntent
belongs to the actual Traveler and Travel. Neither idempotency nor the
current unbounded query establishes that *every* old debt was recovered.
The correct behavior must be verified with Stripe test mode and indexed
Firestore records, not invented live settlements.

**Status: high-priority OPEN, not corrected or certified.** Do not change
live Stripe, paid records, payouts or query cutoffs until a safe
lossless migration and isolated sandbox reconciliation is evidenced.
Sources: [Firestore cursor pagination](https://firebase.google.com/docs/firestore/query-data/query-cursors)
and [AWS idempotent API retry semantics](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/).

## Additional Operator duty review: exact UTC cutoff and conclusion evidence

**Direct defect corrected:** The Operator dashboard's remaining-coverage calculation used `T23:59:59.999Z`, agreeing with the backend, but `setOnline(true)` used `T23:59:59` without a timezone. That interprets the certificate date in the phone's local timezone (hours later in Miami), causing its local eligibility decision to disagree with the server. The direct duty gate now uses `T23:59:59.999Z` exactly, and a source regression checks all three locations (duty, dashboard and backend). The server remains authoritative and still rejects insufficient/expired coverage.

**Additional consequential correction on the same draft:** `src/backend/connect.ts goOffline()` previously swallowed both HTTP errors and transport errors while `OperatorContext.setOnline(false)` immediately showed the ordinary Ready screen. The server could continue to consider the Operator available until the presence record became stale. This is now a **two-part state**: the phone stops local activity immediately but **does not claim a server-confirmed conclusion** until `POST /operator/offline` returns an authenticated `ok:true`. The app writes a UID-scoped `ar:operator-offline-pending:` marker, retries an unconfirmed conclusion on next foreground/resume or through a plainly labeled button, blocks a new commencement while a prior withdrawal is pending, and removes the marker only after the server acknowledges the off-duty write. Offline and server-error cases display an explicit warning that the Operator could still receive Travel. Existing 44-unit button size and Operator screen style remain unchanged. This adds no continuous polling and does not weaken any server-side dispatch/qualification checks.

**External acceptance remains open:** Test the return-to-network/phone-restart/offline request race using real separate Traveler and Operator accounts, prove an offer cannot be accepted after server-acknowledged conclusion, confirm that the marker is restored with the right account, and measure the backend stale-presence exposure when the server cannot be reached at all. No mobile UI can instantly withdraw a server record across an unavailable network; the accurate pending warning and eventual retry are the safe behaviors.

**Operating guidance:** Google's [real-time data and listener rules](https://firebase.google.com/docs/firestore/real-time_queries_at_scale) favors bounded, authoritative events over inferred UI success; Apple's [feedback guidance](https://developer.apple.com/design/human-interface-guidelines/feedback) requires accurate and actionable status. Hold release until the two important external device behaviors are validated.

## 17 October continuation: live communications and language-bound recovery

**Live messaging defect, verified from both layers:** `app/message.tsx` labeled any `rideActive` journey a "live demo" and skipped the actual Firestore thread, even when the Travel was paid and an Operator was assigned. `src/state/RideContext.tsx` likewise fabricated a scripted Operator acknowledgement for any active Travel Number following a successful message write. That could suppress real replies and cause a real Traveler to believe the Operator responded when they had not.

**Draft correction:** Demonstration behavior now requires an explicitly demo-marked Operator, an active session that lacks a persisted Travel record, and no Lost Item report. Real booked Travels listen to their authenticated Firestore messages, and only the actual Operator can author replies. The temporary script cannot run for genuine or Lost Item conversations. The twice-run cross-layer test checks both decisions. The **live-device acceptance** still needs two separate signed accounts, network loss/rejoin, different Operators, delayed replies and actual push/message read behavior.

**Localization defect, verified:** The module-level `UNREACHABLE` object in `src/backend/support.ts` translated the Patron Support unreachable error once at application startup. Changing language in Settings did not change that already-built error message. The error object is now created for each failed request, using the then-current language. This does not add any network traffic or impact case submission; the twice-run source contract checks translation timing.

**External published standards checked before implementation:** [Google Firestore real-time query scaling](https://firebase.google.com/docs/firestore/real-time_queries_at_scale) supports bounded, persistent snapshot listeners for actual changes, rather than substituting a local scripted message; [Apple's design principles](https://developer.apple.com/design/human-interface-guidelines/design-principles) require clear truthful feedback and familiar behavior, not claims unsupported by an actual operation. Neither publication endorses this application.

**Boundary:** draft-only, no live Traveler or Operator messaging was sent. Any new source commit resets exact-head test acceptance. The main `release/current`, app stores and TestFlight have not been modified.

## Operator-only Travel choices for uncertain lost-item reports

**Verified UX/security mismatch:** A report marked "not sure which Travel"
can list several recorded trips from different Operators.
`operatorLostItem()` previously passed the entire candidate list into
every Operator's screen. The server later rejected attempts to claim a
trip belonging to a different Operator, but the UI still displayed that
incorrect choice. Its authoritative ride lookup also collapsed multiple
trips served by the **same** Operator into a single option.

**Correction:** The authoritative server owner lookup now retains each
actual trip served by each distinct Operator. The Operator detail endpoint
returns only that Operator's own candidate trip numbers, never someone
else's options. The existing screen naturally offers a single trip directly
or presents a selector when the same Operator served several possible
trips. The server continues to re-check real ride ownership before any
"located" result. A deterministic regression covers one Operator serving
two candidates and another serving one. No database schema or new vendor
is introduced. Real logged-in Operator/Traveler acceptance remains open.

## Operator Lost Item screen error recovery

**Verified UI dead end:** `app/operator/lost-item.tsx` displayed a failed
`fetchOperatorLostItem` result but gave no Retry action. If the phone was
temporarily offline, an Operator could not reliably reopen the same recovery
task. A late network response could also update state after navigation.
Now the screen shows a truthful loading state, offers an explicit Retry
after a failed read, and ignores stale responses after unmount or route
change. It reuses the existing visual hierarchy (44-unit secondary control),
rather than enlarging every control. Added all five Operator-language
translations and source-level acceptance checks. Real signed-device
permission/navigation testing remains outstanding.

## Continued cross-system audit: Lost Item concurrent recovery (17 October)

**Verified race in two original server functions:** `backend/lostitem.js`
previously read a report and saved `operatorResponses` with an ordinary merge.
Two Operators responding together could overwrite each other's responses, and
a later negative reply could move an already `located` report back to
`operator-notified`. Separately, `notifyLostItemOperators` persisted
`operator-notified` *after* delivering its inbox message. An Operator who
responded quickly could have the located state reverted by that late
notification-bookkeeping write.

**Actual corrective code:** Both state updates now use Firestore server-side
transactions with a re-read at commit. A successful find cannot be overridden
by another Operator's negative reply, and a return in progress or completed
cannot be reopened by a late reply. Responses for distinct Operators survive
a race. A duplicate identical response does not generate another Traveler
notification; a negative reply after a prior confirmed find is silently
recorded without implying the item became lost again. External inbox
notifications happen only **after** transaction completion, since Firestore
can retry a transaction callback.

**Deterministic adversarial tests:** simultaneous locate / not-found;
both Operator responses persisted; repeated identical locate; terminal
`returned` refusing further changes; post-link authorization denying a
different candidate Operator; very fast locate racing notification bookkeeping;
and late notifier after return. The fake transactional database demonstrates
state invariants; real Firebase emulator transactions and phone interactions
are still distinct release evidence.

**Replay protection added:** Previously the initial lost-item notice
used a new random inbox ID for each request, so replay of
`POST /lost-item` after a lost response could send duplicate Operator
notices. `postPlatformMessage` now optionally accepts a report-and-Operator
idempotency key. It hashes the account/category/key into a stable, private
Firestore document ID and uses atomic `create`, so concurrent retries
return the existing result and **do not generate another push**. Ordinary
platform announcements still use unique IDs. The Lost Item caller supplies
this stable key from its authenticated, verified report and Operator. An
offline test launches concurrent duplicate attempts and checks that one
durable message and one push attempt result, with separate accounts/reports
unaffected. Actual push-device receipt/restart remains unverified.

**Delivery limitation:** If a durable inbox record is written but push
fails, a replay finds the record and does not retry the push. The account
inbox remains authoritative and readable, but separate resilient push
redelivery can be designed if measured notifications are insufficient.
The report notification authority remains the backend, never the phone's
unverified Operator list.

**External source:** [Google Firebase transaction semantics](https://firebase.google.com/docs/firestore/transaction-data-contention),
[atomic transaction guide](https://firebase.google.com/docs/firestore/manage-data/transactions);
AWS [safe idempotent retries](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/).
None endorses this specific implementation.

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

### 2b. The backend also trusted phone-nominated Operator IDs

**Follow-through finding:** Tightening the Firestore creation rule was necessary but not sufficient. The client still legitimately includes an array of Operator IDs, and `backend/lostitem.js` previously notified those IDs and allowed report/photo access based on the array without independently proving assignment. A modified client could nominate an unrelated Operator and cause a false mandatory notice.

**Draft fix:** Before sending any Operator notice, exposing a private report/photo, or accepting a recovery response, the backend now resolves candidate Travel numbers against **its own `rides` records**. One bounded `tripNo in` query (maximum 20 candidates) filters by the authenticated Traveler's UID and verifies the actual assigned Operator. The backend overwrites the client-nominated Operator IDs with this verified set. False or unavailable matches fail closed and remain eligible for the human Support fallback. Tests cover a true Travel, forged Operator, and Travel belonging to another Traveler.

**Independent acceptance still required:** Test actual Firestore indexes, private photo access, inbox delivery receipt, recovery replies and incident concurrency in sandbox. This is a critical authorization correction, not evidence that a production Operator was notified.

### 3. Lost-item history read every record and hid failures
**Evidence:** `fetchMyLostItems()` queried all reports for a UID, sorted them on the phone, and returned `[]` on any Firestore error. It could make an offline account appear to have no reports, while continuing to increase read cost as reports accumulated.

**Draft fix:** Introduce `fetchMyLostItemsPage` with an authenticated UID query, newest-first `createdAt`, cursor pagination and bounded reads (20 visible by default). The compatibility lookup returns just one page; it no longer disguises a failed read as a valid empty history.

**Commissioning dependency:** Added a `lost_items(travelerUid ASC, createdAt DESC)` composite index declaration. **It is not known to be commissioned/READY in production**; do not deploy query changes or imply production readiness without verified index evidence.

**Caller integration (verified):** Patron Support previously called `fetchMyLostItems().then(...)` with no failure handler. Simply making the backend function throw would create a new unhandled rejection. Updated `app/issues.tsx` itself to show the last known reports if refresh fails, give an explicit Retry, and fetch additional history only when the Traveler selects **Show more**. Pages deduplicate report IDs, and new failure/next-page text is translated into all five languages. The two-pass regression asserts this caller behavior, not just the helper.

### 4. Account Mobile silently treated a failed read as an empty number
**Evidence:** `app/account-mobile.tsx` fetched the `users/{uid}` record and swallowed any error. A network failure showed an empty field, inviting overwriting of an unknown existing contact number.

**Draft fix:** Explicit loading/unavailable/readable states, on-demand Retry and no editing or saving until the authoritative record was loaded. Guard late asynchronous results after navigation; no new continuous polling. Keep standard primary-button dimensions and explain failures in all five languages.

**Separate investigation, not a proven defect:** The number is described as **contact information only**, not a verified sign-in or recovery credential. Trace safety/SMS/notification consumers before imposing or claiming phone verification.

### 5. Lost-item messages could acquire a demonstration Travel Number
**Evidence:** `app/lost.tsx` used `item.tripNo ?? item.candidateTripNos[0] ?? ride.lastTrip.no`, and `app/message.tsx` fell back to `ride.lastTrip.no` even with no active Travel. A filed report without a recorded journey could navigate toward a conversation labeled with the seeded/demonstration or an unrelated last journey. The actual server must still authenticate message participants, but the interface should never invent a trip.

**Draft fix:** Only a Travel Number present on the actual lost-item report may open its Operator conversation. Otherwise display clear guidance to contact Patron Support. No-Travel Lost Item support calls `openHelp()` with no arbitrary reference. The message screen also refuses to watch or send on an absent route, unless there is a real active Travel. Existing class sizes and navigation semantics remain unchanged. Five localized messages, a twice-run source contract, and real-phone deep-link/participant checks remain required. This does not authorize messaging with an unverified Operator.

### 6. Traveler support notifications opened the Operator inbox
**Evidence:** `backend/platforminbox.js` writes durable per-account messages for *both* roles but pushed every notice to `/operator/inbox`. `backend/lostitem.js` sends the Traveler a confirmed located/not-found report update with its own `action.screen`, which the push ignored. That led the Traveler away from the report. The server also read the account's **entire** platform message history and sliced it to 50/100 on the server after Firestore had already billed the reads. Transient Firestore failures in list/read-marking escaped Express 4's asynchronous handlers, and the inbox initially displayed "No communications" before its first network read completed.

**Draft fix:** `postPlatformMessage` routes a trusted account notice to its explicit internal report action when provided; for notices without an action, preserves the legacy `/operator/inbox` route for older installed Operator builds. The new `/inbox` route reuses the exact Operator list component, with appropriate Traveler headings and localized errors, rather than implementing a second message system. It is accessible in the Traveler's Account menu. A new authenticated `/account/inbox` API serves both roles with unchanged legacy Operator endpoints for compatibility. The account-scoped read is newest-first and **bounded at the database** (50 default, 100 maximum). Lost Item notifications link to `/lost?item=` matching the actual screen parameter. The screen shows loading, Retry and saved messages on failure without inventing an empty inbox. Server list and mark-read operations return controlled failure results. Source regression asserts delivery, both backend routes, five-language namespace keys, fallbacks and server bounds. No recurring Firestore polling was introduced.

**Incomplete rollout requirement:** Existing mobile builds do not include `/inbox`; do **not** change the legacy default Operator push link to the new alias until supported app versions are in use. Generic Traveler messages without an explicit action still need version-aware push delivery to route them to the new account inbox on capable clients. Their durable message is accessible in the new Traveler Account menu, but this is not a claim that old builds have a fully functioning Traveler inbox. Pending actual app-version, push and deep-link acceptance.

### 7. Operator insurance expiration could disagree between screens
**Evidence:** The server's `backend/insurance-horizon.js` evaluates policy expiration at **23:59:59.999 UTC**, and the Insurance detail view used UTC, but `src/state/OperatorContext.tsx` used `T23:59:59` without a timezone, so the dashboard silently interpreted the date in the phone's local zone. Around policy expiry, the UI might disagree with the server's eligibility gate.

**Draft fix:** Both the Operator duty dashboard and Insurance view now apply precisely the server's `23:59:59.999Z` rule. No change to the independent, authenticated backend eligibility or statutory policy requirement. The mobile UI is informational; server eligibility remains mandatory for commencing operations and accepting Travel. Cross-layer regression checks the exact expression across all three modules. Physical timezone/DST, midnight, phone-backgrounding and server rejection remain real-device acceptance cases.

### 8. Safety assistance could attach an unrelated past Travel
**Evidence:** On the general `app/safety.tsx` screen, the Patron Support action always called `ride.openHelp(ride.lastTrip.no)` even when no Travel was underway. The helper only rejects the demonstration Travel Number, so a *real* earlier Travel could silently be associated with an unrelated, current safety concern. The Travel status screen also passed the same remembered value rather than delegating to the central active-state guard.

**Draft fix:** Both screens call `ride.openHelp()`. `RideContext` then supplies the active Travel Number only while an actual Travel is underway; otherwise the support case has no Travel attached. This is intentionally permitted for personal-safety or account concerns. Regression enforces the shared gate across the Safety screen, Travel screen, and support store. This does not modify emergency escalation, payments, or location processing.

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
