# American Rider — End-to-end Operator onboarding and insurance UX audit
**16 October 2026 · Current commercial source `release/current` at `52d3060b45a02e2cb0690eed5b73d49369f9fedc`. Advisory plan, not a shipped redesign.**

## Founder-approved invariants; NO re-litigation
1. Service geography opens FIRST. Unopened states/counties show Coming soon and an optional low-cost interest list. No screening, documents, insurance checks, payouts initiation, or revenue operations before opening. Do not restore retired `market_admission`. ADR 0027.
2. Once open, actual individual eligibility remains independent: source-verified commercial livery/TNC coverage paid by Operators, insurer status monitoring, provider-neutral original background check, authentic vehicle and document evidence, Stripe payout readiness, statutory disclosures, fresh duty permission.
3. Do not change tariffs, buy insurance, start billable provider services, fabricate source checks or merge unfinished changes. PDF support already merged; verify on actual handsets rather than rebuilding.
4. Keep precise location and sensitive identity evidence out of interest-list collection. No notification promise without demonstrated notification mechanism.

## Current screen-to-screen source trace
| Order | Current route / source | Verified current behavior | UX change recommended |
| --- | --- | --- | --- |
| 0 | `app/operator/index.tsx`, `backend/markets.js` | An uncommissioned Operator routes to Economics; authority for commercial service is county status. | Check availability **before** showing an application or compliance costs. Unopened => Coming soon, optional interest. Explain that selecting a county is not an application. |
| 1 | `app/operator/economics.tsx` | Examples/weekly illustration precede the checklist. | Keep as optional "How Operator earnings work", not a gate or unverified income promise; make one clear Start registration step in open areas. |
| 2 | `app/operator/qualify.tsx`, `src/state/OperatorContext.tsx` | A five-row checklist includes "Basics", which `verifyDoc('basics')` marks `ok` without an independent identity check. Background can be opened from waitlist in current release. | Use four real compliance items: driver's license, registration, insurance, screening. Put personal details/vehicle profile where legally necessary, mark "Details saved", never "Verified" without server source. Closed market hides steps. Display persistent `not started / received / reviewing / needs changes / verified` from server. |
| 3 | `app/operator/vehicle.tsx` | Name, car description and plate entered separately; no explicit year field shown. | Capture year, make/model, plate (and VIN only where necessary) once. Reuse in quote instructions and compare eligibility; don't impose a universal vehicle-age cutoff without an approved rule. Older cars get real carrier-specific eligibility. |
| 4 | `app/operator/documents.tsx`, `src/backend/documentUpload.ts` | License and registration private uploads; native Files/PDF workflow exists, reviewed on server. | One recognizable Upload / Replace control per item, supported types and 5 MiB limit visible before picking, retry and preservation after restart. Treat PDF as Awaiting review, not instant approval. |
| 5 | `app/operator/insurance.tsx`, `backend/insurance-jurisdictions.js` | Lengthy screen: status, legal roles, broker script hidden behind "Requirements +", dominant single referred Garzor card, multi-quote sources hidden behind "Compare Qualifying Providers +", separate continuing-confirmation section. | Main choice: **Already have qualifying coverage → Submit policy** / **Need insurance → Compare quotes**. Show a short requirements summary, then one Share broker instructions action, no need for several large explanation cards. Keep mandatory disclosures and legal source accessible. After upload, show clear Verification progress, insurer request, and corrections. |
| 6 | `src/data.ts` Broker/INSURERS | Garzor singled out; Insureon, Limousine Insurance HQ, Progressive, specialist options already configured but usually hidden. Listed Garzor phone `(407) 501-8275` and weekday/Saturday hours differ from official site's current `(321) 206-8035` and weekday 9–6 / weekends by appointment. License string shown but not independently checked this session. | Do not favor an unverified "best" broker. Present 2–3 trustworthy external quote paths as **options**, not live prices: licensed multi-carrier broker; independent livery-agent comparison; direct specialist carrier. Keep "Use my own broker" first-class. Verify provider contacts, licensing and actual for-hire eligibility on a cadence. Never claim lowest price or "approved" without evidence. |
| 7 | `app/operator/background.tsx`, `backend/server.js`, `backend/screening-jurisdictions.js` | New/existing report forms; provider URL may be absent; external URL opening lacks a catch; accepted declaration creates Operations case, not clearance; real signed CRA handoff not confirmed. | Only show screening once county active. Two human paths: "I need a check" / "I already have a report." Show cost **before** initiating an external purchase, consent/secure transfer, next step and case status. Broken provider links need action or alternative. Real authorized report transfer is a separate commissioning gap; never sell a fake self-serve approval. |
| 8 | `app/operator/disclosure.tsx` | Statutory insurance disclosure with explicit acknowledgment is built. | Keep full legally required text and accurate policy responsibility; link from checklist at the appropriate moment rather than burying or duplicating. Do not abbreviate required legal language. |
| 9 | `app/operator/payouts.tsx`, `src/backend/connect.ts` | Stripe-hosted onboarding with return-to-app refresh, status, and retry. | State "Set up payouts securely with Stripe" and distinguish started / awaiting Stripe / complete. Avoid bank data stored in the phone. Explain when setup is needed and avoid asking unnecessarily before credible qualification. |
| 10 | `app/operator/review.tsx`, `app/operator/commissioned.tsx` | Status from server; incomplete returns to checklist; finite refresh. | One action-oriented checklist with rejected reason and Resubmit after fixing. Show "Received", "Being reviewed", "Action needed", "Approved", not generic "Verified" for all items. No fictitious processing-time or guaranteed push. |
| 11 | `app/operator/index.tsx`, `backend/eligibility.js` | Duty and Travel acceptance independently recheck current qualifications. | Distinguish "Approved as Operator" from "Available for Travel". Duty resumes only with valid active-market, payouts, document, insurance, screening and other gates. |
| 12 | `app/operator/profile.tsx`, support | Profile, documents, insurance, payouts and support are separately reachable. | Provide a single persistent "Application status" page and useful deep links to exact missing item; do not scatter different "Verified" statuses across screens. |

## Proposed insurance UI, in plain English
- **Header:** Commercial insurance. **Subhead:** "Use any licensed provider. American Rider checks your policy before you can accept Travel."
- **Choice A:** "I already have insurance" → "Upload your declarations page" → status and independent verification request.
- **Choice B:** "I need insurance" → "Compare quotes" with Insureon / Limousine Insurance HQ / Progressive Commercial as clearly marked *external quote routes*; "Use my own broker" equal priority.
- **Always visible before purchase:** "Ask for commercial passenger transportation insurance that covers you while available for requests and throughout Travel." A short Florida summary: `$50k/$100k/$25k` waiting; `$1 million` primary during accepted Travel; applicable PIP and uninsured/underinsured coverage. The detailed server-specific script remains the only authoritative full broker instructions, with Copy/Share. The Florida statute allows driver, TNC or both to supply statutory coverage; the founder's own-policy rule is a separate platform condition. Independent company fallback issue is separately recorded, not marked solved.
- **Quote comparison columns (only when actual personal quotes are brought back voluntarily, not invented):** carrier/broker licensed for Florida, vehicle/year accepted, passenger-for-hire use and all periods covered, coverage limits and endorsements, exclusions, deductible, monthly **and total annual** premium, upfront/down payment, cancellation/notice terms, carrier financial authorization, written confirmation. Mark quote "coverage cannot yet be determined" until a licensed agent confirms. Never sort incomparable coverage solely by price.
- **Older vehicles:** no blanket Florida TNC vehicle model-year rule was found in §627.748; insurers independently decide age/condition and underwriting. Ask specialist agents about standard sedan/nonluxury for-hire and older vehicle eligibility, not just black car. Check safety/registration and any actual market/local restrictions, rather than claiming every old car qualifies.
- **Continuing verification:** show only after policy submission/approval, with clear steps: Upload → Human review → Request independent carrier/agent confirmation → Verified (or Action needed) → Renew. Reserve secondary sections for cancellations, agent-contact process and long legal text.

## Prioritized action plan
**P0: Trust & correctness (before rollout)**
1. Enforce open-first policy for screening, documents, Stripe, qualification, all deep links and future states. Optional, consent-based interest only. Test Colorado, waitlisted Florida, opened counties, unknown geography and failures.
2. Remove one-tap "Basics Verified" implication; never let local state qualify an Operator. Show actual server evidence and retained progress after phone restart.
3. Real agency-to-Operations CRA report arrival and real insurer/broker independent status confirmation remain *unverified external integrations*. Do not mark done.
4. Resolve stale Garzor phone/hours and verify current Florida agency license/appointments; no unproven endorsement or guaranteed lowest price.
5. Clarify actual interest-list notification delivery, consent and unsubscribe; the current endpoint stores interest but by itself does **not** send launch emails. Do not promise alerts until commissioned.

**P1: Best user experience**
6. Collapse onboarding into one persistent checklist and one clear primary action per screen. "Already insured" vs "Find insurance" first; "Need check" vs "Have report" first. Restore exact step on return.
7. Move **essential** insurance policy type, period coverage, and legal limits above the fold; put advanced insurer-check details and legal references behind clear secondary links. The core broker script is copyable.
8. Offer several external, verified comparison routes and own-broker choice with neutral ranking. No new insurer API, referral commission or storage of quote/PII by American Rider absent consent and a genuine contract.
9. Reuse vehicle make/model/year/plate where relevant; reveal carrier age rules accurately; don't force a new policy type or artificial cap.
10. Show errors next to actionable field, keep entered data and exact retry; support screen readers, big text, slow network, app restart, iOS/Android native file picker, authorized navigation and localization.

**P2: Cost and evidence**
11. Cache market display information and fetch only visible-screen facts, while server guards remain fresh for costly actions. Avoid per-keystroke provider lookups, polling while app in background and whole-fleet reads; bound retry rates. Current qualification review status checks are not a substitute for external provider response.
12. Track only funnel event counts without sensitive documents: open market → start application → upload → independent check → approved → first successful Travel, plus abandoned steps and errors. Test with real consenting Operators. Do not call synthetic tests real users.

## Self-critique / failure modes to avoid
- **Prior failure:** Proposed unlaunched-area onboarding in closed unmerged PR #47; contradicted founder and would waste money. This is ruled out by ADR 0027 and targeted tests.
- **Overreach:** "Make it simpler" could hide material exclusions or legally required disclosure. Short summary is additive; statutory terms and original insurer confirmation remain.
- **False marketplace:** Three links do not provide instantaneous quotes or prove an operator qualifies; a price comparison panel cannot show real amounts without an actual licensed quote and permission. External forms collect data under their own policies.
- **Older vehicle:** No statewide TNC maximum age does **not** mean any aged vehicle is insurable, safe or accepted by a specific airport/local agency/carrier.
- **False status:** OCR, receipt and a phone badge cannot substitute for vetted original license, insurance and agency screening. One-tap basics is only user-entered data.
- **Unproven contact:** A displayed phone, license number, or address may be stale; referrals could look like an endorsement. Audit published broker contacts and Florida license search periodically.
- **State expansion:** Do not copy Florida limits into Colorado; outside active configured geography no onboarding.
- **Marketing:** "Tell me when" without notification fulfillment can damage trust. Only promise a notification when delivery/opt-out is real.
- **Regulatory:** Florida §627.748(7)(d) fallback/defense is a separate unresolved company-specific legal matter. A lockout doesn't automatically satisfy it.
- **Evidence:** Code review proves wiring and risks; not an installed iPhone/Android session, live CRA or insurer callback, insurer price or measured nation-scale throughput.

## Published research and standards (not endorsements or actual meetings)
- Apple HIG onboarding: https://developer.apple.com/design/human-interface-guidelines/onboarding
- Android core quality/back state: https://developer.android.com/develop/adaptive-apps/quality-guidelines/core-app-quality
- Nielsen Norman Group progressive disclosure: https://www.nngroup.com/videos/progressive-disclosure/
- GOV.UK question pages and errors: https://design-system.service.gov.uk/patterns/question-pages/ and https://design-system.service.gov.uk/components/error-message/
- Harvard Business School Frances Frei, Service Excellence by Design: https://www.hbs.edu/faculty/Pages/item.aspx?research=7002
- Stanford d.school, prototype then test: https://dschool.stanford.edu/tools/design-thinking-bootleg
- Florida statutory source: https://www.flsenate.gov/Laws/Statutes/2025/627.748
- Florida DFS license/consumer safeguards: https://www.myfloridacfo.com/division/ica/resources
- NAIC apples-to-apples quote comparison: https://content.naic.org/sites/default/files/committees_c_trans_read_wg_related_shopping_tool_auto_spreads.pdf
- Insureon livery quote comparison: https://www.insureon.com/livery-business-insurance
- Limo Insurance HQ Florida 3 broker quotes (provider claims, independently validate): https://www.limousineinsurancehq.com/florida-limo-insurance/
- Progressive vehicle age and black-car eligibility: https://www.progressivecommercial.com/commercial-auto-insurance/livery-insurance/black-car-and-limousine-insurance/
- Garzor published phone/hours: https://garzorinsurance.com/contact
- Practitioner agency review snapshots: https://clutch.co/profile/mercury-development, https://www.goodfirms.co/company/utility, https://clutch.co/profile/empat

**Release disposition:** This file is an advisory audit; it does not approve the UI implementation, new insurance vendor, live payment, regulatory sign-off or TestFlight. Implement findings in separate narrowly scoped, fully tested PRs AFTER founder review, with original safeguards preserved.
