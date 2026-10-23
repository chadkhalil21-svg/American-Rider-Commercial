# ADR 0042 — One referral link, both roles, one safe reward ledger (source-only proposal)

**22 October 2026. Status: PREPARED FOR REVIEW; not implemented in production and not approved compensation terms.**

## Founder objective
Grow Travelers and Operators through current Operators, Travelers and independent recruiting partners. One Founder operates from one phone, with no recruiting subscription, separate app, extra Operator qualification step or high-frequency Firestore polling. This ADR is a proposed extension of existing systems, not evidence of functioning links, legal approval, cash payouts or commercial onboarding.

## Closed loop, without six separate systems
There are **two invited outcomes**: an eligible **Operator** or an eligible **Traveler**. The inviter may be a Traveler, an Operator, or an approved independent partner. An existing American Rider account can participate in more than one capacity; the referral benefit is determined by the *invited outcome*, not a parallel account type. A verified account may have at most one credited inviter *for each invited role*, and never itself. When an existing Traveler later qualifies as an Operator, Operator attribution is possible only before Operator activation under the same rules. No recursive/multilevel commissions. No rewards for recruiting a recruiter.

## One link; zero new steps for the invited person
- An inviter sees **Invite an Operator** / **Invite a Traveler** sharing the same opaque, non-PII invitation ID and a role target in the URL. Independent partners receive the same site-based link. QR is only another representation of the URL; SMS/share sheet is primary.
- Use the existing domain `americanrider.app/join?r=OPAQUEID&role=operator|traveler`. **Not an active URL yet.** Link landing explains the role, shows one Continue action, and explicitly discloses any compensation. No names, phone numbers or trip histories in the URL. No Firestore writes on link clicks.
- Existing installs: Apple Universal Links / Android App Links require hosting exact verified AASA and assetlinks.json plus native app entitlements, signed build, and physical device tests. Current `app.json` contains only the custom `americanrider` scheme, not the required universal/app-link association. Never claim browser installation preserves an invite by magic.
- New installs: the website can direct to the store. On iOS the user may need to reopen the original invitation after installing because Universal Links do not by themselves defer attribution across installation; offer a visible, optional **Reopen invitation** fallback. Android Play Install Referrer could later support permitted post-install attribution, but requires native configuration and verification. Do **not** use Firebase Dynamic Links; discontinued in August 2025. Avoid fingerprinting.
- After authenticated signup or subsequent Operator role choice, server checks link's *server-owned* inviter identity and atomically fixes first eligible referral for the target role. Never trust an inviter UID supplied in the URL. Existing `app/operator/qualify.tsx`, insurance/screening/vehicle/Stripe onboarding remain completely unchanged and eligibility-gated. A referral cannot bypass geographical availability or compliance.

## Reward model, initially OFF
- No money/credits are paid for clicking, downloading, registering or unverified referrals. Only an authenticated settled paid Travel with verified participant identity can create a potential reward.
- Proposed Operator recruit reward: fixed, capped, and drawn **only from platform contribution**, never the 99% Operator Fare. A prior suggestion was a $10 milestone at 20 Travels followed by 25 cents over 160 more, up to $50. **NOT approved or implemented by the source-only helper.** Demand financing across the 180 qualifying Travels; don't advertise $50 until funded and legally approved.
- Proposed Traveler referral: consider a **small one-time credit** after the invited Traveler's first completed paid Travel; do not give the same user multiple enrollment gifts. No permanent per-Travel Traveler referral commission by default. Credit redemption must be a verified payment/quote feature, not an unaccounted discount.
- Every Travel can legitimately have both a referred Traveler and a referred Operator. Both rewards, if enabled, must draw from **one joint per-Travel budget** after Stripe processing, risk reserves, overhead and an independently approved retained platform contribution. If there is no budget, reward is not issued; terms must disclose qualifying conditions rather than promise a fixed award without financing it.
- Exact immutable reward identity: `programVersion + travelId + invitedRole + referredUid`. One source of truth, one idempotent settlement event, no cross-Travel double awards. Credits/payouts are released only after capture, refund/dispute hold and available funding. Refunds, chargebacks, reversals and consent revocation require clear compensating ledger entries, not silent deletion.
- Program may be OFF by market and role. Payments should be accumulated; monthly payouts above a reviewed minimum reduce external transfer fees. Reuse Stripe only after separate recipient onboarding, payout, bank, tax reporting and actual per-recipient fees have been validated. Operator Stripe payouts do not automatically prove a Traveler/recruiter is eligible to receive cash. Do not put recruiter transfers on the Operator's 99% fare transfer path.

## Cost and abuse constraints
- Never write a document for a QR scan or landing page view. One immutable claim per accepted role attribution, once per qualifying captured Travel; use fixed event keys for replay. Store short non-sensitive summary on user's existing profile where appropriate and avoid copying entire trip objects to recruiter views.
- Do not watch every Travel in realtime per recruiter, update a hot shared counter, scan old journeys repeatedly, or poll Firebase for referral progress. Read bounded, indexed pages only on opening the recruiter summary; monthly job works from immutable events only. Avoid unused field indexes and unbounded timestamps.
- Server rejects self/related identities, duplicate/competing claims, existing Operators/Travelers outside eligibility, suspended inviters, fraudulent/fake rides, canceled, refunded, disputed and synthetic Travels. Abuse rules must cover shared payment methods/phones/devices only in a privacy-preserving verified server process, not speculative fingerprinting.
- Identity of invited Traveler/Operator and all trip origin/destination/payment records stay private. Recruiter sees only aggregate counts and reward status, not identity, trip traces or bank information. Age/guardian rules forbid monetized Teen referrals by default. Paid recommendation disclosure is mandatory wherever relevant.
- Do not add Uber H3: its hexagonal grid is spatial technology and irrelevant to identity referral tracking. Preserve existing geohash dispatch architecture and ADR 0034.

## Build stages and acceptance
1. **This PR only:** pure validation/reward-budget helper plus synthetic tests and decision record; nothing is imported by production app/backend, no schema/index/payment/config changes, and no new native build.
2. **Next PR (after feature/amount approval):** dedicated authenticated claim endpoint, single server-side attribution per role, public landing URL, domain association files, existing sign-up/role handoff, simple Share link UI and optional invitee confirmation fallback. CI tests: iOS/Android installed, not-installed, reinstall, canceled signup, new/current user, mobile/browser and missing/dead links.
3. **Next gated PR:** immutable settlement-driven reward records and one-price budget guard, refund/dispute correction, cap/first-trip checks, partner summary and end-to-end simulation with simultaneous Operator+Traveler rewards on the same Travel. Verified server-side payment/credit integrations later, after separate review.
4. **Commissioning:** real signed devices and domain verification, permission of marketing channels, counsel sign-off on paid referral terms, labor status, consumer-disclosure, tax/KYC and minors; actual Stripe test-mode payout reconciliation. No live incentive claims before then.

## Published engineering/industry guidance, not literal counsel consultation
- Apple Universal Links: https://developer.apple.com/documentation/xcode/allowing-apps-and-websites-to-link-to-your-content
- Expo for iOS and Android: https://docs.expo.dev/linking/ios-universal-links/ and https://docs.expo.dev/linking/android-app-links/
- Google Play Install Referrer: https://developer.android.com/google/play/installreferrer
- Google Firebase Dynamic Links retirement: https://firebase.google.com/support/dynamic-links-faq/
- Uber referral terms (new users, actual trips, caps, fraud, referral invite status): https://www.uber.com/us/en/legal/referral-program-rules/
- Uber H3: https://h3geo.org/docs/
- Firestore cost, indexes, transactions: https://firebase.google.com/docs/firestore/best-practices and https://firebase.google.com/docs/firestore/manage-data/transactions
- IRS worker classification: https://www.irs.gov/taxtopics/tc762
- FTC material connection disclosure: https://www.ftc.gov/business-guidance/advertising-marketing/endorsements-influencers-reviews

**Authority:** Founder-requested review, not external legal advice. A qualified attorney has NOT been contacted in this work. Only independently licensed counsel may give a legal opinion about Florida recruitment, incentive contracts, tax rules, consumer rules or employee classification.
