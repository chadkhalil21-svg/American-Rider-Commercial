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

## Authorized design fix

- Preserve genuine native AppleAuthenticationButton, original black background,
  accessibility, Continue wording and the actual onPress logic.
- Request native Apple cornerRadius=18 (36pt/2).
- Explicitly override Google's shared 12pt button radius with 18pt on
  its own 36pt SSO style. Keep the genuine bundled Google multicolor G.
- Use Google's published light 1px outline #747775. Keep white fill.
- Keep both widths at 100%, visible heights at 36pt, effective 46pt touch
  regions, 15pt Google text and iOS user-selected locale.
- Do not change the logo, tagline, email entry, blank-space arrangement,
  sign-in flow, or the broader front door. No homemade Apple artwork.

## Required verification before calling this visually correct

1. Source, CI, TypeScript, translation and provider-auth regression checks pass.
2. Build and install the exact proposed release SHA on **a signed physical iPhone**.
3. Obtain an unmodified screenshot at the device's native pixel resolution.
4. Use `python scripts/check-auth-sso-shapes.py screenshot.png
   --apple START:END --google START:END` with rough button Y intervals;
   Pillow is required. This compares actual visible corner shape rather than
   trusting style object fields. Normalize for device scale. The original
   Build 58 screenshot fails this check as intended.
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

**State:** Source correction committed. Physical signed-device result remains
**PENDING**, not a successful end-to-end visual test.
