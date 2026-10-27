'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');

const ui = fs.readFileSync('src/screens/AuthScreen.tsx', 'utf8');
const labels = fs.readFileSync('src/i18n/en.ts', 'utf8');
const bundled = fs.readFileSync('src/assets/googleOfficialG.ts', 'utf8');

// Google first-party source: GoogleSignIn-iOS/Sources/Resources/google@2x.png.
// No tracing, recoloring, masking, remote fetch or SDK migration is permitted.
assert.ok(bundled.includes('https://github.com/google/GoogleSignIn-iOS/'),
  'Bundled Google G must identify the first-party Google Sign-In SDK');
assert.match(bundled, /data:image\/png;base64,iVBORw0KGgo/,
  'Bundle Google's official full-color PNG so offline icon still renders');
assert.ok(ui.includes("source={{ uri: GOOGLE_OFFICIAL_G_DATA_URI }}"),
  'Google control must render bundled logo, without a remote dependency');
assert.match(ui, /googleOfficialMark:\s*\{\s*width:\s*17,\s*height:\s*17\s*\}/,
  'Keep approved 17pt Google logo footprint');
assert.match(ui, /ssoButton:\s*\{\s*width:\s*'100%',\s*height:\s*46/,
  'Keep Google sign-in full-width and 46pt tall');
assert.match(ui, /appleOfficialButton:\s*\{\s*width:\s*'100%',\s*height:\s*46/,
  'Keep official Apple sign-in full-width and 46pt tall');
assert.ok(ui.includes("glyph === 'apple' ? ("), 'Apple preview-only mark preserved');
assert.ok(!ui.includes("d=\"M21.6 12.23c0-.71"),
  'Hand-created monochrome Google G must not remain in code');
assert.ok(labels.includes("continueWithGoogle: 'Continue with Google'"),
  'Keep approved Google button wording');
assert.ok(ui.includes('accessibilityIgnoresInvertColors'),
  'Prevent OS inversion from recoloring Google logo');
assert.match(ui, /btnSso:\s*\{\s*backgroundColor:\s*colors\.card/,
  'Preserve white Google sign-in background');
console.log('PASS: Vendor-owned multicolor Google G is bundled; Apple and Google buttons each 46pt high');
console.log('NOT PROVEN: Physical iOS/Android rendering, store approval, or live OAuth sign-in');
