# ADR 0030 · Operator Offer Shows Traveler Total and Compensation

**Status:** Founder-directed, under review. Not a deployed feature.
**Date:** 17 October 2026.
**Scope:** Incoming Operator Operation Request, accepted Travel restoration, iOS/Android/web.

## Decision
Every incoming server-assigned Travel request displays two precisely labeled amounts **before** an Operator may accept:
- **Traveler Total:** the all-in amount from the server's priced Travel record (`rides.costCents`), including platform fee and applicable pass-throughs.
- **You Receive:** 99% of that Travel's server-priced Fare (`rides.travelCostCents`), using the existing whole-cent commission rounding, **plus full toll reimbursement** (`rides.tollCents`). When a toll is present the screen explicitly states that it is included.

Do not calculate either figure from locally defined tariff examples, percentages of the Traveler Total, pricing research, or estimates of a competitor's share. Do not reveal internal processor charges or create a second displayed Traveler price. No new index, Firestore read, Stripe API call or pricing engine is required. The existing assigned-Travel Firestore document already holds the needed money fields.

If amounts are absent, invalid, or contradictory, the app must *not* offer an active Accept control and must present a plain-language verification state rather than guessing. A decline remains available; the server is still the final authority for acceptance, qualification and eligibility. This avoids treating a bad display as authorization to operate or altering the real payment lifecycle.

The disclosure is localized across all five configured languages and follows the existing Operator request visual hierarchy, without changing the Traveler confirmation screen, the 15-second Operator response interval or settlement logic.

## Verification and release
- Code: `src/operatorOfferMoney.ts`, `src/backend/operatorInbox.ts`, `src/state/OperatorContext.tsx`, `app/operator/index.tsx`.
- Tests: `backend/operator-offer-price-transparency.test.js` checks actual client money helper against backend `quote` and `economicsFor` twice, toll and card-country cases, corrupted input and five languages; the existing decline/cancellation regression remains applicable.
- Require exact-head CI, build parity and a physical-device offer before merge/deployment. No new Stripe charges or live Firestore writes are authorized by this ADR.
- Supersedes only the Operator request's former revenue-only price display. Preserves the current South Florida rate, 99% Fare share, full toll reimbursement and all previously settled operations policies.

**Council/rubric review:** a legible two-value disclosure is more useful than promotional assurances; one authoritative source for each value reduces ambiguity and operational failure.

## Founder-approved design refinement · Institutional palette and language
The approved offer hierarchy is retained. **Only the palette and interface copy have been refined.** Use screen-scoped tokens so this review cannot recolor the Traveler application or earlier Operator workflows.

- Earnings remain the one positive green value (`#1F8A5B`), labeled **YOU RECEIVE**.
- **Final founder-approved compact revision:** the **Accept Traveler** button and progress bar use established institutional graphite (`#14171F`), not a new vivid accent. The secondary **Decline** action retains a restrained slate outline (`#263E51`) and no destructive red treatment. Neither action's meaning depends on color alone. The slate and neutral palette remain scoped to the request sheet.
- Headings and location values use near-black graphite (`#182530`); secondary information uses darker readable gray-slate (`#475360`). A cool-neutral route surface (`#F5F6F7`) and discreet border (`#DCE1E5`) replace the earlier blue-tinted panel. Route stops are visually differentiated by filled versus outlined markers, not by invented or saturated hues.
- Amount labels remain explicit: **YOU RECEIVE** and **TRAVELER TOTAL**. The response instruction spells out *seconds*, rather than a cryptic unit suffix. Journey metadata is explicitly described as estimated and appears only when server-priced miles and minutes exist.
- Missing financial fields are explained as unverified amounts, without blaming or ordering the Operator to decline.
- Language changes cover all five existing locales. These are operationally precise labels, not promotional titles or invented performance claims.

**Evidence and restrictions:** apply Apple's published principles of judicious color, hierarchy and WCAG guidance (small text 4.5:1, large bold 3:1). Review contrast, large text, VoiceOver, and layout on physical devices. The green amount is large and bold; this is not a claim that every legacy app color has passed a contrast audit. The accepted preview and the implemented code are review targets, not a certified app build. Physical-device and provider-verified commissioning still govern merging.

## Final founder approval · compact response design (17 October 2026)

The founder expressly approved the more compact, graphite-primary request presentation, including retaining the green **YOU RECEIVE** numeral. Implementation now uses a single-line title/countdown group that wraps for larger text, a 34-point noninteractive Traveler avatar, reduced noninteractive spacing, a single earnings separator instead of an inner card, compact route rows, full-sized equal action targets, and the standard system push sound. An iOS/Android real-device check remains necessary; a preview is not an installed build.

**Push decision:** do not introduce a distinctive sound or privileged urgency in this design PR. Continue using Expo's existing `sound:'default'` and respect device Silent/Focus settings. Unattended background delivery, cold-start navigation, stationary presence, offer expiry, and actual sound tests remain a **separate commercial release blocker in issue #80**; this UI approval does not certify them.
