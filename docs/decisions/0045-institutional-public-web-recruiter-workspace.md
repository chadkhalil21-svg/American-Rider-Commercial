# ADR 0045 — Institutional website and protected recruiting experience
Decision date: 2026-10-23
Status: Founder-directed website design proposal, NOT deployed to americanrider.app

## Decision
Adopt a complete, composed, phone-first corporate web experience in the established American Rider palette and typography: Travel, Operate, Safety, Support and About, with actual links and a clear public service status. A single common page shell provides accessible navigation, focused content hierarchy, realistic financial copy, restrained illustration, consistent legal footer and useful failure states. No CDN fonts, large photos, fake booking controls, fake user statistics, unverified public app-store links or marketing testimonials.

The founder directs private invitation-only recruiter work. Never make recruiter self-registration publicly available. A future private recruiter workspace belongs to the same brand and authenticated infrastructure, with no independent recruiter Stripe Connect account. No unapproved link, screen or payment function is activated by a visual preview.

## Council-inspired review, not actual consultation
Ford: reuse a single shell and event-driven invitations, not parallel manual programs.
Rockefeller: avoid paid payout accounts and tiny repetitive transfers; examine full acquisition economics before promising 15 cents x 200 Travels or a $25 cashout threshold.
Jobs and Apple: bold useful hierarchy, exact control labels, continuity from start to resolution.
First-class hospitality: understated tone, thoughtful assistance, clear error/empty states.
Harvard/Stanford/MIT research benchmark: test actual mobile users, information scent, real cost and business outcome rather than equating visual beauty with usability.
Google: measurable page speed, sensible semantic site structure, accessible and reliable operation.
These are interpretations of published principles, not correspondence or endorsements by institutions, counsel or Council figures.

## Deployment separation
The corporate HTML comes from backend/site.js and backend/legal.js through backend/server.js. The React Native Expo web static site on Render is distinct. The apex domain currently serves HTML not matching either currently connected Cloud Run or Render backend; DNS and legacy web host must be mapped before any merge is claimed live. A production backend code deploy does not by itself prove that the custom domain is serving it.

## Security and acceptance
Keep all recruiter code OFF until secure Founder authorization, single-use recipient-bound email activation, server-approved account, working /join and signed app links, privacy-scoped dashboard, bank-provider settlement and legal review. Static recruiter design preview is explicitly nonfunctional.
Require relevant GitHub CI, physical phone and keyboard inspection, domain HTTP content checks, and confirmed actual hosting target. Reserve production changes only for the provider actually serving the public domain; preserve Stripe, markets, safety and dispatch.


## Founder correction: national identity, not South Florida branding

The national platform identity is settled. The public homepage should never label American Rider a South Florida platform. National Transportation remains the wordmark and top-level positioning. An initial regional rollout is operational context, not the headline, hero illustration, or main service pitch. The homepage uses a neutral availability statement without implying nationwide bookings are already live. Detailed geography remains in actual service availability/operations disclosures, not corporate branding.

Apex domain routing is managed in Cloudflare DNS, and the corporate website content currently served by americanrider.app matches the older legacy https://american-rider-server.onrender.com host. The connected Render service https://american-rider-server-3d7x.onrender.com and Google Cloud Run have different, newer HTML. The old hostname is NOT listed among the services in the authenticated Render workspace, so this session does not have proven access to deploy code to that legacy origin. Pointing/validating the domain to a controlled host requires authenticated DNS/custom-domain access, safe certification and full health/deep-link checks.

## Recruiter bank portal and fees

There is NO commissioned recruiter bank enrollment portal. Once an approved payout provider is connected, recruiter's bank enrollment occurs through its hosted secure verification or approved tokenized API; private dashboard shows the masked destination and deposit status only. No raw routing/account numbers are collected in American Rider's public pages, Firebase referral documents or source control.

Published 23 Oct 2026 examples: Melio Go free account allows 5 free standard ACH transfers each month, then $0.50 per ACH. Its fully automated B2B payouts API remains restricted beta and cannot be assumed available. Dwolla uses individually quoted pricing for integrated higher-volume ACH. Bank of America business ACH supports business transfers/ACH files, but the actual account's origination charges and onboarding requirements are not verified here. A fee is per payout, not per qualifying Travel, so batching economically matters. The proposed $25 minimum should not be adopted as a permanent rule since the disabled 15-cent × 200-Travel prototype caps at $30 and 167 qualifying Travels are needed to reach $25. A bank provider should be chosen after written quotes, recipient-volume scenario, licensing/compliance review, and a real sandbox.

For 2026, IRS reporting threshold for Form 1099-NEC is generally $2,000 of relevant nonemployee compensation (not $600), subject to withholding and other exceptions. Collect tax identity and preserve proper records regardless of threshold and confirm classification with qualified counsel. Independent legal review must cover worker control/classification, compensation contract, marketing disclosures, reversals, tax and ACH rights. Neither law nor provider has endorsed this design.
