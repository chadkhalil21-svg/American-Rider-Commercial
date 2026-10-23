# American Rider | Corporate Website Design Standard

**Date:** October 23, 2026. **Status:** source redesign under review, not evidence of public-domain launch.

## Founder intent

American Rider is a national commercial transportation platform beginning in authorized select locations. The website should have the polish and restraint of a distinguished national hospitality business without falsely implying chauffeurs, fleet ownership, guaranteed luxury vehicle classes, nationwide paid bookings, available App Store releases or an active recruiter incentive program. Mobile-first; quiet confidence, restrained graphite/ivory/navy with original company blue.

## Published reference research (not endorsements or actual consultations)

- [Blacklane 2026 brand renewal](https://www.blacklane.com/en/press/releases/blacklane-unveils-new-brand-and-enhanced-corporate-travel-booking-platform/), April 13, 2026: an inviting first impression and integrated path from introduction to booking.
- [Wheely identity](https://wheely.com/en/newsroom/rebranding-press-release): editorial typography, careful photography, heritage of service.
- [Alto transportation site](https://ridealto.com/ride-alto): approachable human language and clear categories. Different employment and fleet business model, which must NOT be copied.
- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/): scalable layout, familiar interactions, readable touch controls.
- [Google Core Web Vitals](https://developers.google.com/search/docs/appearance/core-web-vitals): target 75th percentile LCP ≤2.5 s, INP ≤200 ms, CLS ≤0.1; measure on live mobile and desktop after actual domain deployment.
- [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/): headings, landmark order, keyboard/focus, scalable text, contrast and reduced motion; passing source assertions does not establish a complete accessibility audit.
- [Baymard Oct 13, 2026 homepage/navigation research](https://baymard.com/research-articles/ecommerce-navigation-best-practice): unambiguous category paths and information hierarchy. Favor static, understandable editorial content over gratuitous auto-carousels.

## Shipped in the source proposal

- A real photographic hero with visibly illustrative vehicle imagery, rather than an abstract pseudo-live route map or provider-owned branded image. Source: [Danny Greenberg on Unsplash](https://unsplash.com/photos/a-black-limousine-parked-on-a-city-street-rJ7Lzkd8gEY), June 7 2025; [Unsplash license](https://unsplash.com/license) permits commercial use. This photograph does not represent an actual American Rider Operator's car or guarantee any service class. Brand-sensitive replacement with commissioned company imagery is preferable as the service grows.
- Clear Traveler and Operator options immediately after the heading; no fake fare search or unavailable mobile installation button.
- 99% Fare retained by qualified Operators, minimum $2.50 separate Platform Fee, one agreed all-in Total, safety obligations and dormant Smart Travel.
- An editorial information row, ample whitespace and original lower-page navy national statement with improved high-contrast headings.
- Separate footer-only Recruiter Opportunities page. Program OFF. No Traveler-to-recruiter conversion branding.

## Recruiter operations are a distinct launch track

The invitation-only recruiter program is NOT a functioning account/payment system merely because a brochure page exists. See [14-stage recruiter audit](audits/RECRUITER-JOURNEY-AND-PUBLIC-WEB-2026-10-23.md) on original PR #265. Founder approval, email delivery, verified private invitation, immutable personal link and QR, iOS/Android resume, first-role attribution, settled Travel eligibility, scoped earnings workspace, Friday funded ACH with returns and cross-account/fraud safeguards all require real execution and validation. A public recruiter information page can explain the future program, but cannot claim it has been commissioned.

## Separate production website routing blocker

`americanrider.app` resolves via Cloudflare apex A `216.24.57.1` and `www` CNAME `american-rider-server.onrender.com` to an older Render service. Founder confirmed the attempt to attach the same domain to connected `american-rider-server-3d7x.onrender.com` returned **This domain already exists on another site**. Render controls ownership/routing of the custom-domain assignment. Do not change public DNS or delete its only currently functioning domain mapping without a verified Render service transfer or an authorized alternative and valid TLS. Email MX/SPF/DKIM/SES records are unrelated to web migration and must remain unchanged.

## Verification gates

Before merging: relevant source truth/accessibility/site-route tests and all required existing platform CI success at exact commit. After merging: Render live deployment SHA, each new `onrender.com` route and visual/keyboard/phone inspection. Before cutover: remove old Render assignment through its controller or validated Render Support procedure; add domain to connected Render, verify certificate issuance and WWW redirect, retain rollback, then change only required web A/CNAME records with founder's authorized Cloudflare account. After cutover: test actual HTTPS, every link/legal/safety page, both hostnames, email routing, CSP/image load and real device. Do not claim American Rider commercial launch, recruiter activation or signed-app publication from this website release.
