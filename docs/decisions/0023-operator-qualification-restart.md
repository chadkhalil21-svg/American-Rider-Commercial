# ADR 0023 — Recover Operator document review after phone restart

**Date:** 2026-10-15. **Scope:** Existing qualification application flow only.

An Operator's private insurance, licence and registration files remain on the server while the phone's temporary `docReviews.review` flags disappear on restart. The former `qualify` screen disabled Submit until those temporary flags were present. As a result, a valid in-progress application could not reach Operations after restarting the phone, even though its evidence still existed.

**Decision:** Keep the Operator's operating-market gate. Keep the Submit button available in an authorized market so a returning Operator may ask the **server** to reassess the application, regardless of stale or lost phone-state. The existing `POST /operator/qualification/submit` is authenticated and reads the real documents, screening results, insurer status and payout eligibility; it returns `incomplete` when something is genuinely missing, and cannot qualify merely from the button. The review screen routes truly incomplete applications back for corrections and approves only a server `qualified` answer.

The patch retains five-language translations for the one submit action and eliminates abandoned 'Verify all' client language. It adds a regression and updates the prelaunch market restriction contract. No additional subscription, area admission record, insurer or screening company, pricing, payout or public commercial claim. Real signed-device restart and real source verification remain independent tests.

Source standards: Apple Human Interface Guidelines recoverability and clear controls; Google Firestore server authority; Amazon request idempotency, NASA intended-environment validation.
