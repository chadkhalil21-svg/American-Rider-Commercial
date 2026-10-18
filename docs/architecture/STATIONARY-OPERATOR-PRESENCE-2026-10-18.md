# American Rider · Stationary Operator availability: iPhone, Google, H3
Date: 2026-10-18. STATUS: PR proposal only; NOT deployed and NOT physical-device certified.
Production repository: chadkhalil21-svg/American-Rider-Commercial / release/current.

## Already built; do not rebuild
- Operator manually taps **Commence Operations** once. On-duty foreground renewal runs about every 90 seconds and on app return. Expo TaskManager provides native location callbacks in the background where permitted.
- The backend stores `onlineAt` on accepted duty renewal, not on mere UI appearance. `backend/matching.js` disqualifies a record after five minutes with no successful renewal. That is an engineering grace interval, **not** a legal statute or an automatic cancellation of an ongoing Travel.
- The existing matching code searches neighboring geohash cells and chooses eligible nearby Operators. Google supports geohash with exact-distance post-filtering; Uber H3 is a separate potential optimization, **not** a stationary-presence fix. Do not alter geohash queries or add H3 to address this defect.
- The app already has iOS `UIBackgroundModes: location`, Android background/foreground-service permissions, the background location indicator/Android notification, and an existing warning when background permission is unavailable. Earlier PR #87 showed foreground renewal network errors.

## Actual defect
On both platforms, an existing `distanceInterval: 150` movement rule can yield **no event while parked**, so no fresh request arrives for five minutes even when cellular/Wi-Fi works. Expo `timeInterval` is Android-only and cannot guarantee iOS timing. Apple may also stop location delivery when stationary, and a suspended JS timer is NOT a reliable fallback. The currently installed TestFlight build's behavior has NOT been proven for a stationary, locked iPhone.

## Change in this PR
1. On **both iOS and Android while duty is active**, request location-event opportunities without a 150 m movement requirement (`distanceInterval: 0`), retaining `Accuracy.Balanced` and explicit location permissions. Android retains its visible foreground service and 60-second requested interval; iOS retains its background indicator and automatic-pause opt-out. The server still limits acknowledged parked renewals to once per 90 seconds. Either OS may delay delivery; measure battery use on both devices.
2. **Reject old, inaccurate, invalid and mocked GPS fixes** before posting an Operator online renewal. A queued GPS fix is not evidence that the phone is still at that position.
3. **Throttle successful background renewals adaptively:** while parked, no more often than 90 seconds; when a vehicle has moved at least 300 m, allow a position refresh after at least 30 seconds. The native process retains a single-flight guard. A server `200` alone is insufficient; `{ok:true}` is required. Failures never extend the throttle, do not invent acceptance, and may retry on the next new OS callback. A task process restart can send one additional accepted request.
4. If foreground resume cannot obtain any reliable fix, show the existing localized location warning on **In Service** until fresh renewal succeeds. Do not lie by automatically claiming the server has definitively stopped the Operator; the existing five-minute fail-closed matching rule remains authoritative.
5. Physical-device test evidence is required before turning this strategy into a claim of reliable unattended service. Do **not** replace the five-minute rule with a blind time-only heartbeat using old coordinates.
6. **Existing installed app upgrade:** TaskManager persists registrations between app sessions and updates. On **both iOS and Android**, inspect the registered task's previous `distanceInterval` when entering service. If it is still 150 m, require existing background permission and update the task options to 0 m; do not silently resume tracking after revoked consent. See Expo TaskManager `getTaskOptionsAsync` (https://docs.expo.dev/versions/latest/sdk/task-manager/).

## Engineering comparison, constraints and legal
- **Apple:** background updates require capability/permission, can pause when stationary; use the smallest viable location scope and monitor energy cost. `distanceInterval:0` improves opportunities but is not guaranteed time scheduling. Apple notes that using automotive-navigation activity hints may actually pause updates when parked, so do not present that as a fix.
- **Google Android/Play:** location in the background should be visible to the Operator, restricted to actual duty, and granted under proper permissions; foreground location services must obey Android lifecycle restrictions. A 150 m filter can also starve a parked Android Operator; use zero-distance native opportunities and the existing foreground service while throttling network traffic. Expo's later SDK 58 changelog mentions an Android background filter fix; this SDK 57 installation must be verified on a real signed device.
- **Google Firestore:** geohash bounds have false positives and billed reads, use bounded candidates and exact distance. H3 is not mandatory.
- **Uber H3:** hierarchical hexagon grid useful for city-level analysis and dispatch candidates, but solves geographic grouping rather than device liveness.
- **Florida:** §627.748 contains TNC driver/screening/insurance requirements, not a mandated five-minute availability interval. A dispatch timeout is **not proof that the Operator logged off or that logged-on insurance obligations ended**. Preserve accurate sign-on/off records for insurer claims. Do not infer statutory compliance from location tests. No lawyer was contacted in this evaluation; licensed Florida TNC and privacy counsel should review location notices, retention, permissions, public claims, and insurance.

## Signed-device acceptance before merger and production release
On an actual signed iOS TestFlight build (not Expo Go or a JS simulator):
1. With permission explicitly granted, start duty and park in one place for **at least 20 minutes with screen locked**, then repeat with Low Power Mode. Record each accepted server `onlineAt` (not merely console output), candidate matching eligibility and Operator-visible state. Target zero false availability claims; quantify 90-second cadence variance and battery consumption.
2. Test a phone that loses mobile data/Wi-Fi, loses location permission, has Location Services disabled, is force-quit, and is stationary with GPS degraded; ensure no new Travel is offered after five minutes without fresh accepted renewal.
3. Restore connectivity and return to foreground; confirm automatic fresh GPS renewal (without pressing Commence again), visible helpful recovery warning when GPS cannot recover, and no duplicated duty or Travel.
4. Repeat a **20+ minute stationary locked-phone test on signed Android** with zero-distance updates, including foreground service notice, Doze and permission refusal. Verify server-accepted renewals while parked, battery, accessibility, push offers and accepted Trips.
5. Compare actual production/staging Cloud Run/Firestore read+write counts; at **150,000 parked on-duty Operators / 90 seconds**, simple duty traffic alone approaches **1,667 API requests per second**; the moving-vehicle 30-second lower bound may generate more if every phone sends regularly. Further billing is provider-dependent; this is not a measured capacity certification.
6. Keep `release-evidence.template.json` device/provider fields pending until screenshots/logs and build SHA are recorded.

## Staging connection
Owner's screenshot confirms Google Cloud **project name** American Rider Staging, **project ID** `american-rider-staging-2026` (project number 926320586690). This is distinct from production Firebase `american-rider-35688`. Creation does NOT establish active billing, Cloud Run, Firebase staging resources, identity federation, Scheduler, secrets, or actual deployment. GitHub workflow `.github/workflows/cloud-run-staging.yml` still requires separately approved credentials / GitHub environment; never paste secrets into the ledger. Do not redirect production traffic before the controlled cutover.

## Sources
- Apple background Core Location: https://developer.apple.com/documentation/corelocation/cllocationmanager/allowsbackgroundlocationupdates
- Apple automotive activity may pause while parked: https://developer.apple.com/documentation/corelocation/clactivitytype/automotivenavigation
- Android foreground service: https://developer.android.com/codelabs/while-in-use-location
- Expo Android background filter fix in later SDK: https://github.com/expo/expo/blob/main/packages/expo-location/CHANGELOG.md
- Apple efficient location: https://developer.apple.com/documentation/xcode/accessing-the-device-s-location-efficiently
- Google Play background location: https://support.google.com/googleplay/android-developer/answer/9799150
- Firebase geohash: https://firebase.google.com/docs/firestore/solutions/geoqueries
- Uber H3: https://www.uber.com/us/en/blog/h3/
- Florida law: https://www.flsenate.gov/Laws/Statutes/2026/627.748
