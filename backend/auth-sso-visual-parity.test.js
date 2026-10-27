'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Regression contract for the iOS Build 55 size mismatch.
// Both Apple and Google use the same responsive custom button geometry.
// Final visual inspection and Apple's brand artwork approval remain separate.
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
assert.match(source, /ssoInner:\s*\{[^}]*alignItems:\s*'center'/);
assert.match(source, /btnSso:\s*\{[^}]*borderWidth:\s*1\b/);
assert.equal((source.match(/<Svg width=\{17\} height=\{17\} viewBox="0 0 24 24">/g) || []).length, 1,
  'only the nonproduction Apple preview may use its previous SVG');
assert.match(source, /source=\{\{ uri: 'https:\/\/developers\.google\.com\/static\/identity\/images\/g-logo\.png' \}\}/,
  'Google must use the official current full-color identity mark');
assert.match(source, /googleOfficialMark:\s*\{ width: 17, height: 17 \}/,
  'preserve the founder-approved 17pt logo footprint');
console.log('PASS: 46pt Apple official native button / Google 46pt with official full-color 17pt G; labels preserved');
