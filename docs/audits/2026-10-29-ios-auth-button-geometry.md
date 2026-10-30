# iOS authentication button: Build 58 visible geometry regression

## Verified failure

Founder-supplied signed TestFlight Build 58 iPhone screenshot has full-width
Apple black capsule and Google white rounded rectangle. They are not visually
equivalent although the old source-only tests passed equal 36pt heights.

An independent pixel analysis of that *actual* 1170x2532 screenshot yielded:

| Source | Visible height | Approximate left corner radius | Radius / height |
| --- | ---: | ---: | ---: |
| Native Apple | 104 px | 52 px | 0.500 |
| Google custom | 108 px | 29 px | 0.269 |

Normalized shape divergence is 0.231, above a proposed 0.08 tolerance.
The private screenshot must not be copied into the repository to fabricate QA.

## Founder-selected design (updated after pill preview)

- Preserve genuine native AppleAuthenticationButton, original black background,
  accessibility, Continue wording and the actual onPress logic.
- Request native Apple cornerRadius=12 to match the app's rounded rectangles.
- Explicitly set Google's 12pt rounded rectangle radius on its 36pt SSO style.
  Keep the genuine bundled Google multicolor G. Avoid pill-shaped 18pt corners.
- Use Google's published light 1px outline #747775. Keep white fill.
- Keep both widths at 100%, visible heights at 36pt, effective 46pt touch
  regions, 15pt Google text and iOS user-selected locale.
- Do not change the logo, tagline, email entry, blank-space arrangement,
  sign-in flow, or the broader front door. No homemade Apple artwork.

## Exact typography correction (Build 58 repeat defect)
Founder explicitly requires *both* provider titles to use Google's smaller typography,
not Apple's visibly larger native wording. Build 58 source-only tests failed
because `ASAuthorizationAppleIDButton` owns its own font, and its React Native
wrapper does not expose the title font size. Apple's HIG allows a custom sign-in
button with adjusted font size/weight so long as its official logo and
permitted black/white title and fill are preserved.

Production now uses ONE shared `SsoButton` React Native `Text` for both
providers: `fontSize:15`, `fontWeight:'600'`, same system font family,
same 36pt visible button, 12pt rectangle corner radius, and hitSlop 5 (46pt
effective target). Apple asset is the **unmodified, bundled Apple-hosted PNG**
from `https://appleid.cdn-apple.com/appleid/button/logo`, with SHA-1 Git
blob `aa3d1ada4145ec0d3a0438b273dfdedab016e027`. No hand-drawn
Apple logo is displayed. This changes only the visual entry button; the
`onApple` handler still invokes `signInWithApple()` with nonce/Firebase
credential validation. Google retains the official bundled multicolor G.

**Mandatory signed-device gate:** inspect actual iPhone rendered title
text bounds and baselines (not merely style properties), in the same locale
and accessibility text settings. Reject the build if Apple's text appears
larger or visibly heavier than Google's, if Apple glyph/logo is cropped or
poorly proportioned, or if either provider fails to authenticate.

Official guidance: https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple/
Apple-provided logo API:
https://developer.apple.com/documentation/signinwithapplerestapi/get-a-sign-in-with-apple-button-that-contains-just-the-apple-logo.
Google branding: https://developers.google.com/identity/branding-guidelines

## Required verification before calling this visually correct

1. Source, CI, TypeScript, translation and provider-auth regression checks pass.
2. Build and install the exact proposed release SHA on **a signed physical iPhone**.
3. Obtain an unmodified screenshot at the device's native pixel resolution.
4. Use `python scripts/check-auth-sso-shapes.py screenshot.png
   --apple START:END --google START:END` with rough button Y intervals;
   Pillow is required. This compares actual visible corner shape rather than
   trusting style object fields. Normalize for device scale. Require both
   approximately matching rectangular corner ratios (below 0.42 height).
   The original Build 58 screenshot fails this check as intended.
5. Visually confirm borders, equal left/right edges, comparable perceived text
   weight and icons; include landscape, a narrow iPhone, enlarged text, and
   each supported language so text does not clip.
6. Tap each Apple and Google button on a signed physical device, verify the
   respective native OAuth flow starts, cancel and retry without a crash.
   Verify VoiceOver names and minimum accessible touch targets.
7. Store the exact SHA, build number, native screenshots, device/OS/locale and
   test results in the release evidence ledger. No pass without evidence.

**Sources:** Apple Human Interface Guidelines, Sign in with Apple; Expo
AppleAuthentication documentation (use `cornerRadius`, not
`style.borderRadius`); Google Identity Sign in with Google branding
guidelines (pill/rectangular allowed; Google light stroke #747775).

**Important:** Build 58's Apple native button appeared pill-shaped despite
`cornerRadius={12}` being present in its source. Neither Expo nor Apple documents
this as an intended behavior. Do not claim the change fixes native rendering
without a new signed-device screenshot. If Apple's native result still differs,
investigate exact iOS/Expo native implementation before any TestFlight release.

**State:** Source correction committed. Physical signed-device result remains
**PENDING**, not a successful end-to-end visual test.
