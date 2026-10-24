# American Rider — referral handoff, engineering and legal review
**24 October 2026 | Source-only PR #288, founder review. No public enrollment, rewards or bank payouts enabled.**

## Practical answer: what happens after scanning a code?
One role-specific canonical HTTPS link `https://americanrider.tech/join?r=<code>&role=operator|traveler` underpins text messages and QR codes. The QR encodes the very same URL, never a QR-only account or separate identity. The `r` is a PUBLIC referral identifier, not proof of permission, reward or identity.

| Recipient | Installed app | App not installed |
| --- | --- | --- |
| Operator | After REAL signed Apple Universal Link/Android App Link association, opens `/join`, stages the verified role-specific code, then moves into eligible Operator qualification; no unopened market may onboard | `.tech` shows a role-specific landing and copyable code; when verified Store listings exist, present correct store entry; ask to reopen original message after install or enter the code at Operator qualification |
| Traveler | After verified association, opens `/join`, stages Traveler code through sign-in, then submits one server claim after verified identity | `.tech` shows Traveler instructions and copyable code; after installation enter code at optional account-creation role choice if the installation cannot recover the link |
| Existing Traveler becoming Operator | Separate Operator-role introduction only before Operator qualification/commissioning | Same referral link/code, with independent server-backed eligibility. Existing Traveler attribution cannot be re-labeled as a new Traveler |

**Important limits:** Neither Apple nor Android automatically preserve the original referral through a fresh installation just because the website linked to a store. Apple offers Smart App Banners and `app-argument` with valid Store ID; they help users reopen context but do not entitle us to promise seamless deferred deep linking. Android offers Play Install Referrer API; implement and verify it only with an actual Play listing, signed package and native module. Manual code is the cross-platform fallback and requires no fingerprinting, PII in URL, contact upload, third-party attribution SDK, or separate app.

## Current code corrections in this PR
- Declared intended associated HTTPS domain `americanrider.tech` on iOS and verified-path intent on Android. **These declarations are not verification:** publish the correct `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` only with actual Apple Team ID/bundle ID and Play App Signing SHA-256 fingerprint; validate Content-Type, HTTPS, redirect behavior, correct bundle, signer and physical signed-device behavior.
- New future personal codes are 12 easily-spoken unambiguous characters. Existing 8–32 character stored codes remain valid. Referral server owns creation and lookup; duplicate/new account/draft Operator scenarios are protected with transactional immutable `uid_role` claims.
- New public invitation issuance restricted to `.tech` only after explicit native-association flag; legacy `.app` links may still be accepted as backward compatibility, NOT newly minted.
- Static `/join/` landing presents the appropriate instructions for Traveler and Operator, shows the code, and removes referral parameters from displayed browser history. No fake App Store/Google Play URL or misleading automatic-install promise.
- Account role choice can stage an optional manually entered code for **either** role; Operator qualification offers optional code, and Traveler Home retries staged claims when a verified account returns to focus. Existing Traveler **Invite a Traveler** screen is not redesigned.
- Recruiter portal sharing includes a plain-language compensation disclosure alongside shared link. The private portal does not fetch another recruiter's data or expose bank details.
- No change to live Operator share, Traveler pricing, Stripe, booking admission, national market opening or commercial payouts.

## Published engineering comparison (not an endorsement)
1. **Apple HIG / Universal Links:** a normal URL should open the installed app when the web association and entitlement match; otherwise, it must provide a useful website. Keep one entry, clear content, and recovery without unnecessary steps. https://developer.apple.com/documentation/xcode/allowing-apps-and-websites-to-link-to-your-content
2. **Apple Smart App Banners:** only add a real Store `app-id` and accurate `app-argument` once published. Do not invent App Store ID. https://developer.apple.com/documentation/webkit/promoting-apps-with-smart-app-banners
3. **Google Android App Links:** use HTTPS assetlinks with Play signing certificate. For deferred Android install, Google Play Install Referrer is separate and should be checked once at first installation, without trusting a client claim for compensation. https://developer.android.com/training/app-links/about and https://developer.android.com/google/play/installreferrer
4. **Uber H3:** location indexing is valuable *later* for aggregation of approved market recruitment performance or supply/demand, NOT for identifying referral ownership or granting booking. If used, use coarse aggregate cells with minimum anonymity thresholds, no precise recruiter-traveler tracking and still enforce authoritative actual market eligibility. https://h3geo.org/docs/
5. **Google SRE:** reuse the one referral-code registry and immutable claims, avoid multiple counters/links/pollers/vendors, and ship deterministic bounded tests with operational evidence. https://sre.google/sre-book/simplicity/
6. **Uber public referral guidance:** allow link and manual code, disclose qualifying activity, provide accurate status rather than paying for clicks. We do not copy its variable offer or design. https://help.uber.com/driving-and-delivering/article/signing-up-with-an-invite-code?nodeId=a1dc4e69-ca50-46ce-ba0d-d133ee5c2578

## Published legal/counsel research (no attorney was contacted or retained)
- FTC endorsement guidance: independent recruiters compensated for recommendations need clear and conspicuous disclosure with the recommendation, link and any QR sign, not only behind Terms. Proposed direct message: *“I may receive compensation if you join American Rider through this invitation and meet applicable requirements.”* https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking
- Classification: labeling someone an independent recruiter does not decide employment classification. US DOL proposed revised classification guidance on 26 February 2026. Qualified national and state employment counsel must review actual control, business practice, tax status and state-by-state obligations BEFORE offers. https://www.dol.gov/agencies/whd/flsa/misclassification/2026rulemaking/faqs
- IRS: 2026 Form 1099-NEC generally uses a $2,000 reporting threshold for qualifying nonemployee compensation, **not a tax exemption**. Verify entity/payee type, backup withholding and state reporting with tax advisers. https://www.irs.gov/businesses/small-businesses-self-employed/am-i-required-to-file-a-form-1099-or-other-information-return
- Counsel should approve recruitment agreement, compensation schedule, clawbacks, affiliation disclosure, truthful independent status, solicitation restrictions and consent-based outreach. Bank/tax details go only to a vetted hosted onboarding provider. No unapproved Friday schedule, automated ACH or rewards.

## Device + release acceptance matrix: must be EVIDENCED
1. iOS **installed**: from Messages QR/link, verify exact `.tech/join` URI opens signed TestFlight app, correct role/code, then verified sign-in and immutable claim.
2. iOS **not installed**: Safari website remains useful and copies code; after official Store download, reopen original link from Messages or manually enter code, confirm one claim. No claimed automatic deferred attribution.
3. Android **installed**: verify assetlinks with real Google Play signing fingerprint, both link and QR, direct app routing and correct role.
4. Android **not installed**: preserve role/code on landing, open real listing only when published, explicitly test Play Install Referrer if later added, with manual fallback.
5. New Traveler (all sign-in methods): verify after account creation/verified email; deferred claim retry on actual Home focus; no persistent spinner, no false reward.
6. New Operator: oral code, QR, text, preexisting draft, existing Traveler-to-Operator, expired or invalid code, wrong role, inaccessible/unopened service market.
7. Abuse: replay, self referral, multiple devices, old existing Traveler, once-commissioned Operator, suspended recruiter, email mismatch, forged QR, copied URL, concurrent claims. No clicks or mere installs may earn.
8. Economic events: only qualifying captured, completed, non-refunded non-disputed real Travels; cap, cohort, approved schedule, dispute reversal, tax and verified funding, immutable payout ledger; separate from Operator 99% fare.
9. No leaked PII, no contact scraping, no browser/analytics full URLs containing secret recruiter invitation tokens, no code accepted as authority to operate.
10. Verify website's exact deployed SHA, Cloud Run's exact live API SHA, GitHub CI twice, signed native app binaries and actual Store publication separately. **No code/test-only approval.**

**Launch stance:** recruiter enrollment and money remain OFF; AASA, assetlinks, Store IDs, signed-device tests, independent counsel and bank/tax commissioning remain open. This review does not itself open a market or publish an app.
