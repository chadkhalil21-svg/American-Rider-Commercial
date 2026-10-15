'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
const state=read('src/state/OperatorContext.tsx'),presence=read('src/backend/presence.ts');
const consent=state.indexOf('const consented = await confirmOperatorBackgroundLocationUse()');
const position=state.indexOf('const here = await resolveOperatorDutyPosition({ requestPermission: true })');
assert.ok(consent>=0 && position>consent,'disclose before obtaining duty position');
assert.match(state,/if \(!consented\) \{[\s\S]*setOnlineState\(false\);[\s\S]*return;/);
assert.match(presence,/Platform.OS !== 'android'/);
assert.match(presence,/Location.getBackgroundPermissionsAsync\(\)/);
assert.match(presence,/Alert.alert\(/);
assert.match(presence,/\{ cancelable: false \}/);
assert.match(presence,/Location.requestBackgroundPermissionsAsync\(\)/);
for(const language of ['en','es','fr','it','de']){
  const file=read('src/i18n/'+language+'.ts');
  for(const key of ['bgLocationConsentTitle','bgLocationConsentExplanation','bgLocationConsentNotNow','bgLocationConsentContinue','bgLocationConsentDeclined'])assert.ok(file.includes(key+': '),language+': '+key);
}
const en=read('src/i18n/en.ts');
assert.match(en,/bgLocationConsentExplanation:[^\n]*collects location data/);
assert.match(en,/bgLocationConsentExplanation:[^\n]*app is closed or not in use/);
assert.match(en,/bgLocationConsentExplanation:[^\n]*conclude operations/);
console.log('PASS Android location consent before OS request, reject remains off duty, all five languages');
