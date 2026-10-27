'use strict';
// Fail a cheap source-contract test rather than spend hours recompiling.
// GitHub run 40559070209 captured "PASSWORD" as a static TextView;
// the password EditText's accessibility hint is "Your password".
const fs=require('node:fs');
const assert=require('node:assert/strict');
for (const role of ['traveler','operator']) {
  const path='.maestro/qa-commercial-'+role+'.yml';
  const src=fs.readFileSync(path,'utf8');
  assert.ok(src.includes('- tapOn: "Your password"'),
    path+': focus editable TextInput, not PASSWORD heading');
  assert.doesNotMatch(src,/- tapOn: "Password"/);
  assert.doesNotMatch(src,/- pressKey: enter/);
  assert.ok(src.includes('id: "auth-primary-action"') &&
    src.includes('enabled: true'),path+': verify the real Sign In button is enabled');
  assert.ok(src.includes('notVisible: "Welcome back"'),path+': require auth screen exit');
}
// Changing this cheap source-contract guard must not force rebuilding a
// binary that uses exactly the same native app sources.
const fingerprintScript=fs.readFileSync('scripts/native-build-fingerprint.cjs','utf8');
assert.ok(fingerprintScript.includes("'scripts/verify-native-maestro-selectors.cjs'"),
  'exclude non-runtime QA preflight edits from native build fingerprint');
const auth=fs.readFileSync('src/screens/AuthScreen.tsx','utf8');
assert.ok(auth.includes('testID="auth-primary-action"'),'Sign In target missing');
assert.ok(auth.includes("t('traveler.yourPasswordPh')"),'password hint wiring missing');

const booking=fs.readFileSync('.maestro/qa-commercial-traveler.yml','utf8');
assert.ok(booking.includes('- tapOn: "Search a place or address"'),
  'core destination must target the actual editable search input');
assert.ok(booking.includes('- inputText: "Wynwood"'),
  'local QA booking must not rely on missing commercial geocoder credentials');
assert.doesNotMatch(booking,/- inputText: "Miami International Airport"/,
  'separate airport acceptance from core isolated commercial Travel');
const {destinationsNear}=require('../backend/places');
const origin={lat:25.7617,lng:-80.1918};
const suggestions=destinationsNear(origin,20).destinations;
assert.ok(suggestions.some(item=>item.name==='Wynwood'),
  'the isolated emulator must offer the same Wynwood destination as Maestro');
console.log('PASS prebuild Maestro target contract: editable password + enabled native Sign In');
