'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');

const ui = fs.readFileSync('src/screens/AuthScreen.tsx', 'utf8');
const labels = fs.readFileSync('src/i18n/en.ts', 'utf8');
const bundled = fs.readFileSync('src/assets/googleOfficialG.ts', 'utf8');

assert.match(bundled, /github.com\/google\/GoogleSignIn-iOS\//,
  'Google icon must originate from the first-party official Sign-In SDK');
assert.match(bundled, /GoogleSignIn\/Sources\/Resources\/google%402x.png/,
  'pin the original approved logo file');
assert.match(bundled, /data:image\/png;base64,iVBORw0KGgo/,
  'bundle the original color PNG for offline login');
assert.match(ui, /<Image\s+source=\{\{ uri: GOOGLE_OFFICIAL_G_DATA_URI \}\}/,
  'render the offline-bundled official Google mark');
assert.match(ui, /style=\{s\.googleOfficialMark\}[\s\S]*?resizeMode="contain"/,
  'preserve the official Google icon aspect ratio');
assert.match(ui, /googleOfficialMark:\s*\{\s*width:\s*17,\s*height:\s*17\s*\}/,
  'keep founder-approved 17pt logo footprint');
assert.match(ui, /ssoButton:\s*\{\s*width:\s*'100%',\s*height:\s*46/,
  'Google button must retain full-width 46pt height');
assert.match(ui, /appleOfficialButton:\s*\{\s*width:\s*'100%',\s*height:\s*46/,
  'native Apple button must match exactly in width and height');
assert.match(ui, /glyph === 'apple' \? \([\s\S]*?\) : \(\s*\/\/ Google's own multicolor G/,
  'do not restore the former hand-drawn monochrome Google path');
assert.ok(labels.includes("continueWithGoogle: 'Continue with Google'"),
  'preserve approved wording');
assert.match(ui, /btnSso:\s*\{\s*backgroundColor:\s*colors\.card/,
  'official Google G belongs on a white background');
assert.match(ui, /accessibilityIgnoresInvertColors/,
  'prevent inverted Google brand colors');
console.log('PASS: offline official Google multicolor logo, same 46pt Apple/Google controls, wording preserved');
console.log('NOT VERIFIED: final physical-device rendering or provider sign-in');
