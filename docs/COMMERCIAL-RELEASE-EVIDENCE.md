# Commercial Release Evidence Package

This package turns every non-code release condition into a binary, reviewable gate. It does not store secrets, card data, identity documents, insurance-policy PDFs or other sensitive artifacts in Git. The repository stores only the attestation metadata and evidence references.

## 1. Operator insurance and jurisdiction compliance

American Rider does not provide or sell automobile insurance. Every Operator must maintain qualifying coverage for the Operator and registered vehicle, and the platform fails closed when coverage is expired, insufficient, adversely changed, stale, or not independently verifiable.

**Pass only when all are true:** the active launch jurisdiction has a researched and approved rule record; Operator qualification is tested against that jurisdiction; unknown jurisdictions fail closed; expiry and continuing-status monitoring are active; direct carrier/broker confirmation and adverse-status lockout are exercised; the English disclosure states the actual American Rider insurance model and the applicable statutory warnings; ES/FR/IT/DE versions preserve the same meaning; Florida counsel/broker review confirms the launch wording and workflow against then-current Florida law.

Record jurisdiction, statute/version reviewed, reviewer/counsel or broker, execution timestamp, disclosure version, monitoring test identifiers, and durable evidence references. Do not commit Operator policy documents or other sensitive insurance records.

## 2. Production configuration/provider attestation

Capture the deployed revision and `/health` response with secrets absent/redacted. Production passes only when `deployment=production`, `operationalReady=true`, `operationalMissing=[]`, and the deployed SHA equals the candidate SHA.

Then prove provider behavior, not merely key presence: Stripe API connectivity + signed webhook delivery; production connectivity and independently verifiable reports/events from **any qualified, approved screening provider** (no exclusive vendor requirement); Firebase Admin read/write; scheduler authenticated execution; HERE known-toll and no-toll responses; OTP current itinerary and realtime behavior where configured; receipt/support email delivery; phone verification; private document storage/read; named operations authentication; push delivery; platform calling if the call control is exposed.

For each provider record: environment, test identifier, UTC timestamp, expected result, observed result, provider-side identifier/log reference and American Rider-side identifier/log reference. Never put credentials in the evidence file.

## 3. Physical-device campaign

Use signed release builds. Minimum matrix: two current supported iPhones on different iOS versions and one supported Android device. Each device record must contain model, OS version, app build/SHA and permission state.

Run Operator presence under: foreground; 15-minute screen lock; 15-minute background; repeated app switching; Wi-Fi→cellular; cellular→Wi-Fi; 7-minute airplane mode then restore; low-power/battery-saver; precise-location loss; background-location revocation; force-quit; reboot; update/relaunch; 60-minute continuous service. Capture server `onlineAt`/dispatch evidence. **Pass:** fresh permitted background execution remains dispatchable; inability to provide trustworthy presence ages out and becomes undispatchable; recovery requires fresh server-observed location.

Run Traveler/Travel on physical devices: account creation/sign-in; payment method; quote; dispatch; accept; arrive; pickup verification where applicable; onboard; completion; receipt; cancellation at every supported phase; app kill/restart during each material Travel state; network loss/recovery; duplicate taps; support/emergency; follow link; Family/Teen guardian tracking and messaging. Exercise account deletion separately for Password, Google and Sign in with Apple accounts: reauthentication must be real; profile deletion must fail closed rather than orphan personal data; retained service records must match the in-app disclosure; and Sign in with Apple deletion must include provider-token revocation before the Firebase login is removed.

## 4. Smart Travel live campaign

For every activated region, use real OTP/GTFS data and realtime data where the region supplies it. Record the exact itinerary/feed/agency identifiers.

Cases: ordinary itinerary; unknown/variable transit fare; changed transit after initial selection; missed connection; cancelled transit; realtime/planner outage; first car Travel completion → transit → second car continuation; cancellation/replanning; Family/Teen continuation; app termination/restart between legs; payment/receipt reconciliation for both car Travels.

**Pass:** American Rider never fabricates transit fare/service; changed/unverifiable service cannot dispatch a stale second leg; persisted journey/party survives restart; each actual car Travel has its own authoritative charge and settlement; receipts reconcile to provider records.

## 5. Controlled live-money reconciliation

Use authorized low-value production transactions. Record Travel Number and provider IDs, not PAN/card details. Prove exactly one Traveler charge per actual charged Travel, exactly one Operator transfer after completion, 99% of Travel Fare plus whole toll reimbursement, no commission on toll/government pass-through, retry idempotency, failed-transfer debt preservation, refund/dispute exposure accounting, and Operator account-cost recovery/waiver behavior.

## 6. Complete experience / American Rider rubric

Commercial release is blocked until the signed release candidate has been walked screen-by-screen and state-by-state on physical devices. The review is against the product doctrine, not generic taste:

- **Language:** Traveler, Operator and Travel are the canonical nouns. Copy is precise, calm and institutional; ordinary actions keep ordinary verbs. No gig-economy slang, hype, unexplained technical/provider language, fake urgency, invented measurements or unsupported claims.
- **Ford — friction:** every step earns its place. The shortest safe path is used; duplicate confirmations, repeated data entry, dead-end controls and unnecessary screens fail.
- **Rockefeller — trust:** consequential states come from durable authoritative records. Money, qualification, insurance, identity/screening, Travel state, Family authorization and receipts cannot depend on presentation/cache state or optimistic client assertions.
- **Jobs — outcome over mechanism:** the person sees what they need to decide or do, not payment plumbing, provider architecture, internal fee mechanics or implementation detail. Familiar transportation actions remain recognizable.
- **First-class standard:** restrained hierarchy, typography, spacing and palette; no visual clutter, promotional furniture or casual app-speak. The interface remains composed in loading, empty, refusal, offline, cancellation, recovery and support states—not only the happy path.
- **Seamlessness:** state survives app backgrounding/restart where it should; back/cancel semantics are predictable; one action produces one result; duplicate taps are idempotent; errors explain the next available action; no legitimate user is stranded between screens or Travel states.
- **Accessibility:** meaningful controls have accessible names/roles, touch targets and contrast are adequate, dynamic/error state is perceivable, text scaling/reflow is usable, and meaning is never conveyed by color alone.
- **Localization:** all five supported languages cover every reachable production string and preserve meaning, hierarchy and layout. Proper nouns remain proper nouns.
- **No theater:** no production-reachable placeholder, simulated Traveler/Operator/Travel, fake fare, fake ETA, fake rating, fake receipt, fake provider success or control that promises a feature it cannot perform.

The evidence package must include a complete reachable-screen inventory plus critical-path/state matrix covering Traveler, Operator, Family/Teen and Smart Travel; empty/loading/error/offline/restart states; small and large supported device layouts; accessibility checks; and terminology/copy review. Every material finding is either fixed on the candidate and re-tested or explicitly blocks release. A sample of attractive screens is not evidence of whole-product readiness.

## 7. Market commissioning and staging load

Every active service region must have market-specific evidence for jurisdiction, permits and restricted places, pricing calibration and hold-out validation, regulatory economics, routing, toll authorities, payments and stress behavior. A jurisdiction registry entry or generated county file is architecture, not commissioning evidence.

Run a production-equivalent staging load campaign against the candidate architecture and configured provider quotas. Record the workload profile plus p50/p95/p99 quote/dispatch latency, error rate, Firestore reads per dispatch, toll-provider fallback rate and quota review. Source/CPU tests establish invariants but do not certify Firestore, routing, payment or provider throughput.

**Pass:** each active region is explicitly named and commissioned; the workload is representative of launch and planned scale; no hidden fleet-size-dependent query appears; provider quotas and observed latency/error behavior are within the release operating envelope. Missing credentials or an unexecuted load campaign remains pending, never inferred from CI.

## 8. Evidence manifest and sign-off

Copy `release-evidence.template.json` to an evidence file outside the public repository or in an access-controlled release system. Every gate requires `result: "pass"`, the exact candidate SHA, UTC execution time, executor/reviewer and at least one durable evidence reference. `npm run release:evidence -- /secure/path/evidence.json <candidate-sha>` validates completeness without inspecting the underlying sensitive artifact.

A missing artifact, a verbal assurance, a screenshot without an identifiable build/provider event, or a test performed against a different SHA is **not a pass**. A release candidate can advance only after CI is green and this manifest validates for the same candidate SHA.
