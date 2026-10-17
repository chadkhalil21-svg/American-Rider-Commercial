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
