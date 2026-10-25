# American Rider | National Website Language and User-Journey Review
**24 October 2026 | Institutional copy audit | PR #328 | Proposed source only until merged and Render deploy verified**

## Founder brief
Preserve the existing heritage-informed editorial design, color, photography, typography, section structure and navigation. Update public website wording for national identity, quiet authority, understated hospitality, brevity, and precise operational claims. Avoid a South-Florida-only brand expression, a fictional operating footprint, mock transport availability, or premature App Store/Play Store download promises.

## Published references consulted, not personal advice or attorney signoff
- Apple Human Interface Guidelines, Writing: https://developer.apple.com/design/human-interface-guidelines/writing — clear action labels, consistent terms, appropriate tone and user-centred information order.
- Google Material communication principles (updated March 2026): https://codelabs.developers.google.com/codelabs/material-communication-guidance — concise, direct, respectful copy.
- GOV.UK content guidance: https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/plan-manage-content/understand-content-design/ — orient copy to what users seek, remove duplicate explanations, keep content current.
- W3C WCAG 2.2: https://www.w3.org/TR/wcag/ — descriptive navigation, understandable content, accessible user paths.
- FTC advertising and marketing standards: https://www.ftc.gov/business-guidance/advertising-marketing — marketing claims must be truthful, not deceptive, and evidence based; a nationwide *scope* is not a nationwide *operating footprint*.
- FTC Endorsement Guides: https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking — compensated Recruiter recommendations must disclose the material relationship clearly where the recommendation is made.
- Florida 2026 TNC statute: https://www.flsenate.gov/Laws/Statutes/2026/627.748 — transportation marketing must preserve fare transparency, driver/vehicle identification, receipt and applicable qualification/insurance duties. This is one jurisdiction's rule; not a substitute for state-by-state legal authorization.
- Founder council rubric: `docs/COUNCIL-STANDARDS.md`. Ford/Rockefeller/Jobs/Harvard/Stanford/MIT/Emirates are decision *reference models*; none was personally contacted or has endorsed the website.
**Counsel status:** These are public legal standards and product guidelines, not legal advice from retained counsel. No attorney was contacted or has certified geographic operations.

## What changed in this copy-only pass
1. Historic national identity: home hero, About, company purpose and national operations copy now describe an American transportation company with a national outlook and market-specific eligibility, not a countdown to distribution.
2. Traveler: price, Operator details, assistance and where to arrange a Travel. The corporate site never pretends to accept bookings.
3. Operator: 99% of Fare, the independent relationship, eligibility, appropriate commercial coverage, and Stripe settlement retained; no invented earnings guarantees.
4. Standards: keep real qualifications, insurance, screening, emergency and secure-document wording without unconditional safety promises.
5. Recruiters: one private account entry; no redundant CTA; active approved $0.15 *conditional* rate accurately described, with no claim of guaranteed payouts or general self-enrollment.
6. Invited referrals: clear purpose, retained code, identity verification and honest absence of direct booking or payment on the landing page; removed release-countdown copy.
7. Smart Travel: unavailable status honestly described, without announcing an unverified schedule or implying the feature can be booked.
8. Corporate footer, navigation, privacy and legal content, signed referral token behavior and money-processing APIs remain unchanged.

## Test evidence and release boundary
- Prior **live** read-only audit: GitHub Actions run `40148496670`, 20/20 public URL/internal resources/link checks passed; iPhone 390×844, iPad 1024×768, desktop 1440×900 click-through and no horizontal overflow. The duplicate private Recruiter CTA was observed on all three. These were *anonymous* sessions, not verified real Recruiter sign-ins.
- Proposed copy review includes `scripts/test-corporate-website.cjs`, `backend/corporate-website.test.js`, QA browser suite `scripts/audit-corporate-live-site.cjs`, and local built-site Chromium screenshots via workflow `live-website-preview-acceptance-20261024.yml`.
- Never use source-only or local mock navigation to claim successful authenticated identity enrollment, Stripe bank verification, public store review, fleet qualification, or genuine settlement.
- While `release/current` remains at `9f58d41`, this copy update is **not yet live**. PR #328 must pass checks, merge, then Render must prove exact new serving SHA before user-visible changes can be described as deployed.
- The former exact-sha iOS TestFlight build failed at the native build step; these corporate-only edits must not be mischaracterized as a successfully signed mobile release.

## Voice contract for future editors
American Rider uses **Travel**, **Traveler**, **Operator**, and **Recruiter** consistently. Favor short factual sentences, active verbs, singular CTAs, specific duties, and gracious directness. Use "national" for architectural reach and company outlook, not for blanket service availability. Never claim guaranteed availability, service in a user's city, app-store approval, actual bank payout, instant universal safety, or earned commissions without current evidence. Avoid public phrases such as "testing", "coming soon", "we are developing", "the app is being prepared", "not yet commissioned" when an operationally meaningful description can communicate the same truth. Where something is genuinely unavailable, state it plainly, once, and provide a usable next step.
