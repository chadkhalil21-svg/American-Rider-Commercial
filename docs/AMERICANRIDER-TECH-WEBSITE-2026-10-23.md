# American Rider | New corporate website source (October 23, 2026)

**Status:** prepared website source on a review branch; not deployed and not proof that `americanrider.tech` resolves to Google. Do not describe Firebase or new email as active until external verification.

## Editorial decisions
- The Founder selected `americanrider.tech` in an account he controls.
- Retain the existing national identity and the dark navy *Designed to serve the nation* section from the founder's screenshot, with corrected text contrast.
- Follow the institutionally restrained navy/ivory aesthetic in the October 2026 investor presentation; use its product facts, not its confidential investor copy or claims of traction.
- Homepage states the service plainly: *A national transportation platform.* No slogan needed.
- Preserve: one agreed Traveler Total; Operators retain 99% of Travel Fare; minimum $2.50 separate Platform Fee included in Traveler Total; qualified Operators and service-area constraints; Smart Travel OFF; recruiter enrollment OFF. Do not invent bookings or an active recruiter payment system.
- Hero photo is the previously accepted licensed Unsplash editorial image, labeled illustrative. Do not imply American Rider operates a luxury fleet.
- Follow Apple writing/accessibility recommendations and the repository Council design standard as *reference frameworks*, not approvals from actual advisers.


## Council design refinement (October 23)
- **NASA:** Large, readable mission-led opening, a clear hierarchy, and straightforward navigation; reference: https://www.nasa.gov/nasa-missions/ . No NASA relationship or endorsement is claimed.
- **Lockheed Martin:** Explain capabilities and operating requirements in plain, structured language, never treating an aspiration as verified service; reference: https://www.lockheedmartin.com/ .
- **Emirates:** Clear service information and attentive customer pathways, without borrowing luxury cabin or company-owned fleet claims; reference: https://www.emirates.com/us/english/experience/fly-better/ .
- **Blacklane:** Service-specific entry points and restrained travel photography, but no false booking form while public app booking is unavailable; reference: https://www.blacklane.com/en/press/releases/blacklane-unveils-new-brand-and-enhanced-corporate-travel-booking-platform/ .
- **Apple:** Consistent vocabulary, accessible contrast, plain-language labels and actions; reference: https://developer.apple.com/design/human-interface-guidelines/writing .
- Retain **SAFE. RELIABLE. AMERICAN.** as a restrained service-principles signature in the dark national section. These are standards American Rider intends to meet, not a promise that transportation can never be unsafe.
- Recruitment has an email inquiry action addressed to **relations@americanrider.tech**, not an application, commission enrollment or approval workflow. The address must be verified in Cloudflare forwarding before this site is published.
- Reuse existing source legal documents and translations; do not publish the confidential investor deck or substitute its illustrative pricing for the current minimum $2.50 Platform Fee.

## Source and verification
Run `node scripts/build-corporate-website.cjs` to generate `dist-corporate/`. This produces a static website with routes for /, /travel/, /operate/, /safety/, /company/, /support/, /recruitment/, /smart-travel/, /join/, /terms/, /privacy/, and /account-deletion/. English and four already-source-supported legal translations are generated from the existing backend legal documents. No legal text is rewritten and no paid service is changed.

Run `node backend/corporate-website.test.js`. The new pages intentionally contain `@americanrider.tech` mail links **not yet commissioned**. Do not deploy public DNS or publish this build until incoming Gmail forwarding and outbound authentication work, or temporarily use already-verified old support contact information with explicit transition disclosure.

`firebase.json` adds *hosting only* beside the existing Firestore and Storage configuration. Deploy **only** the Hosting target, never `firebase deploy` without an explicit `--only hosting` selector. In an authorized Firebase CLI session for existing project `american-rider-35688`, build then deploy to a preview channel first. Verify responsive website, legal pages, 404 behavior, email links, photography license and the founder-approved copy. Verify production Hosting/project identity before switching Cloudflare DNS and HTTPS. Use the official Firebase custom-domain wizard's exact DNS instructions; do not guess records.

## After review
1. Check live Google project and hosting target, then grant the necessary CI authorization; no credentials in GitHub source.
2. Configure actual Cloudflare mail forwarding to the institutional Gmail account and SPF/DKIM for Resend/SES before publishing new aliases.
3. Validate authenticated mobile links, Firebase Auth allowed domains, Stripe callbacks, Apple/Android app links and founder commands before retiring old endpoints or Render.
4. Keep existing `.app` and legacy Render routing solely as technical fallback until all known dependents have been verified and migrated. The founder has not launched publicly; do not unnecessarily extend marketing of the old domain.
5. Review current legal notices with counsel. Do not replace source legal documents with shorter marketing copy.

**Sources:** `docs/COUNCIL-STANDARDS.md`, `docs/WEBSITE-DESIGN-STANDARD-2026-10-23.md`, `backend/legal.js`, current `PROJECT-LEDGER.md`, founder-supplied deck and screenshot, Apple HIG Writing and Firebase Hosting documentation.
