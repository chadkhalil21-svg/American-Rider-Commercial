'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const src = fs.readFileSync(path.join(__dirname,'../src/backend/backgroundPresencePolicy.ts'),'utf8');
const m = {exports:{}};
vm.runInNewContext(ts.transpileModule(src,{compilerOptions:{
  module: ts.ModuleKind.CommonJS,target: ts.ScriptTarget.ES2022,
}}).outputText,{exports:m.exports,module:m,Date,Number});
const { validBackgroundFix,backgroundRenewalDue,backgroundMovementDue,BACKGROUND_RENEWAL_MIN_MS }=m.exports;
assert.equal(BACKGROUND_RENEWAL_MIN_MS,90000);
const NOW=Date.UTC(2026,9,18,12);
const fix={ coords:{latitude:25.7,longitude:-80.3,accuracy:20},timestamp:NOW };
for(let repeat=0;repeat<2;repeat++){
  assert.equal(validBackgroundFix(fix,NOW),true);
  assert.equal(validBackgroundFix({...fix,timestamp:NOW-90000},NOW),true);
  assert.equal(validBackgroundFix({...fix,timestamp:NOW-90001},NOW),false,'never report old queued fixes as a current phone');
  assert.equal(validBackgroundFix({...fix,timestamp:NOW+5001},NOW),false);
  assert.equal(validBackgroundFix({...fix,coords:{...fix.coords,accuracy:151}},NOW),false);
  assert.equal(validBackgroundFix({...fix,coords:{...fix.coords,accuracy:null}},NOW),false);
  assert.equal(validBackgroundFix({...fix,coords:{...fix.coords,latitude:92}},NOW),false);
  assert.equal(validBackgroundFix({...fix,coords:{...fix.coords,longitude:-181}},NOW),false);
  assert.equal(validBackgroundFix({...fix,mocked:true},NOW),false);
  assert.equal(backgroundRenewalDue(0,NOW),true);
  assert.equal(backgroundRenewalDue(NOW-89999,NOW),false,'fast GPS callbacks must not generate repeated backend reads');
  assert.equal(backgroundRenewalDue(NOW-90000,NOW),true);
  assert.equal(backgroundRenewalDue(NOW+5,NOW),true,'clock glitches cannot indefinitely suppress a retry');
  const parked={latitude:25.7,longitude:-80.3};
  const moved={latitude:25.705,longitude:-80.3};
  const smallMove={latitude:25.7001,longitude:-80.3};
  assert.equal(backgroundMovementDue(NOW-29999,parked,moved,NOW),false);
  assert.equal(backgroundMovementDue(NOW-30000,parked,smallMove,NOW),false);
  assert.equal(backgroundMovementDue(NOW-30000,parked,moved,NOW),true,
    'moving car needs timely location while parked device conserves uploads');
  assert.equal(backgroundMovementDue(NOW-60000,null,moved,NOW),false);

}
const native=fs.readFileSync(path.join(__dirname,'../src/backend/presence.ts'),'utf8');
const ctx=fs.readFileSync(path.join(__dirname,'../src/state/OperatorContext.tsx'),'utf8');
const app=JSON.parse(fs.readFileSync(path.join(__dirname,'../app.json'),'utf8'));
assert.match(native,/distanceInterval: 0/, 'parked Operators must not have a movement gate on either OS');
assert.doesNotMatch(native,/if \(Platform\.OS !== 'ios'\) return true/,
  'existing Android registrations must also upgrade from the old 150 m filter');
assert.match(native,/TaskManager\.getTaskOptionsAsync/, 'reinspect persisted tasks on upgrades on both operating systems');
assert.match(native,/Number\(options\.distanceInterval\) === 0/, 'do not re-register task unnecessarily');
assert.match(native,/Location\.getBackgroundPermissionsAsync\(\)/, 'do not restore revoked background permission');
assert.match(native,/const permission = await Location\.getBackgroundPermissionsAsync\(\);[\s\S]*?if \(!permission\.granted\) return false;[\s\S]*?const options = await TaskManager\.getTaskOptionsAsync/,
  'existing zero-distance registration must recheck permission before reporting it available');
assert.match(native,/await Location\.startLocationUpdatesAsync\(PRESENCE_TASK/, 'updated options are passed to native task');

assert.match(native,/if \(!last \|\| !validBackgroundFix\(last\)\) return/);
assert.match(native,/!backgroundRenewalDue\(lastBackgroundAcceptedAt\)/);
assert.match(native,/!backgroundMovementDue\(/);
assert.match(native,/lastBackgroundAcceptedPosition = \{ latitude: last\.coords\.latitude/);
assert.match(native,/response\.ok && result\?\.ok === true/,'HTTP success without server receipt must not mark accepted');
assert.match(native,/lastBackgroundAcceptedAt = Date\.now\(\)/);
assert.match(native,/finally \{\s*backgroundRequestInFlight = false;/);
assert.match(ctx,/if \(!here\) \{[\s\S]*?setOnlineError\(tr\('traveler\.gateLocation'\)\)/,
  'foreground reactivation must disclose unavailable GPS');
assert.match(ctx,/if \(next === 'active' && prior !== 'active'\) void renew\(\)/);
assert.ok(app.expo.ios.infoPlist.UIBackgroundModes.includes('location'));
assert.ok(app.expo.android.permissions.includes('android.permission.FOREGROUND_SERVICE_LOCATION'));
console.log('PASS twice: real-fix eligibility, throttled background renewal, iOS stationary configuration and Operator warning');
