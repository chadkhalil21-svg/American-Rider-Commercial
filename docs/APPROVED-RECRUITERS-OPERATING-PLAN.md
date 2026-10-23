# Approved recruiting · Founder operating procedure (not launched)

**Founder:** One phone, minimal intervention. **Current status:** A guarded recruiter identity primitive exists on this PR, but there is **no live recruiter hiring screen, no approved independent recruiter account, no issued/verified QR, no live payment processing**. Do not invite people to begin commission-earning recruitment or advertise the proposed rate yet.

## How it should work in plain English

1. **Hire/select:** Founder chooses a qualified adult for paid recruiting, agrees to clear written terms and lawful marketing practices. This is an **invitation-only** program, not public self-enrollment. Recruiters may be existing approved Operators or approved independent partners.
2. **Identify:** Partner uses **one existing Firebase-authenticated American Rider identity**. Backend Operations records the verified legal identity, accepted contract and eligible scope in a separate **server-only** `recruiter_approvals/{uid}` record. Store bank/identity artifacts only with approved providers/private documents, not public URLs or client-readable referral records.
3. **Approve:** Founder uses a future protected, MFA-backed Operations action to approve, renew, suspend or revoke. That action **does not yet exist**; writing an approval through a public signup route is forbidden. An authorized server record includes `status: approved`, `identityVerified: true`, `agreementAccepted: true`, `payoutEligibilityVerified: true`, allowed destinations, audited `approvedBy`, timestamp and expiry. Client Firestore rules already deny reads and writes to this collection by default.
4. **Invite:** Once properly commissioned, recruiter signs in to a **small private web view**, chooses **Invite an Operator** or **Invite a Traveler**, then uses SMS/share or optionally displays a QR. **This page is not yet implemented.** Every method conveys the **same opaque, server-issued personal URL**, never a name, phone number, trip record or new URL for each recipient. QR is not yet implemented or live.
5. **Attribute:** The new participant follows the URL, installs/opens the actual signed app, registers and becomes attributable to that recruiter once. The existing referral backend has partial locked attribution, but **real app-store association and after-install handoff are unverified**.
6. **Track:** Recruiter sees **only aggregate progress**: number of eligible Operators/Travelers, qualified Travels, capped reward amount, pending/approved/paid earnings and problems. No recruit names, routes or payment details. This view is not yet built. Avoid continuous listeners; fetch a bounded summary on opening the screen and refresh after verified accounting changes.
7. **Pay:** Proposal is **15 cents for each of the first 200 qualifying settled paid Travels, maximum $30 per recruited role**. When an Operator and Traveler are both referred by separately approved paid recruiters, reserve up to **30 cents** on the same Travel **before** promising it. Never deduct from Operator 99% Fare. Use a funded, idempotent server ledger and **batched** approved cash payouts; do not send a 15-cent bank transfer for every Travel. Settlement, payout, reversals, tax and refund processing **do not exist yet**.

## What this PR actually provides

`backend/recruiter-approval.js` provides only a **server-side fail-closed eligibility check**, then reuses `backend/referral-service.js::shareLink`. This helper has **no production route or client screen** and returns program OFF without a single database read unless a future reviewed feature deliberately activates it. With explicit test-only enablement, it reads **one indexed, direct approval document** (not a collection scan) and writes a personal code **only on first issuance**, never per share or QR scan.

**No approval, no link.** Missing agreement, unverified identity, unverified payout eligibility, expired agreement, disallowed role and suspension all deny new paid-recruiter links. Existing recruiter codes also require a future *claim-time authorization check* so a suspended recruiter cannot gain new compensated signups by resharing an old QR. Until that is implemented, keep program OFF.

**Important separation:** Ordinary Travelers keep the existing **Invite a Traveler** page unchanged and receive no rewards or credits. Approved Operators use the Operator Invitations page, but its verified paid-referrer permissions and earnings/payout path are unfinished. Independent partners must not be automatically treated as Operators or given operator qualifications.

## Unfinished hard gates

- Founder-only recruiter approval/revocation action via existing protected Operations sign-in, with audit trail, document and identity checks; no public registration.
- Simple authenticated recruiter web view, scoped Share button, a QR displaying the exact same URL, progress/earnings and plain terms. No second app.
- Check suspended/expired/unauthorized recruiter identity at the moment of **claim** and again before reward release, including duplicate/related accounts and teen exclusions.
- First-party app-store verified iOS/Android association, safe recovery after install and explicit compensated-endorsement disclosure on sharing/QR/landing.
- 30-cent worst-case per-Travel funding and initial business budget, plus production event-driven held/released ledger, reconciliation, taxes and Stripe-supported separate payout.
- Independent legal counsel review of contractor/employee classification, recruiting conduct, applicable tax obligations, marketing claims and worker protections.
- Exact-head CI, signed device and Stripe sandbox end-to-end testing before any money or public claims.

## Published standards (not direct adviser endorsements)

[Apple sharing](https://developer.apple.com/design/human-interface-guidelines/collaboration-and-sharing), [Android App Links](https://developer.android.com/training/app-links/about), [Google SRE on toil](https://sre.google/sre-book/eliminating-toil/), [Firestore billing](https://firebase.google.com/docs/firestore/pricing), [Stripe Connect payout eligibility](https://docs.stripe.com/connect/cross-border-payouts-to-recipients), [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests), [FTC Endorsement Guides](https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking).
