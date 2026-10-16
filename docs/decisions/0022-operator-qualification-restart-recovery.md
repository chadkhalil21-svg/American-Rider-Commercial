# ADR 0022 — Operator qualification submission is server-controlled after phone restarts

**Date:** 2026-10-15 (prelaunch). **Scope:** Existing Operator checklist submission only. No changes to signed-in user identity, county geography, insurance, screening, payout, Fare or platform-level approval.

The app stores accepted document states in device storage, but actual uploaded `review` verdicts exist only in transient `docReviews` React state. The backend's OCR correctly returns `review` until source verification. When the Operator restarts the phone after uploads but before submitting, `docReviews` is empty and `app/operator/qualify.tsx` formerly disabled the **only submit button** unless all handset flags were `ok` or `review`. A real waiting Operator could not reach the server after a restart.

**Decision:** Keep the existing market-eligibility control but allow the explicit "Submit for review" action regardless of local checklist progress. `POST /operator/qualification/submit` already re-reads authoritative original documents, insurer status, screen result and Stripe/account status, blocks `incomplete` with an actionable message, and never commissions an Operator merely because they tapped the button. The existing server-controlled review screen returns truly incomplete applications to the checklist, handles exceptions and commissions only on a verified `qualified` response. The user can recover without re-uploading their documents or receiving fictional approval.

**Test:** `backend/operator-qualification-restart.test.js` prevents restoring handset-only submit blockage and insists on the existing server approval checks.

**Boundary:** The progress bars are still local display state after a restart; a future UX improvement may hydrate status from the server. Neither a synthetic test nor a stored user checkbox proves actual provider/insurer verification. The proper next field test is a signed iPhone and Android app with an actual Operator document upload, deliberate phone restart and server-backed human review. No external provider purchase or native plugin is added.

References: [Apple HIG clarity and recoverability](https://developer.apple.com/design/human-interface-guidelines/), [Google SRE reducing manual toil](https://sre.google/sre-book/eliminating-toil/), [Google Firestore server authority](https://firebase.google.com/docs/firestore/security/get-started).
