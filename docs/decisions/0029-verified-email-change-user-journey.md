# ADR 0029: Verified email change is an account journey

**17 October 2026. Status: review candidate, not released.**

## Decision
Preserve the existing American Rider Account Details and Email address screen geometry, shared cards, typography and primary button. Do not enlarge buttons because of unrelated redesign work. Increase supporting text contrast using the existing ink2 token.

Password-authenticated accounts use the existing Firebase flow: enter a different valid email and current password, reauthenticate, then request a verification email. The action explicitly says **Send verification email**. Sending a link is **not** an address change. Show a pending state identifying the requested address, a manual check of the server-authoritative Firebase user, correction/resend via a new authenticated request, and a verified-only completion. The current address remains displayed and operational until Firebase confirms the new one.

Refresh Auth only when opening the Email address screen, returning from an external email app after a short interval, or deliberately pressing Check status. Never poll Firestore, maintain a server-side pending duplicate, or expose password or verification tokens to logs. Preserve the Firebase User SDK instance; publish a lightweight revision after reload. Reuse existing password reset and account assistance. Apple/Google accounts are not falsely told a provider email change automatically updates Firebase: those accounts receive a Support route because OAuth reauthentication and email change is not yet commissioned here.

## Institutional evidence
- [OWASP, changing registered email](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html): current-credential reauthentication, verification of the proposed email, and notifications to existing identity.
- [OWASP, email verification](https://cheatsheetseries.owasp.org/cheatsheets/Email_Validation_and_Verification_Cheat_Sheet.html): distinguish proposal from verified identity; avoid dangerous email normalization and account disclosure.
- [Apple Human Interface Guidelines, text fields](https://developer.apple.com/design/human-interface-guidelines/text-fields): visible labels, email-friendly keyboard, hidden credentials, error feedback, consistent input geometry.
- [Apple Human Interface Guidelines, labels](https://developer.apple.com/design/human-interface-guidelines/labels): describe the real action, not merely Continue.
- [NIST SP 800-63B, account notifications](https://pages.nist.gov/800-63-4/sp800-63b.html): account change notifications and recoverability are important security controls.
- [Stanford d.school](https://dschool.stanford.edu/tools/design-thinking-bootleg): validate the actual journey on the intended device; source checking alone is not user testing.

Council reference lenses: Ford (reuse single identity authority), Rockefeller (no continuous vendor reads), Jobs/Apple (one understandable and consistent journey), Harvard/Stanford/MIT (verify actual service, not appearances), first-class hospitality (clear next action and recovery). This is not a personal consultation or endorsement.

## Boundaries / remaining acceptance
Firebase verification-link issuance and updated identity need sandbox evidence. Existing-email notification on change must be verified with the Firebase project and provider template; do not assert it from the client code. If stricter old/new-address confirmation or risk-based MFA is required by security review, build a server-verified workflow separately; do not invent it in the interface. The proposed address is also stored as a local, account-scoped pending reminder and is cleared after confirmation, correction, or account sign-out. No password or verification token is stored. This is a UI reminder, not authoritative evidence of a changed identity; restored-display behavior after a forced app restart still requires device testing. Real iOS/Android email-link handoff, password autofill, keyboard, dynamic text, sign-in after change, wrong password, invalid email, network loss, duplicate requests and provider-specific flows require physical tests. No real address change, provider email, release or production operation was performed in this audit.
