# ADR 0016 — Android Operator background location disclosure

**2026-10-15. Candidate; pending exact-commit CI and physical-device review.**

## Confirmed source/policy gap
Android declares background location in `app.json`. The existing Operator duty flow previously requested a position and later background-location permission without first showing a clearly scoped, affirmative Android disclosure. Google Play policy requires an obvious in-app explanation before runtime permission, including background/closed-app use. Expo warns that Android 11+ may open Settings for background permission.

Primary policy sources:
- https://support.google.com/googleplay/android-developer/answer/9799150
- https://docs.expo.dev/versions/v57.0.0/sdk/location/
- https://developer.android.com/develop/sensors-and-location/location/permissions/background

## Decision
On Android only, when an Operator taps Commence Operations and has not already granted background permission, show the purpose, when location is collected (even if the app is closed/not in use), cessation on concluding operations, and non-advertising use. Continue proceeds to existing permission/duty checks; Not now (declined) leaves service OFF and does not request new position. Travelers, web and iOS do not see this Android-only disclosure. Existing server authority for screening, insurance, Stripe, dispatch and Traveler Total remains intact. There is no county/founder administrative gate or fare change.

Five languages, TypeScript, Firestore, regression, and six GitHub campaigns must pass before merging. A signed Android physical device and Google Play Console declaration/video must still separately be verified; synthetic checks do not constitute approval.

Council reference: Google Play (least privilege and transparency), NASA (validate actual operating devices), Jobs (explain in context), Ford (one repeatable process).
