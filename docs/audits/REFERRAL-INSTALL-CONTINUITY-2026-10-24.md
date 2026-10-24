# American Rider | Referral continuity, platform design, legal review

**24 October 2026. Source-only PR #288. Paid recruitment OFF. Not merged, deployed, signed-device verified, or commercially commissioned.**

## Founder direction

AmericanRider.tech is the public invitation and recruiter workspace domain. The only native app remains the existing Traveler/Operator app. Preserve the Traveler “Invite a Traveler” screen, its native Share behavior and no Traveler QR control. Recruiters work through the secure website. A recruiter/Operator may provide the same personal identifier by HTTPS link, QR or spoken code. No location-specific public recruitment copy or speculative rewards. The iOS/Android app ID `com.americanrider.app` does not change with the web-domain migration.

## Reference comparison and selected engineering practice

| Guidance | Consequence for American Rider |
| --- | --- |
| Apple Universal Links and Associated Domains | One owned HTTPS origin; an installed signed app can open `/join` and preserve the URL. An uninstalled app opens the website, not an automatically credited install. Host a genuine AASA with actual Apple team/app identifiers. |
| Apple Smart App Banner | Optional later, once a real App Store listing is confirmed. Pass an `app-argument` for resuming context when appropriate; never promise automatic attribution across a fresh installation. Apple's Safari may keep same-origin navigation in Safari. |
| Android Verified App Links | Add narrow `https://americanrider.tech/join` app intent and publish `.well-known/assetlinks.json` with real Google Play signing SHA-256. No guesswork about signatures or published listing. |
| Google Play Install Referrer | Consider a separate native, signed build path for Android installation continuity once listing and Play distribution exist. Do not label it implemented, and retain manual recovery for side-loading and unsupported devices. |
| Apple HIG and Google SRE | Referral is optional, never a prerequisite to Travel or Operator qualification. One concise optional code entry, visible feedback, no continuous polling, and predictable retry for temporary network failures. |
| Uber published driver referrals | Code and link coexist; attribution is distinct from the later qualifying activity and reward. Competitor terms are a benchmark, not our company contract. |
| Uber H3 | A grid can eventually support privacy-filtered, coarse *geographic reporting* of recruiting outcomes. It must not be used as a referral identifier, a required launch database, a way to infer an Operator's live location, or a new business gate. |
| FTC Endorsement Guides | Paid or potentially paid recommendations require clear, nearby material-connection disclosure, including text links and alongside QR materials. A personalized code alone may not suffice. |
| IRS and employment law | Independently review worker classification, state solicitation and independent-agent requirements, payout/tax onboarding, returns and 1099 obligations before promises. 2026 1099-NEC $2,000 reporting threshold is not a tax exemption; the Department of Labor's February 2026 classification proposal is a proposal, not clearance. |
| CAN-SPAM / outreach | No recipient-address harvesting, bulk recruiter spam, automated marketing email or unsolicited robotexts. If marketing is later authorized, add consent/suppression and statutory sender/unsubscribe controls subject to qualified review. |

References: Apple https://developer.apple.com/documentation/xcode/supporting-associated-domains ; https://developer.apple.com/documentation/xcode/allowing-apps-and-websites-to-link-to-your-content ; https://developer.apple.com/documentation/webkit/promoting-apps-with-smart-app-banners ; https://developer.apple.com/design/human-interface-guidelines/onboarding . Google https://developer.android.com/training/app-links/about ; https://developer.android.com/training/app-links/configure-assetlinks ; https://developer.android.com/google/play/installreferrer . Reliability https://sre.google/sre-book/simplicity/ . Uber https://www.uber.com/us/en/blog/h3/ ; https://help.uber.com/driving-and-delivering/article/referring-drivers?nodeId=03db9e2b-270b-4fdb-95a7-afce7c6b4b3b . FTC https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking ; https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business . IRS https://www.irs.gov/businesses/small-businesses-self-employed/am-i-required-to-file-a-form-1099-or-other-information-return . DOL https://www.dol.gov/agencies/whd/flsa/misclassification/2026rulemaking/faqs .

No person, counselor, university, company, or representative was directly contacted. These are **published benchmarks**, not external legal advice, institutional endorsement or approvals.

## End-to-end intended behavior

1. Authorized recruiter obtains ONE server-owned, stable, readable 12-character code. The code is public attribution data, NOT a payment secret. Old 24-character codes remain valid; a QR uses exactly the role-specific personal URL.
2. Installed app: OS-verified `https://americanrider.tech/join?r=CODE&role=operator|traveler` enters existing `app/join.tsx`, validates role and code, and locally stages it until identity and role are known.
3. No installed app: first-party `/join/` landing identifies Operator versus Traveler, displays/copies the code and plainly explains how to retain or reopen it. **No invented store links**. Later, publish verified real store CTAs and optional native install referrer functionality. iPhone users can reopen their original message/link after installing; both roles can manually enter a spoken/copied code when prompted.
4. Sign-up and role choice: account creation remains normal. Optional code is shown for both roles after signup, without adding permanent fields to Traveler booking. Operator code is also available on the existing qualification screen only when market ACTIVE. Outside open geography, keep Operator enrollment closed.
5. After verified email and appropriate role, backend checks registry ownership, recruiter status, duplicate prior role and previous attribution. A first eligible claim creates ONE immutable `referral_attributions/{uid}_{role}`; clicks, installs and QR scans never produce earnings.
6. Intermittent network: retain a pending code on the device for <=72 hours; retry on relevant screen revisit without hourly polling. This is not a promise that a new store install transfers local website storage into app storage.
7. Rewards remain disabled until an independently approved agreement, funded reward terms, actual completed paid Travels, returns/refunds and bank/tax provider reconciliation. Referrer can see only their OWN private aggregates, not invitees' personal data.

## Verification matrix required before launch

- iPhone with signed app installed: Messages and Camera QR open `/join` in app, code and role survive sign-in and app restart; Apple Safari same-domain behavior tested separately.
- iPhone without app: Safari landing keeps code and correct role; after actual App Store install, reopening the original message and manually entering the code both attribute correctly. Confirm no claim is fabricated by merely installing.
- Android with signed app installed: genuine `assetlinks.json` validated with Play signing SHA; Messages and QR launch in app without an interception prompt.
- Android without app: site landing works; store redirect is tested only after genuine listing; optional Install Referrer is separately proven in Play distribution, else manual code works.
- Traveler: both automatic and manual code paths work without changing the existing Invite a Traveler screen. Existing Traveler and past-paid Travel cannot be presented as a new Traveler.
- Operator: fresh Operator in active market can claim, including if a draft qualification record already exists; closed-market enrollment stays blocked and cannot be bypassed by a referral.
- Revocation: a previously issued recruiter link cannot produce a new claim after recruiter suspension; existing immutable accounting evidence is preserved for review.
- Risk: malformed role or code, expired stored referral, self-referral, duplicate claim, forwarded recruiter *account invitation*, code on shared devices, invalid signatures, referral after qualifying role, network retries, and refund events.
- Validate five app languages and accessibility screen-reader labels. Verify no email harvesting, secret token exposure, bank field, fake earnings balance, automatic contacts permission or paid transfer in prelaunch code.

## Material source changes in PR #288

- `app.json`: scope Apple/Android association intent to founder-owned domain and /join path, without fabricating server-side AASA/assetlinks proofs.
- `backend/referral-service.js`: readable code generation and suspension checks, transactional immutable first attribution.
- `app/join.tsx`: invalid roles rejected instead of silently becoming Traveler.
- `src/screens/AuthScreen.tsx`: optional code capture during role choice; `app/index.tsx` and `app/operator/qualify.tsx`: verified account recovery and offline retry, preserving correct open-market policy.
- `scripts/build-corporate-website.cjs`: first-party landing copy accurately explains installation recovery for both roles; existing corporate private recruiter portal preserves strict account verification.
- `backend/referral-link-recovery-contract.test.js`: regression checks without network or financial transactions.

## Remaining external blockers

Publish actual AASA and assetlinks with verified Apple Team ID/Google Play signing certificate; source-reviewed domain delivery with HTTP 200, correct content type and no redirects; confirmed store URLs and real iPhone/Android TestFlight/Play device tests; accepted compensation terms, clear disclosures in every relevant promotional channel and printed QR; recruiter agreements, authorization and classification review by licensed counsel; hosted bank/tax onboarding; funded accounting, settlement/refund reconciliation; CI pass twice, manual merge and actual deployment verification. No automatic national recruitment or paid compensation is active from this document.
