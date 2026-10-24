# ADR 0045 | Independent referral partner self-service account and payout separation
Date: 2026-10-24
Status: Founder UX direction; profile source PR; paid commissioning remains OFF

## Intended journey
American Rider invites an independent referral partner, not an employee. A Founder-authorized invitation includes a 48-hour one-use email link. The invited person opens it, **creates an American Rider account** with email/password or Google/Apple, verifies the SAME invited email, accepts the invitation and enters a private recruiter dashboard. Issuing the invitation IS the Founder participation approval: no second manual approval queue. A participant can save their display name, and eventually manage a personal referral URL/QR and own verifiable commissions. No separate recruiter app, formal employment application, uploaded paper W-9 or collection of bank routing numbers in the American Rider page.

## Existing versus new
The recruitment acceptance website ALREADY contains the Create account button, Firebase email/password account creation, verification email, Google/Apple sign-in, one-time accept and redirect to the private dashboard. The new change adds private authenticated profile-name self-service and tests. This is a DISPLAY NAME, not verified legal identity or payout onboarding.

The 24 October recruiter invitation command and settled-Travel activity source were merged in PR 293 and deployed to Render, not independently confirmed on the separate Cloud Run backend. Recruitment activation and compensation remain disabled. Travel observations do not equal earned commissions, and refund/dispute reversal, full financial ledger and bank payout execution remain outstanding.

## Distinguish personal taxes from the payer's duties
Independent partners are responsible for declaring and paying their own income taxes. American Rider is not proposing employee payroll or employer-style onboarding. Yet the company must identify WHERE promised commission funds come from. If a commission is allocated from American Rider's retained Platform Fee, it is American Rider-funded even when a provider handles money movement. The selected transaction design determines who is the actual payer of record and what, if any, payer reporting/withholding is required. Calling this simply a software revenue opportunity cannot erase those duties. Operators' seamless Stripe Connect experience is the UI reference, not conclusive proof that their tax classification/1099 type applies to independent recruiters. Do not claim the platform pays nothing until the funding agreement and real flow prove that claim.

Relevant authority:
- https://www.irs.gov/businesses/small-businesses-self-employed/reporting-payments-to-independent-contractors
- https://www.irs.gov/instructions/i1099mec
- https://support.stripe.com/questions/1099-tax-reporting-and-filing-for-platforms-and-marketplaces
- https://support.google.com/youtube/answer/10391362
- https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking

## Minimal engineering sequence
1. Verify Google Cloud Run exact API version, real email invitation, new Firebase account, email verification, acceptance, private name save, login/logout/suspension in a signed browser. Render alone cannot establish this.
2. Commission real identity and signed terms only once, with ordinary product language. Publish the compensated referral disclosure. The user can then share link/QR when the actual App Store/Android handoff is proven.
3. Commission durable, idempotent held/available/paid/reversed commission events from **authoritative captured/settled Travels**, including refunds, disputes, duplicates and dual-role funding. No arbitrary 15-cent per Travel, 200 cap, $25 minimum or Friday schedule until approved and funded. Preserve Operator 99% Fare and quoted Traveler Total.
4. Select a secure hosted bank/payment onboarding partner based on actual eligibility, fees, risk, whether it handles applicable payer reporting and ACH returns. Show a single "Set up payments" control after commissioning. Recruiters handle their personal tax returns; provider and the party legally liable manage necessary information reporting.
5. Independently test credit/reversal, provider transfer, returns, lost-device retries, signed iOS/Android association and suppression after suspension before enabling real money or new geographic promises.

## Council reference
Ford: reuse a single Firebase account and Operations, no extra recruiter app. Jobs/Apple: account creation, direct private dashboard and unmistakable saving/error states. Rockefeller: commissions must be funded from real available unit economics, with bank fees and chargebacks. Google SRE: automatic, bounded event-driven reconciliation. These are published design principles, not direct communications with Council figures or lawyers.
