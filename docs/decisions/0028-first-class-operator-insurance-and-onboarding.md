# ADR 0028 — First-class Operator onboarding without false promises
**Founder direction · 16 October 2026 · Interface decision**

## Ratified scope
- Follow ADR 0027 without exception: open service geography first, then individual Operator onboarding, then separately approved paid service.
- **One coherent application**, not independent checklists that disagree. The Operator must see accurate next steps, relevant action and honest review status, with state preserved across returns and failures.
- **Basics** opens the real name/vehicle/plate form and is labeled **Complete**, not **Verified**. Saving the form completes this self-entered step; never give identity clearance, certification or duty access for tapping a local badge. Ask for vehicle year together with make/model/color, and apply only genuine local safety/insurance requirements.
- **Insurance** must show qualifying coverage and shareable jurisdiction-specific broker instructions before buying. Highlight two neutral third-party multi-quote routes (Insureon one-application carrier marketplace and Limousine Insurance HQ independent-agent referral), then optional individual specialists. These services take the Operator to their sites and may require agent follow-up; American Rider does **not** receive instant carrier prices or recommend one policy as cheapest. Always let Operators use their own properly licensed provider. Older cars are considered on carrier-specific underwriting and appropriate legal rules, not arbitrarily rejected.
- Do not feature one stale-contact broker as American Rider's preferred provider. Keep written limits, exclusions, deductibles, annual total, down payment, passenger-for-hire use, covered vehicle and independent insurer confirmation visible or easy to request. A quote is not binding coverage. Do not automatically buy, compare fictional premiums or collect users' insurance quote PII on the platform.
- **Insurance documents** have one consistent entry screen, not duplicate workflows; retain native iOS/Android PDF picker, private storage, real review and source verification. **Screening** shows new vs existing report options and clear errors; a user statement alone never clears a background check. **Payouts** remain Stripe-hosted and clearly linked from the application. **Review** and duty decisions always come from the server.
- Use human language and restrained layout per published Apple HIG onboarding/disclosure guidance, NAIC like-for-like comparison and the founder's institutional standard. Research lenses, not personal consultation or endorsements.

## Acceptance and remaining limits
1. Closing and reopening the app does not create a false approval; a Basic tap no longer certifies a profile.
2. Multi-quote and broker-share actions lead to real external destinations with no embedded fake prices; alternative providers remain optional.
3. Existing account with policy may submit the declarations page without shopping again.
4. Coverage below legal or platform limits, expired insurance, missing screening, Stripe not ready or closed geography must still prevent commercial Travel.
5. Physical iPhone and Android file/link/return/rejection and actual insurer and CRA responses require separate verification before release.

**Files:** `app/operator/qualify.tsx`, `app/operator/vehicle.tsx`, `app/operator/documents.tsx`, `app/operator/insurance.tsx`, `app/operator/background.tsx`, `src/data.ts`, `backend/operator-first-class-onboarding.test.js`, `docs/audits/OPERATOR-ONBOARDING-END-TO-END-UX-2026-10-16.md`.

**References:** https://developer.apple.com/design/human-interface-guidelines/onboarding ; https://developer.apple.com/design/human-interface-guidelines/disclosure-controls ; https://content.naic.org/article/consumer-insight-comparing-online-auto-insurance-quotes ; https://www.insureon.com/livery-business-insurance ; https://www.limousineinsurancehq.com/florida-limo-insurance/ ; https://www.progressivecommercial.com/commercial-auto-insurance/livery-insurance/black-car-and-limousine-insurance/.

**Deployment:** Design/code candidate only. No source-based test proves a real quote, third-party connection, approved insurer, physical-device reliability or live deployment.
