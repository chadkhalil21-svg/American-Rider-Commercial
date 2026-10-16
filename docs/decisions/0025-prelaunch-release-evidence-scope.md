# ADR 0025 — Prelaunch payment and Smart Travel evidence

**Decision:** The founder selected ordinary Standard Travel for initial South Florida launch and directed Smart Travel to remain visually disabled and unavailable at the backend.

**Problem:** The earlier manual release-evidence script demanded a live transit product, live Smart Travel and live-money reconciliation even before public launch. It also demanded a holdout experiment despite the founder-ratified initial tariff. Those fields were obsolete and could create false release blockers.

**Change:** Retain the existing source review, actual Stripe configuration, individual Operator insurance/screening evidence, signed iOS/Android device, safety/permit, measured load, emergency and usability checks. Confirm that both mobile and backend refuse new Smart Travel. Do not demand live public-transit commissioning. Require a linked Stripe **sandbox** booking completed from a signed app with tested charge-to-dispatch agreement, retry recovery and refund as release evidence. Do not invent completed test results.

**Non-goals:** No real-money transactions; no supplier or policy purchase; no state/county administration; no fare adjustment; no simulated insurance/screening used for commercial approval; no unsupported declaration that Firebase billing or physical devices are certified.

**Testing:** Two positive fictional manifest validations, negative missing/sandbox mode/payment/retry/evidence cases, and the existing exhaustive source/test suites. The manifest fixtures are deliberately synthetic and never evidence of real launch readiness.

**Source references:** Expo EAS native-runner documentation, Stripe sandbox/test-mode documentation, NASA software verification against intended operating conditions, Google Firestore pricing and release operations.
