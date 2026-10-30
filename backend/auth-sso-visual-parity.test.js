'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Preferred compact sign-in: native Apple and official Google use equal 36pt visible
// buttons with 15pt-scale lettering and a 46pt minimum interaction region.
// Signed-device comparison remains separate: code properties cannot prove
// the Apple native control actually renders the same outline as Google.
const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'AuthScreen.tsx'), 'utf8');
assert.match(source, /<AppleAuthentication\.AppleAuthenticationButton\s/, 'production iOS must render Apple-provided official artwork');
assert.match(source, /buttonType=\{AppleAuthentication\.AppleAuthenticationButtonType\.CONTINUE\}/);
assert.match(source, /buttonStyle=\{AppleAuthentication\.AppleAuthenticationButtonStyle\.BLACK\}/);
assert.match(source, /cornerRadius=\{12\}/, 'Apple official button must request 12pt rounded-rectangle corner radius');
assert.match(source, /appleOfficialButton:\s*\{\s*width:\s*'100%',\s*height:\s*36\s*\}/);
assert.match(source, /appleTouchFrame:\s*\{[^}]*height:\s*46\b/);
assert.match(source, /pointerEvents="none"/, 'native artwork delegates the full-size hit target to the parent');
assert.match(source, /\{appleReady \? \(/, 'official Apple button must be used whenever the OS supports Apple auth');
assert.match(source, /<GoogleEntry\s+label=\{t\('auth\.continueWithGoogle'\)\}/);
assert.match(source, /style=\{\(\{ pressed \}\) => \[s\.btn, s\.ssoButton, primary \? s\.btnInk : s\.btnSso/);
const button = source.match(/ssoButton:\s*\{[^}]*\}/)?.[0];
assert.ok(button, 'Shared Apple and Google button style is required');
assert.match(button, /width:\s*'100%'/);
assert.match(button, /height:\s*36\b/);
assert.match(button, /borderRadius:\s*12\b/, 'Google visible 36pt button must request institutional rounded rectangle radius 12');
assert.match(source, /hitSlop=\{5\}/, 'Google touch target remains at least 46pt tall');
assert.match(source, /btnText:\s*\{\s*fontSize:\s*15\b/);
assert.match(source, /btnTextSso:\s*\{[^}]*fontSize:\s*15\b[^}]*fontWeight:\s*'600'/,
  'preserve founder-preferred compact Google lettering');
assert.match(source, /ssoInner:\s*\{[^}]*alignItems:\s*'center'/);
assert.match(source, /btnSso:\s*\{[^}]*borderWidth:\s*1\b/);
assert.match(source, /btnSso:\s*\{[^}]*borderColor:\s*'#747775'/,
  'Google official light theme requires approved grey one-pixel outline');
assert.equal((source.match(/<Svg width=\{17\} height=\{17\} viewBox="0 0 24 24">/g) || []).length, 1,
  'only the nonproduction Apple preview may use its previous SVG');
assert.match(source, /source=\{GOOGLE_OFFICIAL_G_SOURCE\}/,
  'Google must use locally bundled official full-color identity art even when offline');
const googleAsset = fs.readFileSync(path.join(__dirname, '..', 'src', 'brand', 'googleOfficialG.ts'), 'utf8');
assert.match(googleAsset, /github\.com\/google\/GoogleSignIn-iOS\/blob\/main\/GoogleSignIn\/Sources\/Resources\/google@2x\.png/);
assert.match(googleAsset, /data:image\/png;base64,iVBORw0KGgo/);
assert.match(source, /googleOfficialMark:\s*\{ width: 17, height: 17 \}/,
  'preserve proportionate Google artwork');
console.log('PASS SOURCE ONLY: 36pt visible Apple/Google rounded rectangles requested with 12pt radius; native result still requires screenshot validation');
console.log('PENDING: physical signed iPhone screenshot pixel comparison before any claim of visual parity');
