// Where the app talks to the American Rider payment/backend server.
//
// THE DEFAULT IS THE LIVE GOOGLE CLOUD RUN API. A legacy Render URL is no longer the fallback.
//
// It used to fall back to http://localhost:4242, on the reasoning that local testing should
// need no setup. The effect was the opposite. EXPO_PUBLIC_API_URL is set only in eas.json's
// build profiles, so a local `npx expo run:ios` build — the free way to test on a real
// device, and the one we actually use — inherited the localhost fallback and talked to a
// server nobody was running. Payments, dispatch, support and the planner all failed at once,
// each reporting its own polite error, and none of them naming the real cause.
//
// Production EAS already specifies this Cloud Run endpoint. Match it when EAS or an
// internal simulator supplies no explicit value, instead of silently reaching old Render.
// Internal preview builds may intentionally specify a different endpoint; review those
// explicitly before retiring any old service. Anyone working on the backend opts out:
//
//   EXPO_PUBLIC_API_URL=http://localhost:4242 npx expo start
//
// (On a real phone "localhost" means the phone itself, so that override only ever works on
// the simulator or on web.)
export const PAYMENT_SERVER_URL =
  process.env.EXPO_PUBLIC_API_URL || 'https://american-rider-api-production-623854974930.us-east1.run.app';

// WHICH COMMIT THIS BUILD IS. Stamped at build time — scripts/build-simulator.sh for the
// simulator, scripts/eas-build-pre-install.sh for EAS/TestFlight — so a build can prove what
// it was made from: Settings prints it, and scripts/check-simulator-parity.mjs reads it out
// of the compiled bundle to compare the simulator with the candidate and with TestFlight.
// Empty in a build nobody stamped (a plain `npx expo run:ios`), which the check reports.
export const BUILD_COMMIT = process.env.EXPO_PUBLIC_COMMIT || '';
// The stamp the parity check greps for. It is a SEPARATE variable holding one literal
// ("ar-commit:<sha>") on purpose: Release builds are Hermes bytecode, whose string table keeps
// the pieces of a template literal apart, so "prefix" + sha could not be found as one string.
export const BUILD_STAMP = process.env.EXPO_PUBLIC_BUILD_STAMP || 'ar-commit:unstamped';

// Terms of Service and Privacy Policy — deliberately NOT on the server above.
//
// App Store Connect requires a working Privacy Policy URL in the listing, and App Review
// opens both links by hand. The Render backend is on the free tier: it sleeps after ~15
// minutes idle and takes ~50 seconds to wake, so a reviewer clicking Privacy Policy would
// have watched a spinner or timed out — on the one link Apple is guaranteed to open.
//
// UPDATED 25 Aug 2026: americanrider.app exists, the server is on a paid instance that never
// sleeps, and it serves /terms and /privacy itself. The reason for the separate Cloudflare
// Pages copy — a free instance that took ~50 seconds to wake, on the one link App Review is
// guaranteed to open — no longer holds, and one copy of the wording is better than two that
// can drift. The pages.dev deployment stays up until the App Store listing is updated.
export const SMART_TRAVEL_NEW_BOOKINGS_ENABLED = false; // Founder launch pause: keep existing journeys recoverable.
// The owned corporate site serves Terms, Privacy and account-deletion pages.
// This is a website URL, not an iOS or Android package identifier.
export const LEGAL_URL = 'https://americanrider.tech';
