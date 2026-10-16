'use strict';
// Prelaunch guard: do not mistake synthetic money, quota arithmetic, or a native-test
// configuration for live Stripe settlement, metered Firebase capacity, or a device pass.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const source = rel => fs.readFileSync(path.join(root,rel),'utf8');

const online = source('src/state/OperatorContext.tsx');
const server = source('backend/server.js');
const synthetic = source('backend/synthetic-provider-chain.test.js');
const nativeFlow = source('.maestro/prelaunch-front-door.yml');
const nativeConfig = source('.eas/workflows/prelaunch-native-smoke.yml');
const eas = JSON.parse(source('eas.json'));
const app = JSON.parse(source('app.json')).expo;

// Run twice to catch accidental state dependence in the capacity accounting.
for (let pass=1;pass<=2;pass++) {
  const renew = online.match(/PRESENCE_RENEW_MS\s*=\s*([\d_]+)\s*;/);
  assert(renew,'Read the actual Operator check-in period; do not hard-code it in capacity reporting.');
  const ms = Number(renew[1].replace(/_/g,''));
  assert(ms > 0);
  assert.match(server,/setGeographicFleetOnline\(\{ db, operatorId: req\.uid, fleetUpdate/);
  const shifts = 100, hours = 8;
  const checkIns = shifts * hours * 60 * 60 * 1000 / ms;
  assert.equal(checkIns,32000,'If the check-in cadence changes, review capacity instead of repeating the old estimate.');
  assert(checkIns > 20000,'A zero-other-traffic Spark free write assumption cannot support this 100-Operator shift scenario.');
  assert.equal(Math.floor(20000/(hours*60*60*1000/ms)),62,
    '62 Operators is a theoretical zero-other-writes bound, not a certified user capacity.');

  assert.match(synthetic,/const Stripe = require\('stripe'\)/);
  assert.match(synthetic,/constructEvent\(/);
  assert.match(synthetic,/run\(pass\)/);
  assert.match(synthetic,/OFFLINE/);
  assert.match(server,/app\.post\('\/travel\/prepare'/);
  assert.match(server,/code:'travel_total_changed'/);
  assert.match(server,/const payment = await verifiedTravelPayment\(ride\.paymentIntentId\)/);
  assert.match(server,/paymentMatches\(ride, payment, req\.uid, id\)/);

  assert.equal(app.ios.bundleIdentifier,app.android.package,
    'One Maestro application ID must match both native builds.');
  assert.equal(app.ios.bundleIdentifier,'com.americanrider.app');
  assert.equal(eas.build['prelaunch-ui-e2e'].ios.simulator,true);
  assert.equal(eas.build['prelaunch-ui-e2e'].android.buildType,'apk');
  assert.equal(eas.build['prelaunch-ui-e2e'].withoutCredentials,true);
  assert.match(nativeConfig,/type: maestro/);
  assert.match(nativeConfig,/flow_path:/);
  // Expo documents macOS workers for iOS Simulator and nested virtualized Linux for Android.
  // The ordinary default Linux worker cannot host either requested emulator correctly.
  assert.match(nativeConfig,/test_ios:[\s\S]*?runs_on:\s*macos-medium\b/);
  assert.match(nativeConfig,/test_android:[\s\S]*?runs_on:\s*linux-medium-nested-virtualization\b/);
  assert.doesNotMatch(nativeConfig,/\bon:\s*\n\s*(pull_request|push|schedule)/,
    'Never automatically incur native cloud-build cost.');
  assert.match(nativeFlow,/launchApp:/);
  assert.match(nativeFlow,/assertVisible: ["']?AMERICAN RIDER/);
  assert.match(nativeFlow,/Welcome back/);
}
console.log('PASS twice: payment-source contracts, 100-Operator Firestore write-budget warning, and manual native E2E smoke setup');
console.log('BOUNDARY: no payment-network request, no firebase-billing access, no HTTP load, and no iOS/Android EAS build or device run.');
