'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync('src/screens/AuthScreen.tsx','utf8');

// Apple official native artwork and Google's bundled official color mark.
// Width and 46pt height match, while native typography needs device review.
assert.ok(source.includes('<AppleAuthentication.AppleAuthenticationButton'));
assert.ok(source.includes('buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}'));
assert.ok(source.includes('buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}'));
assert.match(source, /appleOfficialButton:\s*\{\s*width:\s*'100%',\s*height:\s*46\s*\}/);
assert.ok(source.includes('<GoogleEntry'));
assert.match(source, /ssoButton:\s*\{\s*width:\s*'100%',\s*height:\s*46\b/);
assert.match(source, /btnText:\s*\{\s*fontSize:\s*15\b/);
assert.match(source, /googleOfficialMark:\s*\{\s*width:\s*17,\s*height:\s*17\s*\}/);
assert.ok(source.includes('source={{ uri: GOOGLE_OFFICIAL_G_DATA_URI }}'));
assert.ok(!source.includes('d="M21.6 12.23c0-.71'));
console.log('PASS: Equal 46pt Apple/Google sign-in buttons, approved brand marks and wording');
console.log('Native typography and live provider auth still need physical-device verification');
