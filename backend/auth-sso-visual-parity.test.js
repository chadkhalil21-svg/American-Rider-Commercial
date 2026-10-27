'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Regression contract for the iOS Build 55 size mismatch.
// Both Apple and Google use the same responsive custom button geometry.
// Final visual inspection and Apple's brand artwork approval remain separate.
const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'AuthScreen.tsx'), 'utf8');
assert.doesNotMatch(source, /<AppleAuthentication\.AppleAuthenticationButton\s/);
assert.match(source, /<SsoButton label=\{t\('auth\.continueWithApple'\)\} onPress=\{onApple\} glyph="apple" primary \/>/);
assert.match(source, /<GoogleEntry\s+label=\{t\('auth\.continueWithGoogle'\)\}/);
assert.match(source, /style=\{\(\{ pressed \}\) => \[s\.btn, s\.ssoButton, primary \? s\.btnInk : s\.btnSso/);
const button = source.match(/ssoButton:\s*\{[^}]*\}/)?.[0];
assert.ok(button, 'Shared Apple and Google button style is required');
assert.match(button, /width:\s*'100%'/);
assert.match(button, /height:\s*46\b/);
assert.match(source, /btnText:\s*\{\s*fontSize:\s*15\b/);
assert.match(source, /ssoInner:\s*\{[^}]*alignItems:\s*'center'/);
assert.match(source, /btnSso:\s*\{[^}]*borderWidth:\s*1\b/);
assert.equal((source.match(/<Svg width=\{17\} height=\{17\} viewBox="0 0 24 24">/g) || []).length, 2);
console.log('PASS: 46pt Apple / Google, identical 15pt label and 17pt glyph, original wording retained');
