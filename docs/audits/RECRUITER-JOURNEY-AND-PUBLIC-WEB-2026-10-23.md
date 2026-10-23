# Website experience and complete recruiter-sequence audit
Date: 2026-10-23. Status: SOURCE REVIEW, NOT COMMISSIONED.

## Founder design and business directions
One composed corporate website at americanrider.app with public Travel, Operate, Safety, Support and About, plus a separate AUTHENTICATED recruiter workspace once active. One mobile-first design system. No new app, no mandatory Stripe Connect account for independent recruiters. Initial referral economics and bank-provider fees must be signed and funded before public offers. Published institutional research informs design; no attorney, Council figure or institution was personally consulted.

## End-to-end recruiter evidence
| Stage | Verified code today | Unfinished acceptance |
|---|---|---|
| 1 Founder command | Founder MCP only has market tools | invite_recruiter with named MFA/OAuth authorization, audit and rate limit |
| 2 Email invitation | No live recruiter-specific sending | Resend verified delivery, cancellation, resend and bounce handling |
| 3 Forwarded email | Source-only email-bound single-use token policy and tests added | Durable atomic token issue, consume, rejection and expiry; no activation by another email |
| 4 Identity | Existing Firebase sign-in is not recruiter account approval | verified invite email, lawful identity, agreement and payment eligibility |
| 5 Founder authorization | recruiter-approval.js can READ an approval, OFF, no writer | audited protected approval/revocation, expiry and authorized role |
| 6 Private workspace | public/recruiter-preview.html is only visual | login, secure scoped summary, sign-out, retries and empty/error states |
| 7 Personal link and QR | referral-service.js issues first-party codes, unmounted for recruiters | same opaque URL shared by SMS or QR with visible paid endorsement disclosure |
| 8 Browser invitation | Backend now mounts a safe disabled informational /join page; static holding page also exists | actual same-domain landing, current iOS and Android store targets, reopen recovery |
| 9 App installation | app.json lacks verified iOS associated domains and Android App Links | AASA, assetlinks, signed two-device test, no fingerprinting |
| 10 Claim attribution | First-role immutable prototype, referrals default OFF | enforce recruiter's suspension again at claim and at money release |
| 11 Qualifying Travel | referral-accrual.js only creates potential held rewards, OFF | one authoritative captured/settled/refunded/disputed eligibility chain |
| 12 Earnings | No recruiter real dashboard or ledger release integration | owner-only aggregate count, held/available/paid figures and audit trail |
| 13 Friday ACH | recruiter-ach-batch.js is an unmounted preview | real approved bank rail, verified bank/tax records, funded batch, durable unique IDs, returns and reconciliation |
| 14 Operations exceptions | No finished recruiter exception queue | automatic normal process plus concise founder queue for fraud/bank errors |

## Genuine risk findings
- The custom domain root and public pages are outdated. Independent GitHub HTTPS evidence: apex A 216.24.57.1; Cloudflare nameservers; www CNAME points to legacy american-rider-server.onrender.com. Apex HTML differs from BOTH currently connected Google Cloud Run and Render backend. Confirm actual domain origin, ownership, domain mapping and cache before any new production deployment. Render's separate static Expo website is not the company's public site.
- Source-issued referral URL now has a safe paused backend landing. It still has no verified install, login, deep-link recovery or real attribution handoff. An attractive Share button without those steps is not finished.
- Suspended recruiter's old QR remains potentially claimable as a recorded unpaid attribution because referral-service.claim does not verify recruiter_approvals. Program stays OFF.
- Proposed 15 cents × 200 eligible Travels = $30 maximum; a $25 payout minimum requires 167 Travels before the first bank transfer. That is not a reasonable default for a low-volume recruiter. Neither figure is binding; revisit payout minimum, payment schedule, retention and total acquisition cost together.
- Existing Contributor/Operator Stripe payments are separate; no new recruiter Connect account and no $2/month active account fee.
- No legal/tax/FTC approval, live recruits, forwarded-email defense wired to server, bank contract, bank transfer, realistic signed-app test or compensation funds can be claimed completed.

## Public website visual and interaction contract
Institutional, sophisticated, composed, with uncluttered hierarchy and generous spacing. One design system with the existing American Rider colors and typography. Mobile responsive, semantic landmarks, visible keyboard focus, skip link, reduced-motion support and no decorative controls. Actual links for Travel, Operate, Safety, Support and About; no fake Book or Recruit CTA. No unverified App Store badges, testimonials, national fleet, real-time availability, live route map or instant recruiter earnings. Preserve 99% Operator Fare, $2.50 minimum platform fee, one Traveler Total, initial Miami-Dade/Broward/Palm Beach area and current Smart Travel disabled status. Do not expose recruit or travel private data on public pages.

## Acceptance before recruiting launch
Run real same-domain HTTPS and redirect probes after domain cutover; full screen/keyboard/motion/mobile tests; exact-release CI. Test actual Founder command, invited-email verification, forwarded and expired tokens, replays and revocation. Test two signed physical apps through browser/install/resume/claim. Run synthetic completed Travel/refund/dispute/duplicate and dashboard cross-account privacy tests. Complete sandbox ACH with bank rejection/return and crash-safe retries; then verify a real authorized deposit and qualified counsel review. Do not use synthetics as evidence of paid production.

## External published guidance
Apple design and layout: https://developer.apple.com/design/human-interface-guidelines/design-principles
Google SEO site structure: https://developers.google.com/search/docs/fundamentals/seo-starter-guide
Google Core Web Vitals: https://web.dev/articles/vitals
W3C accessibility: https://www.w3.org/TR/WCAG22/
OWASP secure invitation/token principles: https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
FTC material connections: https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking
Google SRE toil: https://sre.google/sre-book/eliminating-toil/
Stanford d.school: https://dschool.stanford.edu/tools/design-thinking-bootleg
Harvard service design: https://www.hbs.edu/faculty/Pages/item.aspx?research=7002

No counsel or named adviser was directly contacted. Their external approval remains outstanding.