# American Rider — Launch Commissioning Checklist

## Founder-defined launch milestone, 19 October 2026

**PRELAUNCH:** American Rider has **not been published** to the Apple App Store or Google Play. Both public store releases are the goal. Backend services, live Stripe credentials, webhook endpoints and TestFlight do not establish an existing paying customer population or commercially accepted Travels. Avoid presuming existing paid traffic in migration rationale.

**Do not repeat:** Initial Cloud Run staging, the actual deployed production-project backend, verified initial Firebase read, or the 14-variable Google secret transfer. A current private Cloud Run `/live` probe returned **401** before any webhook/scheduler action: diagnose IAM invoker/token audience, not recreate a project.

**Shortest remaining path to first store publication:** fix Cloud Run private invocation → complete actual production payment/webhook/scheduler provider configuration with verifiable single authority and an externally accessible secure API → update `eas.json` production API URL before building native binaries → complete controlled provider/Operator/device tests and regulatory disclosures → use the existing exact-SHA iOS TestFlight and signed Android AAB CI workflows → complete App Store Connect and Google Play Console listing/review submissions, obtain approvals and publish. Those two workflows **do not themselves publish**. Keep old Render origin for compatibility until release devices genuinely point to Google.


This document records the current release boundary. Historical demo-era status has been retired; executable code, automated release gates, and the commercial-release evidence contract are authoritative.

## Code release

- Accounts/authentication, authoritative fare economics, Stripe payment/settlement architecture, real routing/location integration, dispatch/matching, Operator qualification, Family/Teen, Smart Travel, support, localization, security controls and release builds are implemented in the current release candidate.
- The Traveler Platform Fee is governed by `backend/economics.js`: the smallest whole-cent amount required by the current cost model, with the current $2.50 floor. The Operator retains 99% of the Travel Fare.
- Production fails closed when a required jurisdiction, qualification record, provider, credential or authoritative state is unavailable.
- The GitHub Release Gate must pass for the exact candidate SHA before commissioning evidence is accepted.

## Commercial commissioning

A green source-code gate is necessary but cannot establish live-provider or physical-device behavior. Before public commercial launch, complete the evidence contract in `docs/COMMERCIAL-RELEASE-EVIDENCE.md` against the exact deployed candidate.

Required evidence covers:

1. Active-jurisdiction insurance/qualification workflow and continuing-status behavior.
2. Production configuration and provider connectivity, including Stripe, the approved screening provider, Firebase, scheduler, routing/tolls, communications and document storage.
3. Signed physical-device validation for Operator presence and Traveler/Travel state.
4. Controlled live-money reconciliation.
5. Smart Travel live-data behavior for any region where Smart Travel is enabled.
6. Whole-product physical-device review against the American Rider rubric.

Do not manufacture, infer or backfill production evidence from unit tests. Features whose external commissioning is incomplete must remain unavailable/fail-closed rather than simulate success.

## Launch decision

The application code is release-candidate ready when the Release Gate is green. Commercial launch is authorized only when the production deployment reports operational readiness and the required commissioning evidence for the enabled launch scope passes against that same SHA.
