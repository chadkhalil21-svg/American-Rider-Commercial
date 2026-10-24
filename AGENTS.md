# Read-first instruction for all American Rider agents — launch-first update 2026-10-24

**2026-10-24 FINAL FOUNDER COMMAND: THREE COMPLETE USER JOURNEYS, THEN PUBLICATION. HIGHEST PRIORITY FOR EVERY FUTURE CHAT:**
The launch is **one complete end-to-end American Rider product for Travelers, Operators AND independently commissioned Recruiters**, publicly available on the Apple App Store and Google Play Store, managed by one Founder from one phone, with minimal intervention. **Recruiter commissions, secure bank enrollment and actual payout reconciliation are INCLUDED IN THE LAUNCH; NOT optional, not preview-only and not after launch.** Historic notes that say they are optional are superseded. Do not claim they are functional merely because invitations or dashboard counts exist. Do not activate live commissions or payouts without a real funded rate, consent, eligibility, approved financial provider, verified ownership and legally required reporting.
FIRST read latest `PROJECT-LEDGER.md` plus current status table, `AGENTS.md` and current release/source; reconcile accepted and already-tested work before doing anything. Do not repeat investigations of geohash/H3, tariff, insurance vendor lists, receipts or other previously settled designs unless new concrete evidence identifies a blocker. Categorize each stage distinctly as **source ready, synthetic trace passed, merged, deployed exact SHA, real provider verified, real device verified, store review accepted**. One realistic sequential account journey per role, including failures and recovery, and published Google/H3/Apple/Stripe/FTC/IRS counsel-style comparisons. External legal guidance is research, not actual attorney engagement.
**Three complete paths:** (1) Traveler: account, permission and identity, quote/booking, payment, dispatch, accepted Travel, receipt, cancellation/refund, support/emergency; (2) Operator: registration in open geography, documents/current independent insurance, screening, Stripe Express bank link/verification, qualification, on-duty/accept/delivery, 99% Fare payout, lapse and failed-payout recovery; (3) Recruiter: Founder invitation, verified account, agreement, Stripe-hosted identity/tax/bank setup, personal Operator/Traveler links, genuine attribution, verified paid Travel, commission calculated from a funded approved policy, held/available/paid/reversed immutable ledger, bank payout and failed/returned transfer reconciliation, private dashboard. All three must pass synthetic/e2e tests and required production/physical/legal acceptance. No invented commission numbers, real payment or fake live approvals.
**Source truth:** `backend/recruiter-ach-batch.js` is preview only; `backend/referral-accrual.js` disabled; recruiter compensation is a **confirmed incomplete launch blocker** to implement and commission, not to defer. Reuse Stripe Connect where lawful and its hosted KYC/tax/bank capability before adding a new bank processor, but verify platform authorization and fees. Keep real payouts safely disabled until full provider/legal/budget gates are true; prepare practical deployable PRs and exact safety tests. Never substitute an illustrative 15-cent reward for Founder-approved terms.
**Technical/economic discipline:** preserve server-authoritative Traveler Total, 99% Operator Fare, bounded Firestore geographic lookup and duty qualification; do not reinvent H3 or a second datastore. Prefer indexed due queues, stable cursors, named-document reads, event idempotency and a single production scheduler. Minimize Firestore reads/writes, provider charges, toil and total cost; verify with actual metrics, not assumptions.
**Delivery discipline:** Build meaningful tested changes in GitHub, verify exact-head CI, merge safe changes, and update both ledger and status table for every material step. Use credible synthetic payment/device simulations when live user/device interactions are inaccessible and identify what remains unproven. Production payments, bank transfers and market/legal/store approvals require proper permissions and external verification, never source-code inference. Keep Founder replies short, simple and action-led.

**2026-10-16 SETTLED OPEN-FIRST OPERATOR REGISTRATION — NEVER REOPEN:** Only ACTIVE/open service geography may begin Operator registration, document uploads and review, screening requests and reports, insurer verification, Stripe payout onboarding, qualification submission, duty or paid Travel. An unopened region (including Colorado) presents a concise Coming soon status with *optional*, rate-limited coarse-area interest registration; do not enroll silently or promise notifications until the actual notification-delivery workflow is verified. Even an active market confers no individual Operator qualification: retain separate verified insurance, screening, vehicle, account, disclosures and payments. Keep unknown jurisdictions closed. Do not add another retired `market_admission` approval gate. Closed, unmerged PR #47 contradicted this founder policy and must not be revived; historic prelaunch-preparation discussion is superseded by [ADR 0027](docs/decisions/0027-open-first-operator-onboarding-and-waitlist.md). Every future change must check this rule in the ledger and maintain its open/closed mobile and backend regressions.

**2026-10-14 CURRENT SERVICE AUTHORITY — supersedes older regional admission instructions:** Configured service geography alone determines which counties American Rider serves. The retired `market_admission` record, evidence forms, and Founder approval sweeps have no authority over bookings, dispatch, or Operator duty. Do not restore those administrative gates. Keep actual independent Operator insurance/screening, Stripe/payment, account closure, restricted-route and jurisdiction safeguards. Historical claims and records are not erased. See ADR 0014 and the latest ledger entry.\n\n
**Price integrity at launch:** `/fare-quote` returns the authoritative all-in `travelerPays` and selected class. The phone MUST display that exact integer-cent Total, never multiply a fare or recompute platform/government/toll fees. `/travel/prepare` independently reprices and rejects any submitted current-app `agreedTotalCents` that differs. Update every quote/confirmation entry point and test Standard/Large/Pet, foreign card, known toll, fee pass-through, changed pickup and Smart leg. Other classes have NO printable price until server-quoted. See October 13 entry of PROJECT-LEDGER.md and source audit. Do not confuse this fix with validated live market competitiveness.


**FOUNDER-RATIFIED CONTINUITY AND STATUS RECORD (2026-10-18):** The canonical ledger, status table, and existing PR-template maintenance instruction ALREADY exist. Do not repeatedly propose creating a ledger or ask the founder to repeat completed Google/API/provider steps. At the start of every substantial task, read the **newest** ledger commissioning entry and current-status table. Whenever an important decision is made or a material backend, security, database/index, cloud, money, market, routing, vendor, legal or app-release change is completed, update **both** the ledger's newest record **and** the current-status table in the SAME PR (or immediately after a verified action outside GitHub). Separate `prepared code`, `merged`, `externally commissioned`, `deployed`, `device verified`, and `commercially operating`. Include exact evidence (project, date, commit, workflow or provider result) and remaining specific blocker; never include secret contents or private finance/personal data. For changed settled architecture, write a superseding ADR, preserving history. Do not bury a current-state correction only in an old paragraph or PR comment. A targeted GitHub check flags major source changes without ledger changes. This requirement runs during actual work, not continuously in the background.\n\n**First read [PROJECT-LEDGER.md](PROJECT-LEDGER.md), then inspect the relevant source and live release evidence.** **For every architecture, interface, workflow, economics or release decision, apply the founder's complete [Council and Institutional Standard](docs/COUNCIL-STANDARDS.md): Ford, Rockefeller, Jobs; Harvard Business School, Stanford GSB, MIT Sloan, Apple and leading design/software research; Emirates-style first-class hospitality; institutional, authoritative, sophisticated, elegant, seamless, trustworthy, economically disciplined and slightly futuristic with quiet authority. These are reference lenses, not actual endorsements or adviser communications.** The ledger is the canonical index of settled founder decisions, verified modules, open commissioning requirements and current release posture. The legacy design notes below are useful background but do not supersede newer verified ledger decisions. Do not resurrect superseded Checkr-only onboarding, per-county manual administration, million-email insurance plans or unsupported commercial activation. Every material architecture/launch decision change updates the ledger and a superseding ADR in the same PR. Never mistake code, CI, or an expansion plan for legal approval or a live market. The founder has already authorized tri-county launch **once external/operational evidence passes**.

---

Always use ASD – STE 100 Simplified Technical English when you talk to me.

**2026-10-14 settled founder policy — do not reopen:** South Florida Standard uses the DEPLOYED $1.00 start + $0.95 routed mile + $0.32 routed minute, $3 minimum Fare, variable Platform Fee at least $2.50, and 99% Fare for Operators. This is a consciously selected prelaunch tariff, not the superseded $0.85/mile/$0.15/min fallback or a promise of a verified market discount. No external live competitor feed, extra surge engine or further pricing research is required to use it. Future local-price experiments may analyze actual bounded demand, Operator availability, route-time reliability, route-matched independent published comparisons and full costs with a controlled/consented price change; preserve one server-authoritative Traveler Total and explicit agreement. Existing insurance and screening workflows must not be described as absent merely because protected regional evidence records are unfiled. Operators alone procure and pay qualifying, independently verified state-specific commercial livery/TNC-use insurance; known/unknown lapsed or insufficient coverage prevents duty and new Travel. This is a CLOSED founder purchasing/design decision, not a claim Florida §627.748(7)(d) is discharged: record that legal issue once as an independent unresolved external question, preserve the real commercial gate, and do not repeatedly ask the founder to reverse the business policy. Screening is provider-neutral: Operators select qualifying agencies, authorize source-to-platform reporting (including existing reports where lawful), and current code requires authenticated agency provenance and review. No Checkr signup, compulsory exclusive CRA, or manual county-by-county form. The only missing screening sign-off is proof that a real authorized CRA report reaches the existing reviewed flow; don't flip `SCREENING_EVIDENCE_WORKFLOW_VERIFIED` without that. Founder wants concise, ordinary-language status, one-phone control, no fabricated attestations, no repeated finished engineering tests. Supporting record: PROJECT-LEDGER.md and docs/audits/FOUNDER-SETTLED-INSURANCE-SCREENING-PRICING-2026-10-14.md.

**Settled founder business decisions, do not reopen without instruction:** Operators themselves obtain and pay for state-compliant commercial livery / for-hire TNC insurance, verified independently and checked continually; ineligible, cancelled, lapsed or insufficient coverage blocks operations, assignment and new Travel. State-specific broker instructions already exist in `backend/insurance-jurisdictions.js` and `app/operator/insurance.tsx`. Do not propose buying TNC insurance as if the founder approved it. The founder believes immediate lockout fulfills responsibilities, but Florida §627.748(7)(d) still has an independently unresolved TNC fallback/defense wording: do not falsely label it legally resolved. Record unresolved obligations in the independent compliance record; do not make a county-wide approval document a second condition for booking. **On pricing**, reuse existing national market-reference, own booking outcomes and voluntary self-reported research; validate representative current route-matched comparisons and unit economics, avoid paid per-Travel competitor quote calls and unverified assertions of being 10% below market. Founder prefers brief nontechnical replies. Render's existing 'My Workspace' is approved for routine verification; do not spend money, change secrets/coverage or bypass release checks under this standing permission.

# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# American Rider — Traveler App

React Native (Expo SDK 57, expo-router) port of the Claude Design prototype
`../extracted/American Rider - App Prototype v2.dc.html` — treat that file and
`../extracted/CLAUDE.md` as the design source of truth.

**Product vision:** `docs/PRODUCT-SPEC.md` (v1.0) — 99%-to-operator model,
ARTS™ terminology, AI-as-infrastructure, national transportation OS. ARTS terms
(Operator, Travel Number, Commissioned…) govern operator-facing and internal
surfaces; the Traveler UI deliberately uses human words instead (the "Friendly"
decision). "Travel Number"/trip numbers and transparent pricing appear in both.

## Design rules ("Friendly" style)

### THE RUBRIC — ask it of every screen, before shipping anything

> **"Is the design and language on this screen institutional, authoritative, and
> sophisticated?"**

Chad has now given this instruction three separate times (13, 15 and 16 Aug 2026), each
time because a screen shipped that failed it. It is not a mood; it is the acceptance test.
Apply it to EVERY screen and EVERY string, not only the one being worked on.

Concretely, a screen fails the rubric if it:

- **reassures** — "no surge", "no hidden fees", "price won't go up", "don't worry".
  Repeating that a price is trustworthy is what an app does when it expects to be doubted.
  State the price; let it carry itself.
- **editorialises** — "Quiet right now", "A little busy", "Great choice", "You're all set",
  "Almost there". Report the fact and stop.
- **apologises or chats** — "We couldn't work that out just now", "Let's go", exclamation
  marks, emoji, cute status text.
- **names a control after something other than what it does** — "Travel ›" for a link that
  selects; "Reserve Travel" on a button that reserves nothing; a chevron on a row that
  opens nothing.
- **shows a number without saying what it is** — an unlabelled amount, a bare "24 min" that
  could be journey time or operator ETA.
- **contradicts itself about money** — the single most serious defect there is. An amount
  and a doubt about that amount must never render together.
- **uses conversational shorthand where precision exists** — "MIA Airport", "Miami Airport"
  where "Miami International Airport" is what the place is called.

And a screen is NOT made institutional by being stiff: "Pursuant to your travel request"
fails just as hard. The traveler voice is plain English, precisely used.

**THE DESIGN LANGUAGE, in the founders' own words (Adrian + Chad, 6–8 Aug 2026):
institutional, authoritative, sophisticated — carried with clean, minimal, Apple-calm
execution. Chad's directive (8 Aug): apply the three words creatively, everywhere,
design AND language; his web demo (screenshots in chat, 8 Aug) is a reference point.** Apple-clean calm — a non-technical or
elderly person must never feel the app performing at them. Institutional authority comes
from precision and promises, never from jargon or loud visuals. Every new surface —
including web pages the backend serves — must be brand-BUILT (cards, radii, eyebrows,
wordmark lockup), not merely brand-colored, and gets shown to the founders ("what's on it,
what's deliberately not, open style questions") before it ships.

- **THE VISUAL SYSTEM IS THE FOUNDERS' WEB DEMO, EXACTLY** (Chad + Adrian, 8 Aug 2026;
  demo: https://old-scene-d12f.adrianderksmith.workers.dev — shell + traveler-institutional.html).
  Exemplars in code: `app/index.tsx` (home) and `src/screens/AuthScreen.tsx` (front door).
- **THE BLUE STAYS** (Chad, 11 Aug 2026: "we'll keep the blue as it is in the web demo").
  This REVERSES the 8 Aug "no blue anywhere" rule — do not reinstate it. `colors.blue` is
  the demo's `--blue` `#2E5FE0`, used exactly where the demo uses it: View profile ›,
  Travel ›, See all, links, the step bar, and the `blueTint`/`blueBorder` panels. Never
  hardcode a blue hex; never invent a blue the demo does not have.
  **Exceptions Chad made on 13–14 Sept 2026, which stand:** the controls on the Travel
  Confirmation sheet (route dots, class radio, "Modify …" links), the drawer head's "Account
  details ›" (was the blue "View profile ›"), and the search-field caret are INK. The shared
  `blueTint` panels remain as the demo has them until a founder says. The shared `BackLink` is
  INK since 18 Sept 2026: Chad listed "‹ Back" among the blue controls to take the colour off,
  which answered `docs/OPEN-DECISIONS.md` §0.6.
  Chad said for one of them on 15 Sept 2026: the receipt's "Operator retained · 99%" blueTint
  panel is a quiet footer line ("The Operator retained 99% of the travel fare.") — a receipt is
  a transaction record, and the statement belongs at its foot, not in a banner.
- **EVIDENCE IS THE WHOLE PAGE, IN ONE IMAGE.** A screenshot is one phone screen; a screen
  taller than the phone therefore ends wherever the scroll happened to stop, mid-sentence, and
  a founder reading it sees a cut-off app. Chad said so twice (18 Sept 2026: "you are merely
  pasting it incorrectly, therefore it cuts off" — he was right). Capture overlapping frames
  and join them: `swift scripts/stitch-screens.swift out.png <statusBarPx> f0.png f1.png …`,
  which finds each seam by matching pixels and refuses rather than guessing when two frames do
  not overlap. `statusBarPx` is the device's top inset in PIXELS plus a small margin (210 on iPhone 17,
  whose inset is 177): passing it too small leaves a hairline of the masked band drawn across
  the seam, which on the insurance screen fell straight through the Save button. Swipe less than a screen
  between frames — the first attempt at this dropped a whole card out of the middle of the page
  and the stitch looked plausible.
- **MEASURE, DON'T LOOK.** Screenshots are not evidence — three exactness passes failed
  because they were judged by eye. Render the demo (`localhost:8123`) and the app
  (`localhost:8081`) at the same 390 × 844 viewport and diff `getComputedStyle` +
  `getBoundingClientRect` on the same elements. See docs/EXACTNESS-SWEEP.md for the recipe
  and the constant offsets to subtract.
- **Typography is centralized and accessibility-aware.** All text renders through `src/components/AppText.tsx`, never `Text` from `react-native` directly. It carries the demo's inherited `letter-spacing:-.005em` equivalent and permits Dynamic Type with the current capped scale defined by `MAX_FONT_SCALE`. Do not disable font scaling to preserve screenshot exactness; layout must be reflow-tested instead.
- Colors and radii live in `src/theme.ts` — never hardcode. Palette = demo hex-for-hex:
  paper `#F7F7F5`, ink `#14171F`, hairline `#ECEBE6`, border `#E3E2DC`, muted `#8A8A82`,
  faint `#B4B3AB`. Cards: white, radius 16, 1px hairline border, NO shadow. Buttons: radius 13,
  solid-ink primary ("Reserve Travel"), ghost secondary; the only red button anywhere is "Call 911".
- Letterhead header everywhere: hamburger · centered wordmark + NATIONAL TRANSPORTATION
  tagline · thin person-outline icon (never a filled initials circle).
- The menu (Home drawer and the in-travel Menu screen) is THREE GROUPS — Account, Travel,
  Assistance — with the account's name (never a handle minted from the email) and a monochrome
  "Account details ›" at its head; no initials disc; Sign Out in ink (red is Call 911 only);
  no operator recruiting row (operators enter at the front door). Chad, 14 Sept 2026.
- Account details (`app/profile.tsx`) states only what the account knows: the given name
  (editable, saved to Firebase Auth) or the address; the year opened; home, work and up to
  eight favourite destinations (`src/savedPlaces.ts`, on the device, also shortcuts on Home);
  the saved cabin environment (`src/state/cabinPrefs.ts`, applied to every travel); trusted
  contacts; travels completed this year; Payment Methods; the 99% model stated once. No
  honorifics, tiers, bank names, portraits or corporate billing — none exist. Chad + Adrian,
  14 Sept 2026.
- Payment & Settlement (`app/wallet.tsx`) is the traveler's saved methods READ FROM STRIPE
  (`GET/POST/DELETE /payment-methods*` on the server: list, setup-intent for the sheet in
  setup mode, set default, detach), Apple Pay availability, and the Travel Log. Off-session
  charges (gratuity, scheduled travel) use the traveler's chosen default. No corporate billing,
  retainers, statements or expense integrations — none exist. Chad, 14 Sept 2026.
- Section labels: quiet grey letterspaced uppercase (SUGGESTED TRAVEL, RECENT TRAVEL).
  SUGGESTED TRAVEL is EARNED from the traveler's real trips — never shown to a new account.
- IBM Plex Mono is used ONLY for identifiers and verification-style values that the demo deliberately renders as mono (for example Travel/case numbers, invite/verification codes). **Prices are NOT mono.** Prices use the system font with tabular numerals through `Num`, matching the demo. Everything else is the system font.
- The AI planner ("Plan in your own words") is WITHDRAWN as of 4 Sept 2026 — the founders'
  decision, not currently offered, possibly refined and reintroduced later. This line
  previously recorded it as an explicit keep; that is superseded. `app/plan.tsx` and
  `src/backend/assistant.ts` remain in the tree with no entry point, so the work survives
  without a traveler being able to reach it. Do not re-add the link to home without the
  founders saying so.
- Institutional headlines ("Begin Travel"), human words inside the cards; traveler screens
  speak human, operator/business surfaces speak ARTS. Two voices, one company — see
  `docs/PRODUCT-SPEC.md`. The dark "ride in progress" banner keeps its darkness.

## Architecture
- `app/` — one file per screen (expo-router): index (home + drawer), reserve (THE ONE SHEET between a destination and a car — Travel Confirmation: destination entry, route map, departure time, vehicle class with prices, the saved cabin environment, Complete Travel Cost, Confirm Travel; Chad, 14 Sept 2026: "it is subpar to have four screens before a car is on its way" — options.tsx and review.tsx were folded into it and deleted), prefs (Cabin Environment, a sub-screen that returns), ride (live status — named `/ride` because Metro's dev server reserves `/status`), complete (rating/tip), message, receipt, issues (Patron Support), account (Menu), profile, wallet, safety (Safe Travels), settings, notifications, invite, schedule, history (Travel Log), drive (operator recruiting), +not-found.
- `src/state/RideContext.tsx` — Traveler presentation/cache store for booking, authoritative server-backed Travel state, payments, scheduling, Smart Travel continuity and help flows. Production Travel progression comes from server records/provider events; no scripted/demo timer may advance a real Travel.
- `src/data.ts` — demo data and the fare-display fallback. **Live pricing is server-authoritative.**
  Operator retains 99% of Travel Fare; American Rider receives a 1% uncapped coordination
  commission. The Traveler Platform Fee is no longer a flat fee or percentage schedule:
  `backend/economics.js` computes the smallest whole-cent fee that funds card processing,
  Connect variable/fixed allowances, pass-through processing, a 25c contingency reserve,
  a 25c operating/infrastructure allowance, and at least 75c modeled contribution per
  separately charged Travel. Unknown card country is international-safe; settlement currency is
  USD only. `src/data.ts platformFee()` mirrors the integer-cent rule for display fallback,
  and `backend/payments.test.js` checks app/server parity for every cent from $3 to $500.
  Government fees and tolls are pass-through amounts whose induced processing cost is recovered
  by the Platform Fee. The Traveler sees one Total; no payment-processing line is added.
- `src/backend/dispatch.ts` — client bridge to the authenticated server-authoritative dispatch/Travel APIs and the signed-in Traveler's Travel records. Fleet authority, qualification gates and matching remain server-side; client code must never manufacture or self-authorize Operators.
- `src/firebase.ts` / `src/state/AuthContext.tsx` — live Firebase Auth + Firestore. The web config in `firebase.ts` is NOT secret; real secrets (e.g. `STRIPE_SECRET_KEY`) belong only in a backend `.env`, which is gitignored.
- `src/components/LiveMap.tsx` — animated route map (SVG bezier + Animated).
- **Maps (Chad, 13 Sept 2026; supersedes his 9 Sept "iPhone = Apple Maps"): MapLibre, drawn in
  the palette.** `src/components/MonoMap.tsx` (frame, non-interactive, ornaments off, OSM
  attribution beneath), `mapStyle.ts` (theme tokens only; OpenFreeMap tiles as the interim
  source, one URL to swap for self-hosted), `HomeMap.tsx` and `RouteMap.tsx` on iPhone AND
  Android; `*.web.tsx` render nothing (no Google anywhere). Apple Maps (`expo-maps`) remains
  ONLY in `app/pickup-map.ios.tsx` and `src/components/LiveMap.ios.tsx` — an open item, not a
  decision. `@maplibre/maplibre-react-native` is New Architecture only; it needs
  `prebuild --clean`, which `npm run build:sim` does.
- All animations pass `useNativeDriver: useNative` from `src/components/anim.ts` (web fallback).

## Commands
- `npm start` — Metro; scan QR with Expo Go for phone preview.
- `npx expo start --web --port 8081` — browser preview.
- `npx tsc --noEmit` — type check; keep it clean.
- `npm run check` — typecheck + the three i18n gates + backend tests, in one command.
- **`npm run i18n` — THE CATALOGUES BEING COMPLETE IS NOT THE SAME AS THE SCREENS USING
  THEM.** Three separate checks, because each one caught something the others could not:
  `check-i18n.mjs` (every language covers every key, and no key is written twice — a
  duplicate silently wins and shadows a correct translation), `check-untranslated.mjs`
  (no user-visible English literal renders without `t()`), `check-unused-i18n.mjs` (no
  key nothing renders — usually a half-done rewire). On 5 Sept 2026 "is it in five
  languages?" answered yes while 84 strings were English on screen; the number only
  became true once these existed. Ask for the count, never the status.
- **Prose lives in more places than JSX text nodes.** Data modules (`src/data.ts`),
  contexts, and `src/backend/*.ts` all hold user-visible sentences. Anything built at
  import time — `TRAVEL_CLASSES`, `VENUE_NOTES`, `INSURERS`, `QUAL_DOCS`, `WHY` — stores
  KEYS, not sentences, because it is evaluated before the stored language is read; the
  RENDER site calls `t()`. Forget that half and the reader sees `traveler.someKey`.
  `AppText` warns in dev when that happens.
- `cd backend && npm run lint && npm test` — **BOTH, and the lint is not optional.** The
  backend is plain JavaScript, so nothing type-checks it. On 29 Aug 2026 the first `no-undef`
  run over `backend/` found two shipped ReferenceErrors that 195 passing tests had not:
  `/operator/disclosure/acknowledge` threw on every call (so every operator who read the
  disclosure was refused when they said so, and none could go on duty), and `sweepAssignments`
  called an undefined `coverageLapsed` inside a `catch { continue }` — swallowing the error and
  silently skipping every re-offer of unanswered travel. Tests prove a module. Lint proves it
  is wired. This codebase's recurring defect is the second thing, not the first.

## Current release posture
The Traveler app, Operator surfaces, authentication, backend, payment architecture, qualification/screening architecture, Family/Teen Travel and Smart Travel are implemented and under commercial-release audit. Do **not** treat old prototype roadmaps as the current feature inventory. The commercial release authority is `docs/COMMERCIAL-RELEASE-EVIDENCE.md` plus the executable Release Gate and release-evidence verifier. Features that remain unproven in production must fail closed rather than being represented as absent or simulated.

## Building the app locally (free — no EAS credits)

```
npx expo prebuild --clean -p ios     # regenerates ios/ from app.json; ios/ is gitignored
cd ios && pod install
npx expo run:ios
```

**COCOAPODS NEEDS A UTF-8 LOCALE AND THIS MACHINE HAS NONE.** With `LANG` unset, `pod install`
dies on `Unicode Normalization not appropriate for ASCII-8BIT (Encoding::CompatibilityError)`
several hundred lines into a Ruby backtrace that says nothing about locales. Prefix both
commands:

```
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx expo run:ios
```

**THE LIVE ACTIVITY IS A NATIVE TARGET AND NEEDS A PREBUILD.** `expo-widgets` generates an iOS
widget extension from `src/widgets/TravelActivity.tsx` (the `'use widget'` directive). It cannot
run in Expo Go, and adding the plugin does nothing until `npx expo prebuild --clean -p ios`
regenerates the native project. `expo-live-activity` is deprecated — do not reinstate it.

**XCODE 27 BROKE `expo run:ios` FOR SIMULATORS (16 Sept 2026).** The App Store updated Xcode
to 27.0 mid-session. Two consequences. Every Apple tool — `git` included, since /usr/bin/git is
Apple's shim — refuses to run until the new licence is accepted: `sudo xcodebuild -license
accept`, which needs Adrian's password and so is his to run. And `npx expo run:ios --device
<simulator udid>` now stops at "No code signing certificates are available" after a successful
compile: Xcode 27's `simctl list -j` carries `deviceTypeIdentifier` where @expo/cli 57.0.10's
isSimulatorDevice() looks for `deviceType`, so every simulator is taken for a physical iPhone.
`scripts/build-simulator.sh` therefore calls `xcodebuild` directly with the simulator as its
destination (`CODE_SIGNING_ALLOWED=NO`), which is what the CLI does underneath for a simulator,
and finds the .app under DerivedData/AmericanRider-simulator. Proven on e2d030f. The simulators
survived the update (iOS 26.5 runtime intact) but had to be booted again.

**RE-RUN PREBUILD AFTER TOUCHING `plugins` IN app.json.** A config plugin added there does
nothing until the native project is regenerated — `expo-notifications` was in app.json and
absent from Podfile.lock, so push would have failed on a build that looked correct.

**KEEP THE PROJECT AT A PATH WITH NO SPACE IN IT.** It lived at `/Users/adriansmith/American
Rider` until 24 Aug 2026 and the space broke two separate iOS build scripts — expo-constants'
`bash -l -c "$PODS_TARGET_SRCROOT/…"` and React Native's own backtick-executed
`react-native-xcode.sh` — because neither quotes the path it builds. Both died at 99% with

    No such file or directory: /Users/adriansmith/American

naming a directory that does not exist and saying nothing about quoting. Renamed to
`/Users/adriansmith/AmericanRider`, which cures the whole class rather than the two instances
we happened to hit; the next one would have surfaced during an App Store build instead.

`scripts/patch-ios-space-in-path.sh` is kept for anyone who ever builds from a path with a
space. It is NOT wired into `postinstall` any more — the cure is the path.

## Session workflow
- When context usage reaches approximately 70–75%, create a concise delta checkpoint in
  `CURRENT_HANDOFF.md` (commits and material work since the last checkpoint, the exact
  stopping point, decisions, tests actually run, the next action) and recommend starting a
  fresh session. Do not wait until the context is full. Do not rerun full tests solely to
  create a handoff. Summarize successful command output rather than reproducing complete logs.
  Commit and push the handoff alone; never bundle unfinished application changes with it.
