# 21 Oct 2026 | American Rider reservation and Operator journey state trace

Scope: source review of **Commercial release/current 0a20608d** plus Founder screenshots on iPhone. This is not a real-money, real-Operator, release-device end-to-end certification. No new TestFlight build or submission is permitted without renewed explicit Founder authorization.

## User-reported failure and source explanation

A next-day scheduled reservation is **cancelled in Scheduled Travel** but **appears on Home under Upcoming Travel**. The screenshots are two minutes apart, so they are not simultaneous proof, but the source defect is independently established.

- Server `DELETE /travel/schedule/:id` atomically changes `reserved -> cancelled`, never deletes the audit record, and rejects cancellation once the scheduler has advanced it.
- `fetchScheduledRide()` historically returned `cancelled` for as long as the pickup `atMs > now - 60 minutes`. Home kept `scheduled=true` and always displayed Upcoming Travel.
- `watchScheduledRide()` updated `schedState` without dismissing the Home card; cancelling from `app/upcoming.tsx` did not synchronously reconcile RideContext, although the list correctly said cancelled.
- Result: a cancellation one day ahead could still show in Home until **one hour after its booked pickup**. That is not an intentional product requirement.

Proposed remedy: exclude cancelled records from the compact Home selector, dismiss on confirmed delete success or existing live snapshot, and keep the cancelled server record intact. The existing Scheduled Travel page is only a near-term window: its query excludes appointments more than 90 minutes past their pickup time. A permanent cancellation-history view is NOT yet evidenced. Reuse the existing listener; no polling, additional document write, new index, or billing work. Home must accurately distinguish other non-cancelled failure statuses. Separate remaining UX gap: urgent `needs_attention` (charged but Travel not created) can age out of both compact Home and the bounded Scheduled Travel list; permanent support-case visibility and refund reconciliation require a dedicated product review.

## On-demand Operator search, acceptance and completion: audited contract

| Authority / stage | Actual backend or client transition | Truthful Traveler presentation |
| --- | --- | --- |
| Review quote | Server validates served pickup, class, geocoded coordinates, confirmed total; `/travel/prepare` is keyed and rejects mismatches | Show quote review, not searching until payment/booking state is verified |
| Payment | Native PaymentSheet / `payForRide`; Stripe state can be idle, processing, paid, failed | Show charge status factually, never imply the fleet was matched because money succeeded |
| Search | `dispatchRide` on paid Travel, eligible Operators only | "Finding" while actually searching, an indeterminate progress indicator, clear safe exit |
| No available Operator | `dispatchState='none'`; `retryDispatch` reuses the current keyed paid Travel | **Do not say "Still arranging"** when not actively searching. Display no-Operator state, manual Retry, Return Home, and confirmed cancellation. Paid/unknown states must show different monetary disclosures |
| Dispatch unreachable | `dispatchState='error'` | Distinguish technical error from no supply; allow retry without assuming payment state |
| Assigned offer | Server `assignPaidTravel` stores `rides.status='assigned'`; Operator has NOT accepted yet | Keep confirmed booking / preparing status; **no En Route progress, unverified arrival ETA, or assured Operator identity** |
| Operator accepts | Authenticated `/travel/accept`, screening/coverage/disclosure/payment/ride transaction; status `accepted` | Operator details, verified vehicle, En Route, ETA only when known |
| Operator arrives | Authenticated `/travel/progress` moves `accepted -> arrived` | Arrived, pickup instructions, actual arrival state |
| Boarding | Authenticated `/travel/progress` moves to `onboard`; Teen verification where required | Onboard; do not fake destination countdown |
| Completed | Authenticated Operator completion; client follows `watchRide`; backend handles settlement/payout | Completed, correct receipt, no release on a client timer for real Operators |
| Decline/no-response | Server release/assignment sweeps retain original paid ride key for reoffer | Notify of reconnection/redispatch, never show last declined Operator as accepted |
| Cancel/refund | `/travel/cancel` server-side Stripe-linked cancellation; fees controlled by deployed configuration | Confirmation and accurate refund status. Do not advertise refund completed until provider confirms |

### Other source-level observations requiring distinct release acceptance

1. Existing payment-before-dispatch path may have a confirmed paid Travel and `none` supply. It retains original payment/ride ID so Retry does not charge a second time. **Do not claim that no driver always means no charge**. The cancellation/refund path, refund-failure recovery, timeouts, and external webhook reconciliation must be tested with synthetic Stripe before paid-release certification.
2. `assigned` and `accepted` are distinct. The live UI status 0 must not visually highlight En Route or show a confirmed Operator card until `accepted`. No fabricated production timer; a 2.6-second ticker exists only for explicitly demo Operators.
3. Route progress uses a single existing Firestore ride listener, preserving status across Operator reassignment. Snapshots may replay and can arrive out of order; current UI only moves forward by step and reuses existing watcher. Race tests for reassignment, cancellation, stale ETA and a background/foreground transition remain important.
4. Scheduled `dispatching` is a real intermediate state written by the scheduler, missing from the prior type union; it should not be mistaken for a confirmed Operator.
5. Current Upcoming page shows a cancelled entry because it is an accountable historical record. No new blanket deletion or hiding of the record is appropriate; Home is a compact active/relevant view and may omit it immediately.
6. The Home map, unavailable supply UI and the quiet enabled cancellation control should preserve legibility, clear actionable contrast, 44-point targets and accessibility roles.

### Source comparisons and adopted rules

- **Apple HIG**: feedback/alerts/progress must accurately describe activity, success, failure and action; avoid indeterminate activity indications after an operation has stopped. https://developer.apple.com/design/human-interface-guidelines/feedback and https://developer.apple.com/design/human-interface-guidelines/progress-indicators
- **Google Firebase**: real-time `onSnapshot` updates documents without custom polling; use the existing subscribed scheduled record to react to cancellation. https://firebase.google.com/docs/firestore/query-data/listen
- **Google Cloud**: idempotency is essential for safe retries, especially payment. https://cloud.google.com/discover/idempotency
- **Uber developer ride-request states** (comparison, not copied branding/design): processing, accepted, arriving, in_progress, completed; no-drivers-available and canceled are distinct terminal outcomes. https://developer.uber.com/docs/riders/ride-requests/tutorials/api/best-practices
- **Nielsen Norman Group**: visibility of true system status, immediate feedback for transitions and clear available recovery actions. https://www.nngroup.com/articles/visibility-system-status/
- **Stanford HAI HCI overview**: user interactions must be intuitive, efficient, accessible. https://hai.stanford.edu/ai-definitions/what-is-hci
- **Harvard Business Review / HBS operations research**: showing genuine work rather than vague waiting indicators can improve perceived service during waits; never animate ongoing work when no work is happening. https://hbr.org/2011/05/think-customers-hate-waiting-not-so-fast

This comparison is analytical research based on published sources, not a claim that Apple, Google, Stanford, Harvard, Uber or any outside counsel evaluated or approved American Rider.

## Test matrix before distribution

- [ ] Source unit/regression: cancellation a day ahead, immediately after cancel, cold restore, live snapshot, and list-vs-Home reconciliation. **Implemented test included in PR; awaiting CI confirmation.**
- [ ] Source regression: manual no-supply is terminal to the current matching attempt; UI distinguishes no supply from network failure and paid vs unpaid.
- [ ] Test repeated `Try again` never issues duplicate Stripe charges or new ride IDs; test cancellation race with acceptance/reoffer.
- [ ] Verify full operator sequence on synthetic fleet: prepared, paid, assigned, accepted, arrived, onboard, completed; decline/reoffer, unreachable dispatch, operator timeout, price change, canceled, refund pending/failed.
- [ ] Verify app restore/offline updates and VoiceOver on iPhone/iPad physical devices when Founder explicitly permits any new TestFlight.
- [ ] Independently reconcile deployed Cloud Run SHA, Stripe payment/webhook states, screening/insurance, and true paid-booking acceptance before declaring the commercial launch certified.

**Distribution rule:** No automatic or manual new TestFlight without the Founder's specific authorization. Do not interpret this review or a green CI check as permission.
