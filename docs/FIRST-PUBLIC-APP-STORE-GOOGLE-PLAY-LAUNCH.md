# American Rider · First public Apple App Store and Google Play release

**Founder-confirmed status:** American Rider has never publicly launched in either store. A running backend, Stripe LIVE account, TestFlight build or Play-ready AAB is **not** a public launch.

## Already completed (do not repeat)

- Real Google Cloud Run service `american-rider-api-production` exists in `american-rider-35688 / us-east1`. Its original authenticated `/live`, `/health` and real Firestore read succeeded; later one of its private Google URLs returned HTTP 401. The authenticated preflight now checks both legitimate service URLs and Google's private proxy. This is about backend invocation, not creating staging again.
- Fourteen Render environment values were transferred to Google Secret Manager, of which thirteen non-money settings were attached to the final API. The live Stripe secret remains securely staged, **not** yet attached to the final private API.
- Existing exact-SHA GitHub workflows build iOS TestFlight candidates and signed Android AAB bundles.

## Gate 1 · Complete the actual Google production backend

1. In authenticated Google Cloud Shell run `cd ~/American-Rider-Commercial && git pull --ff-only && python3 infra/cloud-run/prepare-commercial-cutover.py`. If private endpoint checks pass, type `PREPARE` and enter the Render API key in Cloud Shell only. This stages existing signing secrets, updates the actual production API's protective code and prepares Google's scheduler **PAUSED**.
2. Verify `/health` and providers. Check screening evidence workflow, Operator qualification/insurance, Firestore, tolls, Resend and Stripe Connect using a permitted controlled test; do not mark an unverified provider ready.
3. With explicit operator approval and no duplicate scheduler authority, attach the already-staged live Stripe key to **this actual production service** (never the old candidate), set its cutover flag and deployment mode in a single coordinated change, move existing Stripe endpoint URLs to the public Google API without duplicating webhook subscribers, and activate exactly one minute scheduler. Google API must accept authenticated Firebase app clients and the Stripe webhooks.
4. Confirm publicly reachable `/live`, `/health`, `/config`, genuine provider signals and read-only financial/account checks; perform allowed sandbox reconciliation first, then a controlled real payment/refund/transfer test if appropriate. Retain Render as rollback until the new server and app releases work. Do not claim release from mock data.

## Gate 2 · Native production binaries for both stores

A separate release PR changes **only the EAS production build API URL** to the already-known canonical `https://american-rider-api-production-623854974930.us-east1.run.app`. The preview URL deliberately remains Render until tester migration; currently distributed TestFlight binaries are unaffected. The guarded workflow first probes Google's **public** production health, checks live Stripe, Firestore, verified screening workflow, scheduler and payment-readiness, then builds a fresh signed store candidate. This PR should be merged **only after Gate 1 passes**. Never submit an app whose payment API is still IAM-private or uses staging credentials.

- **Apple:** Existing `.github/workflows/submit-certified-ios-testflight.yml` builds and uploads an exact verified release to **TestFlight**, not the public App Store. Validate on real iPhone/iPad. In App Store Connect, complete privacy/background-location declarations, review notes, screenshots, support and legal URLs, select accepted build, submit for **App Review**, and release after Apple approves.
- **Google:** Existing `.github/workflows/build-certified-android-play.yml` builds a signed `.aab` on an exact SHA; it **does not upload or publish** in Play Console. Validate on real Android, create/verify Play Console application and app-signing setup, upload signed AAB to an appropriate test track, complete Data safety and location disclosures, conduct any account-required testing, then submit for production review and release after Google approves.

No public store release is possible without Apple and Google acceptance; review timing cannot be guaranteed. Store Console access and developer-account actions require founder credentials/approval in their respective portals. Keep all API keys and signing keys out of chat, files committed to GitHub, and console logs.

## Gate 3 · First commercial Travel acceptance

Before declaring *public commercial launch*, verify a properly screened/insured Florida Operator with a payout-enabled Connect account, complete Traveler payment/booking/accept/decline/cancellation/refund, webhook handling without duplicates, scheduler once-only, background duty on a physical phone, safety/emergency and support, and the platform's exact 99% fare / platform fee disclosures against live amounts. Archive consent-safe evidence by exact release SHA. Do not invent genuine rides or payment evidence.

**Milestone = both applications publicly approved and published, connected to the verified real Google backend, capable of permitted genuine paid Travels.**
