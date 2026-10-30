'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Regression contract for the iOS Build 55 size mismatch.
// Apple retains its official native artwork; Google matches its 46pt footprint,
// title scale and official G proportions. Signed-device comparison remains separate.
const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'AuthScreen.tsx'), 'utf8');
assert.match(source, /<AppleAuthentication\.AppleAuthenticationButton\s/, 'production iOS must render Apple-provided official artwork');
assert.match(source, /buttonType=\{AppleAuthentication\.AppleAuthenticationButtonType\.CONTINUE\}/);
assert.match(source, /buttonStyle=\{AppleAuthentication\.AppleAuthenticationButtonStyle\.BLACK\}/);
assert.match(source, /appleOfficialButton:\s*\{\s*width:\s*'100%',\s*height:\s*46\s*\}/);
assert.match(source, /\{appleReady \? \(/, 'official Apple button must be used whenever the OS supports Apple auth');
assert.match(source, /<GoogleEntry\s+label=\{t\('auth\.continueWithGoogle'\)\}/);
assert.match(source, /style=\{\(\{ pressed \}\) => \[s\.btn, s\.ssoButton, primary \? s\.btnInk : s\.btnSso/);
const button = source.match(/ssoButton:\s*\{[^}]*\}/)?.[0];
assert.ok(button, 'Shared Apple and Google button style is required');
assert.match(button, /width:\s*'100%'/);
assert.match(button, /height:\s*46\b/);
assert.match(source, /btnText:\s*\{\s*fontSize:\s*15\b/);
assert.match(source, /btnTextSso:\s*\{[^}]*fontSize:\s*19\b[^}]*fontWeight:\s*'500'/,
  'Google title must visually match the native Apple 46pt control, not inherit the smaller 15pt body font');
assert.match(source, /ssoInner:\s*\{[^}]*alignItems:\s*'center'/);
assert.match(source, /btnSso:\s*\{[^}]*borderWidth:\s*1\b/);
assert.equal((source.match(/<Svg width=\{17\} height=\{17\} viewBox="0 0 24 24">/g) || []).length, 1,
  'only the nonproduction Apple preview may use its previous SVG');
assert.match(source, /source=\{GOOGLE_OFFICIAL_G_SOURCE\}/,
  'Google must use locally bundled official full-color identity art even when offline');
const googleAsset = fs.readFileSync(path.join(__dirname, '..', 'src', 'brand', 'googleOfficialG.ts'), 'utf8');
assert.match(googleAsset, /github\.com\/google\/GoogleSignIn-iOS\/blob\/main\/GoogleSignIn\/Sources\/Resources\/google@2x\.png/);
assert.match(googleAsset, /data:image\/png;base64,iVBORw0KGgo/);
assert.match(source, /googleOfficialMark:\s*\{ width: 20, height: 20 \}/,
  'Google icon must match its 19pt title and native Apple brand mark');
console.log('PASS: equal 46pt native Apple and official Google controls, Google 19pt title and 20pt unmodified G');
