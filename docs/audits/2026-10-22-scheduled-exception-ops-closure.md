# American Rider | Unresolved scheduled Travel: durable one-Founder Operations handling
22 October 2026 | Source audit follow-up, subject to exact-head CI and controlled Cloud Run deployment.

## Previously verified
[Full end-to-end matrix](2026-10-22-systematic-commercial-e2e-audit.md) identifies signed-device checkout, independent Operator verification, adult pickup code coordination and provider payout as **real external acceptance** still required. PR #219 fixed manual Stripe authorization vs captured payment truth and deployed paid Cloud Run revision `00015-7pb` on release commit `a29ca10` using controlled source rollout. No public users or operators currently enrolled per Founder. No new TestFlight without express approval.

## Additional source defect and minimal repair
Two scheduled states were being written as `needs_attention` without reaching the Founder:
1. An indexed scheduled request was claimed and then `prepareBooking` failed before requesting any Stripe authorization; or Teen pickup protection could not be established before a payment request.
2. A claim remained `dispatching` after the server died, but the same Travel had been staged. Recovery safely left it `needs_attention` rather than charging twice. It did **not** open a persistent support case.

Both could age outside the Traveler's bounded upcoming window, while the Founder had no reliable case in the existing Operations queue.

**One standard path, no new infrastructure:** On the committed transition, the existing `fileTicket` implementation stores a deterministic, per-reservation **support_tickets** case and sends its existing Resend email. Only one case identity is used on retries. It explicitly states no charge was confirmed for pre-payment failure; a staged provider ID must be reconciled against Stripe, not blindly refunded or charged. Case creation runs *after* the Firestore transaction and cannot hold dispatch locks waiting on email. The case remains open until a named authenticated Operations actor explicitly acknowledges and resolves it. Reuse `/ops/cases?kind=support`; do not invent a separate human queue. Errors are logged and the authoritative `needs_attention` record persists.

**Fallback when an email fails or an older case was never filed:** Add a small on-demand `/ops/scheduled-exceptions` view. It is accessible through the existing named-MFA `/ops` console, only after authenticated request. It queries only `scheduled_rides where status==needs_attention orderBy __name__` with a page of at most 26 documents, and uses a cursor for more. A page cannot make claims about older unseen rows. It escapes all Firestore strings to prevent stored HTML injection, makes **no money-changing actions**, and costs **zero scheduled reads when the Founder does not open it**. No new scheduler, daemon, map vendor, Firestore collection, composite index or polling loop.

## Regression acceptance
- Unique stable support case identity; strict owner binding.
- Pre-payment failure alerts include no invented capture/refund; stale original provider ID reaches Operations.
- On-demand page defaults to 25, hard max 50 plus one sentinel row; pagination is ordered and preserves every unresolved exception without whole-collection download.
- User-generated strings escaped; named-MFA /ops auth required; a failed Firestore query does not display empty/success.
- Existing travel, payment, cancellation and refund flows remain unchanged; all seven exact-head CI gates must pass before merge. A GitHub merge is not proof of Cloud Run deployment.

## Deferred independent acceptance, unchanged
The founder forbids new TestFlight without separate authorization. Therefore physical iPhone/iPad cold-start, paired Traveler/Operator pickup code, genuine 3DS/wallet challenge, screened and insured operator, Connect bank payout, and counsel review cannot be certified by source CI. Current paid Cloud Run manual capture remains enabled and separate cancellation/no-show fees remain OFF.

Guidance: [Apple feedback](https://developer.apple.com/design/human-interface-guidelines/feedback) (accurate and actionable recovery), [Google SRE SLO alerting](https://sre.google/workbook/alerting-on-slos/) (signal rather than noise), [Firebase query/index guidance](https://firebase.google.com/docs/firestore/query-data/queries) and [index overview](https://firebase.google.com/docs/firestore/query-data/index-overview) (bounded indexed reads). Published guidance is not an institutional endorsement or a retained lawyer's opinion.
