'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Prevent repeating the Build 55 discrepancy: Apple and Google share a 46pt
// frame, but Google's custom label and mark must match Apple's native scale.
// This contract test does not replace real-device visual acceptance.
const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'AuthScreen.tsx'), 'utf8');
assert.match(source, /<AppleAuthentication\.AppleAuthenticationButton\s/);
assert.match(source, /buttonStyle=\{AppleAuthentication\.AppleAuthenticationButtonStyle\.BLACK\}/);
assert.match(source, /style=\{s\.appleButton\}/);
assert.match(source, /style=\{\(\{ pressed \}\) => \[s\.btn, s\.ssoButton, primary \? s\.btnInk : s\.btnSso/);
const apple = source.match(/appleButton:\s*\{[^}]*\}/)?.[0];
const google = source.match(/ssoButton:\s*\{[^}]*\}/)?.[0];
assert.ok(apple && google, 'Both SSO styles required');
for (const style of [apple, google]) {
  assert.match(style, /width:\s*'100%'/);
  assert.match(style, /height:\s*46\b/);
}
assert.match(source, /btnTextSso:\s*\{[^}]*fontSize:\s*17\b/);
assert.match(source, /btnSso:\s*\{[^}]*borderWidth:\s*1\.5\b/);
assert.equal((source.match(/<Svg width=\{19\} height=\{19\} viewBox="0 0 24 24">/g) || []).length, 2);
console.log('SSO geometry, typography, native Apple control: PASS (device visual check still required)');
