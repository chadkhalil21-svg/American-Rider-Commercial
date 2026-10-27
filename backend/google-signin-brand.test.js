'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');

const ui = fs.readFileSync('src/screens/AuthScreen.tsx', 'utf8');
const labels = fs.readFileSync('src/i18n/en.ts', 'utf8');
const source = 'https://developers.google.com/static/identity/images/g-logo.png';

// Vendor-reviewed official full-color Google sign-in logo is served directly
// from the Google-owned identity branding endpoint documented 7 July 2026.
// No local tracing, recoloring, masking or Google sign-in SDK migration.
assert.ok(ui.includes(source), 'Google G must be sourced from its official Google branding endpoint');
assert.match(ui, /<Image\s+source=\{\{ uri: 'https:\/\/developers\.google\.com\/static\/identity\/images\/g-logo\.png' \}\}/);
assert.match(ui, /style=\{s\.googleOfficialMark\}[\s\S]*?resizeMode="contain"/,
  'official Google logo must keep its 1:1 proportions');
assert.match(ui, /googleOfficialMark:\s*\{\s*width:\s*17,\s*height:\s*17\s*\}/,
  'founder-approved visible mark dimensions must not change');
assert.match(ui, /ssoButton:\s*\{\s*width:\s*'100%',\s*height:\s*46/,
  'preserve 46pt Google sign-in button height');
assert.match(ui, /appleOfficialButton:\s*\{\s*width:\s*'100%',\s*height:\s*46/,
  'preserve 46pt Apple native sign-in button height');
assert.match(ui, /glyph === 'apple' \? \([\s\S]*?\) : \(\s*\/\/ Source: Google's current official multicolor/,
  'monochrome hand-drawn G must not remain in the production branch');
assert.ok(labels.includes("continueWithGoogle: 'Continue with Google'"),
  'preserve the existing button wording');
assert.match(ui, /btnSso:\s*\{\s*backgroundColor:\s*colors\.card/,
  'Google sign-in logo must sit on the actual white card background');
assert.match(ui, /accessibilityIgnoresInvertColors/,
  'OS accessibility inversion cannot recolor the vendor-supplied logo');
console.log('PASS: official multicolor Google G, 17pt artwork, 46pt sign-in and original labels');
console.log('NOT VERIFIED: asset fetch on signed hardware, Google account OAuth, or provider approval');
