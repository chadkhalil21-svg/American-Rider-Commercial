# ADR 0024 — Reviewed insurance documents must not bypass current coverage

**Date:** 2026-10-15. **Status:** Candidate; exact-commit tests/merge/deployment separately required.

## Actual onboarding failure

The mobile app uploads private insurance images and PDFs, and the document OCR always responds with `review` until named Operations staff inspect the original. Staff approval stores `documents.insurance.decision.verdict = accept`, but deliberately leaves the original OCR `documents.insurance.verdict = review`.

Three separate paths incorrectly required the *original* OCR verdict to equal `accept`:

1. Qualification's independent continuing-insurance check ran only when raw verdict was `accept`. This could allow human-approved paper to skip the independent insurer/broker verification and cancellation check.
2. The operator's **Authorize insurance status verification** action required raw `accept`, so reviewed insurance could never authorize insurer verification.
3. The insurer-status attestation also incorrectly required raw `accept`, permanently refusing properly reviewed policies.

The mobile screen hid insurer status steps whenever its *local* document badge remained `todo`, even after independent staff approval. Replacement documents held for review failed to invalidate old insurance monitoring status.

## Resolution

- Run continuing insurance checks on both original machine-accepted and manually accepted documents, even after a reviewed PDF.
- Only allow status authorization/attestation if the effective human/machine policy satisfies **all** state-specific coverage checks (including dates, use, insured and vehicle). The original OCR decision alone is not authoritative.
- Any new insurance upload starts an **unverified** continuing-status cycle, even if held for manual review. Old policy verification must never carry over to an unrelated replacement.
- Expose on the authenticated existing insurer status route only whether the current document passed deterministic review, plus its expiry; expose no policy number or sensitive source bytes. The app uses that server verdict to show status authorization, contact-request steps and expiry instead of untrusted phone cache.
- Simulate human approval with independent verification missing, current and then cancelled; test that only current independent coverage qualifies. Document staff approval alone never authorizes dispatch.

This changes neither Operator-funded insurance, jurisdiction activation, screening provider choice, Stripe funds nor the established fare. Synthetic tests prove internal state transitions, not a genuine broker callback or third-party report. As recommended in reliable cloud engineering and service design, release requires repeatable edge-case tests, verifiable state after app restart and safe failure modes.
