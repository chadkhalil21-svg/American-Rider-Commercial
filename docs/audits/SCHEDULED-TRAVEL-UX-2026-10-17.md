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

## Verification boundaries

Synthetic tests run twice for no destination, unknown/repricing/class-changed price, error recovery, midnight rollover, selected pin/market zone, daylight-saving gaps/overlaps, quarter-hour custom input, actual-time expiry, and schedule versus immediate booking navigation. Server reservation identity, payment and Fare authority are unchanged.

Keep PR in review until exact-head CI and signed physical-device iPhone/Android tests for font scaling, VoiceOver/TalkBack, scroll, search, keyboard overlap, loading, route changes and actual appointment states. No actual payments, reservations, dispatches, deployment or TestFlight submissions were undertaken by this UX work.
