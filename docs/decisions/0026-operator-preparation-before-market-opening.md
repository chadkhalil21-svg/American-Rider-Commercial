# ADR 0026 — Operator preparation before paid market opening
**16 October 2026 · Code-only candidate, independently test before release**

## Governing business decision
Individual Operator onboarding is separate from geographic permission for paid Travel. Preserve the existing active-county service configuration and the individual legal, insurance, screening, account, payment and vehicle gates. Do **not** recreate the retired county-admission system. No user/Operator self-attestation creates a screening or insurance pass.

## Verified source problem
Before this change, the mobile qualification checklist blocked license, registration and insurance document preparation in a waitlisted county. The backend reinforced that mistake with `requireActiveOperatingMarket` on private upload and document review, even though the same backend already allowed a provider-neutral screening preparation request in a configured waitlisted county. A temporary network failure while loading the county looked like an empty successful list and offered no retry. A one-tap local “Basics” badge represented legal name, DOB and address as verified without obtaining or checking them; the backend did not require that badge. An external provider URL was opened without handling phone rejection.

## Applied design
- Reuse the **actual configured screening and insurance jurisdiction policies** before permitting private document preparation. The signed-in Operator must have selected a recognized county with matching region/state and both supported policies. Fail closed for unknown or unconfigured jurisdictions.
- For this preparatory workflow only, do not require the county to sell paid Travel. Preserve full account-bound R2 ownership, fresh authentication, existing rate limits, source document review and independent insurer checks.
- Private storage upload authorization is **purpose-scoped**: Operator compliance files require a configured jurisdiction, but a Traveler's private lost-item photo does not require an Operator account or operating county. Unsupported upload purposes fail closed; signed-in identity, fresh authentication, rate limits and owner-specific private object keys still apply. Test both paths twice so Operator changes cannot break Traveler safety/recovery.
- Preserve the active-market guard on Stripe Connect onboarding, paid duty and dispatch. The Operator may submit an application for authoritative review in a configured waitlisted county, but an actual qualified status always requires current independently verified screening and insurance, including when using test payment keys. No price or passenger booking change.
- Return visible market request errors. Allow a direct manual retry without requesting new location permissions. Preserve an earlier valid selection when a subsequent request fails.
- Eliminate the false Basics verification row rather than collecting unnecessary DOB/address a second time. The remaining qualification checklist contains only genuine documents and source-approved screening.
- Catch external screening link failures and permit retrying screening/insurance status after outages. No invented provider URL, purchase button, carrier acceptance or signed-off CRA.
- Keep five-language strings accurate and the UI composed, direct and accessible.

## Published reference standard (not agency advice or endorsement)
- Mercury Development's 2026 Clutch client cases describe requirements definition, code reviews and QA on mobile/monitoring workflows: https://clutch.co/profile/mercury-development
- Utility's GoodFirms reviews emphasize integrated product strategy, hands-on UX and stable mobile delivery: https://www.goodfirms.co/company/utility/
- Empat's verified Clutch reviews emphasize engineering delivery and communication: https://clutch.co/profile/empat
- Apple Human Interface Guidelines emphasize transparent status, user control and recovery: https://developer.apple.com/design/human-interface-guidelines/design-principles
- Android Core App Quality expects interrupted/returned mobile flows and network failures to be tested: https://developer.android.com/docs/quality-guidelines/core-app-quality
- NASA SWE-067 requires validation on representative hardware in its intended environment: https://swehb.nasa.gov/spaces/SWEHBVB/pages/32604539/SWE-067%2B-%2BVerify%2BImplementation
Historical Council figures (Ford, Rockefeller, Jobs) are operational design lenses, not people consulted.

## Verification and external dependencies
Synthetic `backend/operator-onboarding-preparation.test.js` and `backend/private-upload-scope.test.js` run twice and checks preparatory waitlist/onboarding/active conditions, unsupported jurisdictions, ownership, server gate separation, no fake identity/CRA pass and client failure recovery. Run the full exact-head six GitHub campaigns; only green checks permit merge consideration.

**Not certified by this PR:** a real independently verified report delivered from a qualified CRA into the Operations review process; independently confirmed real insurer/broker policy status; on-device iPhone and Android private PDF uploads, interruptions, retries and correct review/approval; real Stripe Connect bank completion; and true production load or Firebase quotas. Do not spend real Operator money, fabricate verification records, set readiness flags, charge Travelers or declare launch because a unit test passed.
