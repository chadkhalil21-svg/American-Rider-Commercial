# Approved recruiting · Founder operating procedure (not launched)

**Founder:** One phone, minimal intervention. **Current status:** A guarded recruiter identity primitive exists on this PR, but there is **no live recruiter hiring screen, no approved independent recruiter account, no issued/verified QR, no live payment processing**. Do not invite people to begin commission-earning recruitment or advertise the proposed rate yet.

## How it should work in plain English

1. **Hire/select:** Founder chooses a qualified adult for paid recruiting, agrees to clear written terms and lawful marketing practices. This is an **invitation-only** program, not public self-enrollment. Recruiters may be existing approved Operators or approved independent partners.
2. **Identify:** Partner uses **one existing Firebase-authenticated American Rider identity**. Backend Operations records the verified legal identity, accepted contract and eligible scope in a separate **server-only** `recruiter_approvals/{uid}` record. Store bank/identity artifacts only with approved providers/private documents, not public URLs or client-readable referral records.
3. **Approve:** Founder invitation is the initial authorization. After the approved email, identity and terms are verified, a future protected, MFA-backed Operations action can activate, renew, suspend or revoke without requiring a second routine Founder approval. That action **does not yet exist**; writing an approval through a public signup route is forbidden. An authorized server record includes `status: approved`, `identityVerified: true`, `agreementAccepted: true`, `payoutEligibilityVerified: true`, allowed destinations, audited `approvedBy`, timestamp and expiry. Client Firestore rules already deny reads and writes to this collection by default.
4. **Invite:** Once properly commissioned, recruiter signs in to a **small private web view**, chooses **Invite an Operator** or **Invite a Traveler**, then uses SMS/share or optionally displays a QR. **This page is not yet implemented.** Every method conveys the **same opaque, server-issued personal URL**, never a name, phone number, trip record or new URL for each recipient. QR is not yet implemented or live.
5. **Attribute:** The new participant follows the URL, installs/opens the actual signed app, registers and becomes attributable to that recruiter once. The existing referral backend has partial locked attribution, but **real app-store association and after-install handoff are unverified**.
6. **Track:** Recruiter sees **only aggregate progress**: number of eligible Operators/Travelers, qualified Travels, capped reward amount, pending/approved/paid earnings and problems. No recruit names, routes or payment details. This view is not yet built. Avoid continuous listeners; fetch a bounded summary on opening the screen and refresh after verified accounting changes.
7. **Pay:** Direct bank ACH is preferred; **no recruiter Stripe Connect account and no $2 per-active-recruiter charge**. The historical **15 cents for the first 200 qualifying paid Travels ($30 maximum per recruited role)** is a **financial test proposal, not a law, accepted contract or authorized rate**. When an Operator and Traveler are both referred by separately approved paid recruiters, reserve up to **30 cents** on the same Travel **before** promising it. Never deduct from Operator 99% Fare. Use a funded, idempotent server ledger and **batched** approved cash payouts; do not send a 15-cent bank transfer for every Travel. Settlement, payout, reversals, tax and refund processing **do not exist yet**. A Friday ACH transfer may arrive on a later business day; do not promise Friday receipt without verified bank cutoffs.

## What this PR actually provides

`backend/recruiter-approval.js` provides only a **server-side fail-closed eligibility check**, then reuses `backend/referral-service.js::shareLink`. This helper has **no production route or client screen** and returns program OFF without a single database read unless a future reviewed feature deliberately activates it. With explicit test-only enablement, it reads **one indexed, direct approval document** (not a collection scan) and writes a personal code **only on first issuance**, never per share or QR scan.

**No approval, no link.** Missing agreement, unverified identity, unverified payout eligibility, expired agreement, disallowed role and suspension all deny new paid-recruiter links. Existing recruiter codes also require a future *claim-time authorization check* so a suspended recruiter cannot gain new compensated signups by resharing an old QR. Until that is implemented, keep program OFF.

**Important separation:** Ordinary Travelers keep the existing **Invite a Traveler** page unchanged and receive no rewards or credits. Approved Operators use the Operator Invitations page, but its verified paid-referrer permissions and earnings/payout path are unfinished. Independent partners must not be automatically treated as Operators or given operator qualifications.

## Unfinished hard gates

- Founder-only recruiter approval/revocation action via existing protected Operations sign-in, with audit trail, document and identity checks; no public registration.
- Simple authenticated recruiter web view, scoped Share button, a QR displaying the exact same URL, progress/earnings and plain terms. No second app.
- Check suspended/expired/unauthorized recruiter identity at the moment of **claim** and again before reward release, including duplicate/related accounts and teen exclusions.
- First-party app-store verified iOS/Android association, safe recovery after install and explicit compensated-endorsement disclosure on sharing/QR/landing.
- proven worst-case per-Travel funding and initial business budget, plus production event-driven held/released ledger, reconciliation, taxes and verified bank ACH (no recruiter Connect accounts).
- Independent legal counsel review of contractor/employee classification, recruiting conduct, applicable tax obligations, marketing claims and worker protections.
- Exact-head CI, signed device, bank-provider sandbox and refund/reversal tests before any money or public claims.

## Published standards (not direct adviser endorsements)

[Apple sharing](https://developer.apple.com/design/human-interface-guidelines/collaboration-and-sharing), [Android App Links](https://developer.android.com/training/app-links/about), [Google SRE on toil](https://sre.google/sre-book/eliminating-toil/), [Firestore billing](https://firebase.google.com/docs/firestore/pricing), [Nacha business ACH](https://www.nacha.org/content/faqs-ach-business), [Bank of America business ACH](https://business.bofa.com/en-us/content/ach.html), [FTC Endorsement Guides](https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking).


## Founder revision — bank-first, 23 October 2026

**Decision:** Recruiters are NOT required to open Stripe Connect accounts. Stripe stays for the separate Operator and Traveler money systems. Independent recruiters receive approved commissions into ordinary bank accounts, through bank-approved ACH origination or an authorized payment provider. The Founder must accept an actual provider quote and banking agreement before launch. Do not store routing/account numbers in referral records, logs, public URLs or source; use provider tokens.

**Identity and forwarding:** Founder chooses an email. Activation must be one-use, expire, and bind the verified email and authenticated identity. A forwarded email cannot give another person recruiter status. Email control is not full legal or payout identity verification. Recheck approval on old-link referral claims after suspension.

**Web:** The static recruiter preview file at public/recruiter-preview.html uses no private data or working buttons. It shows proposed recruitment, verified statistics, and bank payment panels, not active onboarding or real earnings. Real access requires secure authenticated server endpoints, unique personal links/QR, privacy-scoped totals, and provider-hosted bank onboarding.

**Bank ACH planner:** The unmounted backend/recruiter-ach-batch.js module sends NO money and is OFF. For future authorized Friday payouts it refuses unverified identities, bank details, legal approvals, holds, unfunded commissions and repeat batch IDs. It defaults to a proposed $25 weekly payout minimum; smaller amounts carry forward unless a verified final settlement applies. Production still needs atomic saved payment instructions, bank execution, reconciled acknowledgments/returns, crash-safe retries and remittance notices. Friday processing does not guarantee Friday receipt.

**200-Travel cap:** This was a $30 acquisition-cost guard at 15 cents per Travel, NOT legislation or an approved contractual rate. Do not promise an uncapped program, nor advertise 200 as an immutable rule. Run economic scenarios on acquisition cost, long-run net margins, fraud and retention, then adopt a documented versioned contract. Preserve 99% Operator Fare and an accurate Traveler Total.

**Legal and research boundary:** No lawyer, outside advisor, Council member, Apple or Google representative has personally reviewed these proposals. Obtain qualified legal and tax review before launch for worker classification, paid-endorsement disclosures, tax reporting, state laws, ACH authorizations and refunds. Published institutional advice is reference guidance only.

**Verified host status:** On 23 October 2026 Render reported the public static web platform and preview LIVE at release SHA 7400fd848c49734a69bc37986fd9f073272fadfa. This proves deploy completion, not public HTTP, custom-domain DNS, recruiter functionality, Cloud Run synchronization or signed-device behavior. This recruiter preview remains unavailable until a subsequent merge and matching Render deploy.
