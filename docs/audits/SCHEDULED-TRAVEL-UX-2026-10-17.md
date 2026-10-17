## Whole-service scheduled Travel design, not screen cosmetics (17 October 2026)

**Founder challenge and cause:** Earlier reviews checked whether the existing date
screen was internally polished, rather than asking what a scheduled booking
must contain from the Travel customer's first action through dispatch, changes
and cancellation. Increasing visible button sizes to pass an accessibility
checkbox contradicted the founder's established "Friendly" design language.
The architecture must start from the complete journey and existing shared
components, not invent a standalone overbuilt scheduling UI.

**Comparative workflow research, used as patterns rather than brand copy:**
- [Uber Reserve](https://help.uber.com/en/riders/article/c%C3%B3mo-usar-uber%20reserve?nodeId=71708d67-bbac-4dda-9d32-53c2509bdd1b): place/time, explicit vehicle option, full quote, confirmation, and an Upcoming trips location for changing/cancelling; do not copy Uber's reservation fees or guarantees.
- [Lyft scheduled rides](https://help.lyft.com/hc/en-us/all/articles/115013078668): both Home-first and destination-first entry, vehicle type selection, persistent scheduled-trip details, edit/cancel with stated conditions.
- [Blacklane booking changes](https://help.blacklane.com/en/articles/2690381-how-can-i-make-changes-to-my-booking): service class, date/time and addresses are consequential editable fields; the fare must be reviewed after a material change, and policy applies to its actual provider.
- [Nielsen Norman Group consistency and standards](https://www.nngroup.com/articles/consistency-and-standards/): internal design consistency is as important as familiar travel-booking patterns.
- [Apple buttons](https://developer.apple.com/design/human-interface-guidelines/buttons): coherent styles, not arbitrary heights or widths to differentiate adjacent choices; favor one prominent action and preserve spacing.
- [Android Accessibility touch size](https://support.google.com/accessibility/android/answer/7101858?hl=en&ref_type=adv): when a visible control is already appropriate, expand its accessible hit target when possible rather than enlarging all rendered furniture; true 48×48dp nonoverlapping touch acceptance still requires handset tests.
- [GOV.UK review summary](https://design-system.service.gov.uk/components/summary-list/): visible current answers and explicit Change paths before a consequential final submit.

**Implemented now on draft PR #52:**
1. Display the selected vehicle class and named Traveler in the scheduling
   review. Tap either row to open the **existing** Travel Confirmation class,
   family/other-adult selection and authoritative re-quoting. Only the
   actually bookable classes (Standard, Large Vehicle, Pet Friendly) are
   offered by the shared selector. Unavailable Premium, Shared and
   Accessible classes remain unavailable, without claiming a fleet capability
   that has not been commissioned.
2. Correct previously increased visual target dimensions back to the
   existing 44-unit family, while preserving the app's existing spacing
   and options. The expanded time presets retain two readable columns
   rather than four compressed ones. The seven-column calendar is **not**
   yet certified as 48dp wide or screen-reader complete.
3. A booked reservation appears on Home. One Cancel tap now requests
   a second explicit decision, `Keep Travel` or
   `Cancel scheduled Travel`, explaining that no Operator has yet been
   assigned and cancellation is without charge for that reserved status.
   Only `reserved` may call the existing server-confirmed reservation
   cancellation; `dispatched` must use the active Travel's cancellation
   lifecycle. Cancellation never mutates only local state or invents
   a refund. The existing backend transaction remains the authority.
4. The Travel menu entry previously routed an **existing** reservation
   back to `/schedule`, a new booking form. It now closes the Home
   drawer and reveals the actual Upcoming Travel card, rather than implying
   an unrelated new booking is a details page.
5. Before final confirmation, the screen now states where cancellation
   can be managed, without copying arbitrary competitor cancellation fees.

**Still NOT implemented and must not be implied to work:** transactional
edit of an existing confirmed reservation (date/time, pickup/destination,
vehicle class, Traveler). A proper design needs an authenticated
reservation-edit endpoint with time/status checks, class and route
revalidation, new server Fare + explicit Traveler approval of any changed
Total, reservation ID/idempotency semantics, Operator-assignment race
handling, and a visible success/failure result. Rebooking by blindly
editing local text, deleting a dispatched Travel, or pretending to
preserve the original price is unsafe. Design approval is separate from
authorizing this money-related backend feature.

**Other end-to-end acceptance cases** remain: Traveler category and
guardian-authorized Teen, route and pickup point, travel preferences,
different classes/eligibility, vehicle-specific prices, scheduled-time
validity across zones and DST, quote retry and failure, payment-on-file,
saved reservation reopening, simultaneous cancel/dispatch, Operator
assignment, live Travel restoration, support, notification delivery, all
five languages, phone widths, iOS and Android assistive technology, and
signed sandbox journey. None is certified by a source-only regex test.

**Council review:** Ford favors one reused operating chain; Rockefeller
requires bounded quote and Firestore expense; Jobs/Apple demand the same
visual language and expected user path; top universities' research requires
real customer observation, not endorsement; discreet hospitality requires
a truthful, reversible pre-dispatch cancellation. No Council member or
institution was personally contacted.

# Scheduled Travel: research-first, whole-journey UX review

**Date:** 2026-10-17. **Scope:** Home, Plan ahead, route selection, price, calendar, confirmation. **Status:** review candidate, not an installed-device sign-off.

## Screenshot evidence and root problems

The founder's iPhone showed Tomorrow at 6 AM at 11:36 PM, no destination, a $0.00 amount and a false time-expired warning. This uncovered structural problems beyond the warning:

1. The founder-approved Home scheduling entry deliberately starts before destination selection, yet destination was hidden in a tiny subtitle.
2. Relative date buttons did not clearly show the exact selected calendar day; this matters at midnight.
3. Four large suggested times and a large custom-time field dominated the screen even if the selected time was already acceptable.
4. $0.00 looked like a price although there was no authoritative quote. The disabled final button offered little guidance.
5. The route/quote screen could present the immediate-booking action, and a moved pickup pin could conflict with scheduled route data.

## Published institution and engineering guidance, applied

- [Apple design principles](https://developer.apple.com/design/human-interface-guidelines/design-principles/) and [layout](https://developer.apple.com/design/human-interface-guidelines/layout): prioritize one purpose, recognizable fields, progressive disclosure, and recovery without losing context.
- [Apple pickers](https://developer.apple.com/design/human-interface-guidelines/pickers): a compact time control and quarter-hour intervals are supported patterns. Avoid making all time choices permanently visible; use the established component without a new native dependency.
- [Nielsen Norman Group on user journeys](https://www.nngroup.com/articles/user-journeys-vs-user-flows/) and [error recovery](https://www.nngroup.com/articles/errors-forms-design-guidelines/): design the full path to a completed service, and explain the actual problem close to where it can be fixed.
- [Baymard 2025 checkout research](https://baymard.com/research-articles/current-state-of-checkout-ux): explicit dates and specific errors reduce cognitive work and mistaken selections.
- [GOV.UK date selection](https://design-system.service.gov.uk/patterns/dates/): Today and Tomorrow can be offered alongside a real calendar, but show the weekday and absolute chosen date.
- [IDEO's journey map](https://www.designkit.org/methods/journey-map.html) and [Stanford d.school's design guide](https://dschool.stanford.edu/tools/design-project-guide): validate the key handoffs in context, from choosing a location to completing the reservation.
- [Harvard Business School on service excellence](https://www.hbs.edu/faculty/Pages/profile.aspx?facId=6587): do not promise a service beyond what the operating model can reliably deliver.
- [Google Firestore read pricing](https://cloud.google.com/firestore/pricing): avoid needless reads or subscriptions on every time/date selection.
- [Amazon idempotent retries](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/): repeated confirmations must not create duplicate consequential actions.
- [NASA SWE-055](https://swehb.nasa.gov/spaces/SWEHBVD/pages/102695440/SWE-055%2B-%2BRequirements%2BValidation): validate requirements in actual intended operating conditions, including negative tests, before calling the release ready.

The Council is a **reference framework**, not evidence of personal consultation: Ford suggests one repeatable itinerary; Rockefeller, bounded cost; Jobs and Apple, a composed shortest understandable mobile path; Stanford, Harvard and MIT research, service-level human validation; first-class hospitality, accurate help instead of confusing red errors.

## Implemented review candidate

- **One itinerary card directly under Plan ahead:** separate editable Pickup and Destination. Each opens the established address search; the destination is visible even if missing.
- **Explicit date:** Today, Tomorrow, Pick a day, and the exact selected weekday, month, day and year. The chosen absolute date survives midnight and route edits.
- **Compact time:** one clearly selected time that opens quick presets, AM/PM and a custom quarter-hour entry only on demand. Never silently substitute another time when custom entry is unresolved.
- **Complete Travel Cost:** show only the server-authoritative, route/class-matched amount. Otherwise say Not quoted yet, never $0.00.
- **One bottom action:** Choose destination, Review Travel Cost, or Schedule Travel depending on verified readiness. Scheduling-first travelers return from address/quote selection to the same date/time, not the immediate payment/booking path.
- **Recovery:** accurate inline messages for unavailable zone, invalid/expired time, absent route/price, and server rejection. Time changes cause no extra vendor query or Firestore polling.

## Further negative-state finding

During pickup-area lookup, the screen could briefly mistake an in-progress request for a confirmed unavailable zone. The revised UI distinguishes **Checking pickup area…** from actual unavailability. Normal request count is unchanged; after a completed failure, the Traveler now has an explicit **Try again** action to repeat the existing lookup, rather than navigating away or waiting for background polling. The five language bundles and source regression cover this transition.

## Verification boundaries

Synthetic tests run twice for no destination, unknown/repricing/class-changed price, error recovery, midnight rollover, selected pin/market zone, daylight-saving gaps/overlaps, quarter-hour custom input, actual-time expiry, and schedule versus immediate booking navigation. Server reservation identity, payment and Fare authority are unchanged.

Keep PR in review until exact-head CI and signed physical-device iPhone/Android tests for font scaling, VoiceOver/TalkBack, scroll, search, keyboard overlap, loading, route changes and actual appointment states. No actual payments, reservations, dispatches, deployment or TestFlight submissions were undertaken by this UX work.


## Published institutional evidence review, applied to candidate code (17 October 2026)

This review begins with independently published institutional guidance, then checks
American Rider's own `AGENTS.md`, `PROJECT-LEDGER.md`,
`docs/COUNCIL-STANDARDS.md`, `app/schedule.tsx`, `app/reserve.tsx`,
`src/state/RideContext.tsx`, `backend/scheduleclock.js`, and
the server's protected scheduled-reservation endpoint.
No person, school, organization or Council reference figure was personally
contacted. Citing their published work is not endorsement.

| Guidance institution | Verifiable published principle | American Rider disposition |
| --- | --- | --- |
| [Stanford d.school](https://dschool.stanford.edu/tools/design-thinking-bootleg) and [IDEO](https://designthinking.ideo.com/introduction) | Prototype/test with travelers; jointly assess desire, implementation, and cost | Keep itinerary-first screen as candidate, not a confirmed usability outcome; real-device/user observation remains mandatory |
| [MIT Sloan CISR](https://dspace.mit.edu/handle/1721.1/174978) | Customer insight, accountability, co-design and ongoing customer engagement | One named, end-to-end scheduled journey owner is required; internal automated checks cannot substitute for observed travelers |
| [Harvard Business School, Frances Frei](https://www.hbs.edu/faculty/Pages/item.aspx?research=7002) | Sustainable service promises need matching delivery capacity and funding | Do not promise guaranteed assignment or future notification; preserve qualified Operator matching, server-authoritative all-in Fare and explicit post-booking status |
| [Apple](https://developer.apple.com/design/human-interface-guidelines/pickers) | Selection controls should remain in context; predictable small lists, quarter-hour time intervals | Preserve concise Today/Tomorrow/Choose-day and compact time; optional time detail expands in place |
| [Nielsen Norman Group](https://www.nngroup.com/articles/progressive-disclosure/) | Hide secondary decisions until requested | Keep pickup and destination upfront; defer extra time presets/calendar. No separate scheduling-only search or pricing stack |
| [Baymard](https://baymard.com/research-articles/mobile-ecommerce-checkout-forms) | Real mobile checkout must not force users to remember costs/dates from earlier screens; absolute clarity on total price | Display selected exact calendar date and all-in server Total in final summary, with informative missing-price state |
| [GOV.UK Design System](https://design-system.service.gov.uk/components/error-message/) | Describe precise failure and preserve user-entered values | Never silently replace a user's hour; surface unusable date/time or missing Fare and keep selections for correction |
| [Google/Android Accessibility](https://support.google.com/accessibility/android/answer/7101858?hl=en) and [Apple Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) | Aim for Android 48×48 dp and iOS 44×44 pt touch targets | Height, localization and labels improved; seven-column calendar remains narrower than Android's recommendation on small screens, **unresolved** pending redesign with native date control or verified phone layout |
| [Google Firestore](https://docs.cloud.google.com/firestore/native/docs/best-practices) | Bound database work and avoid wasteful reads | Scheduling date/time state is local; no new snapshots or polling, reuse existing authoritative pricing and location resolution |
| [Amazon Builders' Library](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/) | Retries must not duplicate consequential business actions | Preserve deterministic, atomically created scheduled reservation identity and stored consent Total; do not add unverified client retry side-effects |
| [NASA SWE-055](https://swehb.nasa.gov/spaces/7150/pages/16449673/SWE-055%2B-%2BRequirements%2BValidation) | Verify intended behavior for normal and adverse conditions in the actual customer environment | Source tests and synthetic campaigns are one level of evidence; reject merging pending end-to-end signed handset and accessibility checks |

**Additional direct defects corrected after institution-first research:**
1. Previously, the saved booking title could be only `Tomorrow`, which is no
   longer true after local midnight. Relative labels remain on the selection
   chips; the summary, completion and server-saved `when` use the **exact
   date with year**, derived from the absolute pickup-day state.
2. Previously, pressing PM after selecting 6:00 AM could silently alter the
   pickup to 6:30 PM because that period's four quick presets do not include
   6:00. AM/PM now changes only the period; a changed hour requires deliberate
   selection.
3. A two-pass regression asserts these invariants in all five locales and
   checks that no automatic PM preset substitution remains.

**Council test:** Ford: reuse a single reservation journey, no duplicate
backend. Rockefeller: no extra provider calls, per-tap queries or subscription.
Jobs/Apple: the date and hour printed are exactly the date and hour selected.
Harvard/Stanford/MIT: no false operational promises, clear customer value,
measurable physical acceptance. First-class hospitality: calm copy, honest
failure handling and clear next action. A Council **lens** is not a literal
interview with Ford, Rockefeller, Jobs or an advisory endorsement.

**Final-review improvement from Baymard's observed mobile context loss:** the
confirmation card now restates pickup location, destination, exact date and
time, and the authoritative Complete Travel Cost together next to the
`Schedule Travel` action. Previously it showed only a misleading
`Pickup` label with the date/time and the Total, requiring a return scroll to
verify the destination before making a consequential reservation. The
destination is absent from the summary until genuinely chosen; this does not
invent an address or new pricing call. The double-run source contract asserts
all four fields and their position before the confirmation control.

**Do not overclaim:** PR remains draft; physical viewport measurements, safe
area/keyboard, screen-reader traversal, real-device date tapping, actual
signed-server scheduling and release parity have not been attested by CI.
Neither published principles nor synthetic tests alone prove usability.


## Additional independent institutional review and corrective audit (17 October)

**Method:** compare public research with the PR's actual \`app/schedule.tsx\`,
\`app/reserve.tsx\`, \`src/state/RideContext.tsx\`, \`backend/scheduleclock.js\`,
the authenticated \`/travel/schedule\` route, existing Render release, and the
twice-run regression. Council figures are historical standards, not interviewed
advisers or endorsements. Do not treat repository comments as physical evidence.

| Evidence-led question | Primary guidance | Verified code observation and action |
| --- | --- | --- |
| Is the first decision immediately recognizable? | [Apple simplicity / hierarchy](https://developer.apple.com/design/human-interface-guidelines/design-principles), [Google Design review](https://design.google/library/reviewing-the-design-review) | Keep Pickup and Destination visible first, ahead of date/time. Existing quote/address screen is reused, with a clear schedule-specific return path. No second booking or geocoder. |
| Do choices require unnecessary memory or work? | [NN/g progressive disclosure](https://www.nngroup.com/articles/4-principles-reduce-cognitive-load/), [Apple pickers](https://developer.apple.com/design/human-interface-guidelines/pickers) | Show selected day and selected hour by default. Expand alternative times and the calendar on request only. Four expanded quick times now wrap in two rows instead of crowding four narrow columns. |
| Are dates unambiguous across language, midnight, and DST? | [GOV.UK dates](https://design-system.service.gov.uk/patterns/dates/), [Apple localization](https://developer.apple.com/design/human-interface-guidelines/inclusion) | Preserve the exact pickup day in state and validate with pickup-zone time. Fix weekday headings that had been fixed English \`S M T W T F S\` in Spanish, German, French and Italian. Start the week Sunday in current US English and Monday in the four other supported languages; announce full dates to screen readers. |
| Is the Traveler in control of the time? | [Apple agency](https://developer.apple.com/design/human-interface-guidelines/design-principles), [Stanford choice defaults research](https://www.gsb.stanford.edu/faculty-research/publications/defaults-decisions-choice-architecture-consumer-opt-out) | **Defect corrected:** a former effect silently replaced an expired quick time with the first available preset. The selected hour now stays visible, shows its actual invalid/expired state, and requires an explicit new choice. |
| Are forms easy to operate? | [Baymard address lookup](https://baymard.com/research-articles/automatic-address-lookup), [Android touch targets](https://developer.android.com/guide/topics/ui/accessibility/apps), [Apple accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) | Reuse the existing proximity-aware destination and pickup search. Improve descriptions for current time and date, raise date/time button heights to 48 where modified, improve weekday contrast, and use an input-friendly keyboard. **Not yet certified:** the seven-column calendar has horizontal widths smaller than 48 on narrow phones and needs actual Android/TalkBack inspection; no false touch-size certification is claimed. |
| Are errors truthful and recoverable? | [GOV.UK error messages](https://design-system.service.gov.uk/components/error-message/), [NN/g error recovery](https://www.nngroup.com/articles/errors-forms-design-guidelines/) | Distinguish missing destination, missing authoritative Fare, checking market, failed market, invalid custom hour, expired real time and server rejection. Preserve typed selections. The existing failed-market retry is on demand, not polling. |
| Is the price authoritative? | [Harvard HBS service excellence](https://www.hbs.edu/faculty/Pages/item.aspx?research=7002), [Baymard checkout findings](https://baymard.com/research-articles/current-state-of-checkout-ux) | Only server-quoted class/route Total is printed. Never show a made-up $0 amount; do not allow Schedule Travel while quote is absent or changing. Server rechecks the cost and rejects mismatches rather than charging an unapproved amount. |
| Could failures create repeated work or duplicate reservations? | [AWS safe retries](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/), [Stripe request idempotency](https://docs.stripe.com/api/idempotent_requests) | Retain server-side scheduled identity and transactional duplicate protection, and match/charge only through existing backend. Do not trigger another payment or reservation from calendar selection. |
| Does UI browsing add recurring costs? | [Google Firestore best practices](https://docs.cloud.google.com/firestore/native/docs/best-practices) and [real-time query scaling](https://docs.cloud.google.com/firestore/native/docs/real-time_queries_at_scale) | Clock-only 30-second refresh has no new Firestore reads. Market lookup retains its existing 15-second bounded client cache and only reruns on changed coordinates or explicit retry. No new paid provider, location listener or background price polling. |
| Are success criteria tested in the intended environment? | [Stanford d.school prototype and test](https://dschool.stanford.edu/tools/design-thinking-bootleg), [NASA SWE-055](https://swehb.nasa.gov/spaces/SWEHBVD/pages/102695440/SWE-055%2B-%2BRequirements%2BValidation) | Synthetic time, route, DST, market, missing Fare, permissions and replay regressions remain necessary but are **not** a device, real screen reader, live provider, or usability study. Physical iPhone and Android sign-off remains open. |

**Acceptance matrix:** Home > Plan ahead with no destination; both address editors and
saved pickup pin; autocomplete and map results; today/tomorrow/calendar and month
rollover; today at late hour; midnight crossing with selected tomorrow; leap days,
spring-gap and autumn-overlap hours; 12 AM/PM conversion and custom 15-minute
rounding; slow/failed pickup-market response; missing/stale/class-changed quote;
unavailable market; no network; quote changes before submit; double tap or late
retry; successful server reservation and Home record; cancellation racing dispatch;
international locale; narrow screens, enlarged text, scroll under keyboard,
VoiceOver, TalkBack, and both device types.

**Evidence boundary:** The automation exercises much of this matrix, including
source contracts and deterministic failure simulation. It does **not** substitute
for true rendered screenshots, actual mobile keyboard behavior, screen-reader
navigation, real push/assignment, provider authorization, or live payment tests.
The 48-unit **height** correction alone does not prove every grid cell meets the
48-by-48 Android recommendation at all widths. Do not merge or deploy this PR on
that unsupported assumption. Remain draft until those items are evidenced.
