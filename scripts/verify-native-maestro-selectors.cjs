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
  assert.ok(src.includes('- assertVisible: "Sign in to your account."'),
    path+': verify exact sign-in page, not text behind another screen');
  assert.ok(src.includes('- assertNotVisible: "Create your account"'),
    path+': reject signup screen that was wrongly accepted on real iOS');
  assert.ok(src.includes('platform: Android') && src.includes('platform: iOS'),
    path+': use correct platform-specific keyboard behavior');
  assert.ok(src.includes('- tapOn: "Sign in to your account."'),
    path+': iOS keyboard workaround uses a harmless static heading');
  assert.ok(src.includes('- assertVisible: "Sign In"'),
    path+': auth-primary-action is shared with Create Account, ensure correct label');
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


// Prevent another costly Android compile from succeeding and then failing
// because an untested aapt2 invocation or artifact order was wrong.
// This inexpensive contract runs in the isolated safety job on Linux.
const nativeWorkflow=fs.readFileSync('.github/workflows/native-commercial-end-to-end.yml','utf8');
assert.ok(nativeWorkflow.includes('dump xmltree --file AndroidManifest.xml "$APK"'),
  'AAPT2 xmltree requires --file AndroidManifest.xml before the APK');
assert.ok(nativeWorkflow.includes('dump resources "$APK"'),
  'AAPT2 resource inspection must receive the compiled APK');
const compiled=nativeWorkflow.indexOf('NODE_ENV=production ./gradlew --no-daemon');
const preserved=nativeWorkflow.indexOf('cp app/build/outputs/apk/release/app-release.apk');
const hashed=nativeWorkflow.indexOf('shasum -a 256 app-release.apk > native.sha256');
const inspected=nativeWorkflow.indexOf('dump xmltree --file AndroidManifest.xml "$APK"');
assert.ok(compiled>=0&&compiled<preserved&&preserved<hashed&&hashed<inspected,
  'Save and checksum expensive Android app bytes before invoking postbuild inspectors');
const cacheStep=nativeWorkflow.indexOf('      - name: Save Android binary across QA-only test revisions');
const artifactStep=nativeWorkflow.indexOf('      - name: Preserve the exact Android APK independently of test results');
const verifierStep=nativeWorkflow.indexOf('      - name: Verify actual compiled Android manifest and resource symbols');
assert.ok(cacheStep>hashed&&artifactStep>cacheStep&&verifierStep>artifactStep,
  'Save binary cache AND upload artifact before potentially failing AAPT2 postbuild verification');
assert.ok(nativeWorkflow.includes("if: ${{ always() && matrix.platform == 'android' }}"),
  'Always preserve APK artifact when a later tool or test fails');
assert.ok(nativeWorkflow.includes('if-no-files-found: warn'),
  'Missing APK should preserve root failure without obscuring it');
console.log('PASS prebuild AAPT2 invocation and fail-safe Android APK preservation contract');
