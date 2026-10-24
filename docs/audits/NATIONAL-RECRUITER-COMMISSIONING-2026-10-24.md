# National recruiter commissioning | 24 October 2026

Status: Guarded source foundation, NOT a live paid recruiter service.

## .app is not one kind of identifier
American Rider uses americanrider.app for historical web URLs, certain email addresses, dynamic follow links, and referral URLs. These are migration candidates, but must be moved only when their replacement works on the actual native app and hosted backend.
The com.americanrider.app iOS bundle identifier and Android package ID are permanent app-store identifiers, not Internet addresses. They must not be renamed when moving the website to americanrider.tech.
Change web-linked legal pages to americanrider.tech now. Keep legacy referral URLs functioning for previously shared links; new recruiter invitations must use the owned americanrider.tech origin only after verified Apple/Android app association. The static website does not automatically handle dynamic app links and /follow, so do not blindly redirect server endpoints to it.

## Source implementation in this PR
- Server-generated random 256-bit recruiter invitation token, 48-hour expiry; store SHA-256 digest only; bind invite to the verified addressed email, reject replay and mismatched signed-in identity.
- Use existing named/MFA Operations session plus a separate explicit Founder allowlist for issuing invitations and reviewing applications. No email commands authorize administrative action.
- Separate approval, pending review, suspension and rejection; approval alone does not imply verified identity, completed agreement, taxable status or bank eligibility.
- Native independent Recruitment workspace, verified-email invitation acceptance, count of own introduced Operators and Travelers. Do not mistake introductions for qualified Operators or completed paid Travels.
- Approved recruiter links are permitted to use americanrider.tech only after an explicit live app-link verification and legal/program gates; old Traveler link default remains until safe migration.
- Payment program, reward credits and actual bank transfers remain disabled. No banker/SSN fields are collected by our app.

## Release blockers
1. Actual Apple AASA and Google assetlinks association files with genuine App Store team ID and Google Play signing SHA-256, signed-device test, landing link preserving attribution across sign-in and installation, and first-party QR rendering from the final tested referral URL. No invented signing details.
2. Approved legally reviewed recruiter agreement, proper clear FTC material compensation disclosure beside each recruited recommendation/link, verified identities, geographic/Operator eligibility and anti-fraud rules.
3. Selected and enabled secure hosted recipient banking and tax onboarding provider. Validate actual account eligibility, pricing, identity/tax status and returned/failed payout webhooks. Stripe Global Payouts US tax reporting is currently listed as private preview in its documentation and cannot be assumed. Consult payment counsel and retain verified evidence.
4. Ratified economically funded reward schedule with immutable paid-travel ledger, refunds, disputes, reversals, held/available/paid states, payment batch funding, tax reporting, and complete synthetic plus real test-mode reconciliation. Prior 15c per Travel x 200 = $30 cap and $25 batching is an illustrative, unapproved design.
5. Real iPhone + Android recruitment walkthrough; production signed App Store/Google Play release and reviews remain separate from code tests.

## Reference guidance
Apple: https://developer.apple.com/documentation/xcode/supporting-associated-domains
Android: https://developer.android.com/training/app-links/configure-assetlinks
FTC: https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking
Stripe Connect: https://docs.stripe.com/connect/how-connect-works
Stripe Global Payouts tax: https://docs.stripe.com/global-payouts/tax-reporting

Launch flags: AR_RECRUITER_INVITES_ENABLED, AR_RECRUITER_FOUNDER_USERS, AR_RECRUITER_PROGRAM_ENABLED, AR_RECRUITER_LEGAL_SIGNOFF, AR_APP_LINKS_VERIFIED, AR_REFERRALS_ENABLED. These are OFF/empty by default. No Founder approval or feature enablement substitutes for bank/legal/regulatory evidence.
## 24 October addition: private recruiter website source
New scripts/corporate-recruiter-portal.cjs and scripts/corporate-recruiter-accept.cjs generate /recruiters/portal/ and /recruitment/accept/ on the founder-owned Render static site. They use the existing Firebase identity with email/password/Google/Apple options, verified-email checks, and the same canonical server-owned /recruiters/me, /recruiters/accept and /recruiters/link authorization. The invitation token is kept only in the browser process and removed from visible URL via history.replaceState; both pages declare noindex and no-referrer. The public /recruitment/ page links to this private entrance. This is source and test coverage ONLY, not verification that Firebase Authentication authorizes the new .tech domain or the canonical Cloud Run service has the routes/CORS. Verify real live sign-in, CORS, React native/website mobile browsers and HTTP routes before turning on invitation flags. No bank, signed agreement or paid recruiting has been enabled.
