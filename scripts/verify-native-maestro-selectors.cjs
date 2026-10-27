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
const auth=fs.readFileSync('src/screens/AuthScreen.tsx','utf8');
assert.ok(auth.includes('testID="auth-primary-action"'),'Sign In target missing');
assert.ok(auth.includes("t('traveler.yourPasswordPh')"),'password hint wiring missing');
console.log('PASS prebuild Maestro target contract: editable password + enabled native Sign In');
