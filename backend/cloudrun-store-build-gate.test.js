'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
const {CANONICAL, verifyProductionSource, verifyProductionResponses} =
  require('../scripts/verify-store-cloudrun-api.cjs');
assert.equal(verifyProductionSource(root), CANONICAL);
assert.match(CANONICAL, /^https:\/\/american-rider-api-production-\d+\.us-east1\.run\.app$/);
const normal = {
  live: {ok:true},
  health: {
    deployment:'production', stripe:'live',
    support:{firestore:'on'}, fleet:{operators:0},
    screening:'off', documents:'on', scheduler:'authenticated', operationalReady:true,
  },
  config: {mode:'live',canTakePayment:true,stripePublishableKey:'pk_live_DUMMY'}
};
assert.ok(verifyProductionResponses(normal.live, normal.health, normal.config));
const certified = '48f31bc3fe60112858f26a9be9b36b5f9391df53';
assert.ok(verifyProductionResponses(normal.live, {...normal.health, commit:certified.slice(0,7)},
  normal.config, {certifiedSha:certified}), 'exact Cloud Run commit serves certified mobile source');
assert.throws(()=>verifyProductionResponses(normal.live, {...normal.health, commit:'fffffff'},
  normal.config, {certifiedSha:certified}),/Cloud Run revision/,
  'stale Cloud Run backend blocks publication even if Stripe works');
assert.throws(()=>verifyProductionResponses(normal.live, normal.health,
  normal.config,{certifiedSha:certified}),/Cloud Run revision/,
  'missing Cloud Run commit is not evidence of matching binary');

for (const [field, bad] of [
  ['deployment','development'], ['stripe','no-key'],
  ['scheduler','off'], ['operationalReady',false],
]) {
  const data={...normal.health,[field]:bad};
  assert.throws(()=>verifyProductionResponses(normal.live,data,normal.config),
    /production|screening|scheduler|payment/, field);
}
assert.throws(()=>verifyProductionResponses(normal.live,
  {...normal.health, support:{firestore:'off'}},normal.config),/Firestore/);
assert.throws(()=>verifyProductionResponses(normal.live,
  {...normal.health, fleet:{operators:null}},normal.config),/Firestore/);
assert.throws(()=>verifyProductionResponses(normal.live,normal.health,
  {...normal.config,mode:'test'}),/payment/);
assert.throws(()=>verifyProductionResponses(normal.live,normal.health,
  {...normal.config,canTakePayment:false}),/payment/);
assert.throws(()=>verifyProductionResponses(normal.live,normal.health,
  {...normal.config,stripePublishableKey:'pk_test_DUMMY'}),/payment/);
assert.ok(verifyProductionResponses(normal.live,{...normal.health,screening:'off'},normal.config),
  'no individual screening approval is needed merely to publish platform binary');
assert.throws(()=>verifyProductionResponses({ok:false},normal.health,
  normal.config),/liveness/);
for(const workflow of [
  '.github/workflows/submit-certified-ios-testflight.yml',
  '.github/workflows/build-certified-android-play.yml',
]){
  const yaml=fs.readFileSync(path.join(root,workflow),'utf8');
  const gate=yaml.indexOf('node scripts/verify-store-cloudrun-api.cjs');
  const build=yaml.indexOf('npx --yes eas-cli@latest build');
  assert.ok(gate>=0 && build>gate, 'Cloud Run gate must precede store build: '+workflow);
}
const eas = JSON.parse(fs.readFileSync(path.join(root,'eas.json'),'utf8'));
assert.equal(eas.submit?.production?.android?.track, 'production',
  'Public Play releases must use the production track by explicit submission');
assert.equal(eas.submit?.internal?.android?.track, 'internal',
  'Optional prelaunch testing must use a separate internal track');
const android = fs.readFileSync(
  path.join(root,'.github/workflows/build-certified-android-play.yml'),'utf8');
assert.match(android,/submit_to_google_play_internal/);
assert.match(android,/if: \$\{\{ inputs\.submit_to_google_play_internal == true \}\}/);
assert.match(android,/eas-cli@latest submit --platform android --id "\$EAS_BUILD_ID" --profile internal/,
  'optional internal Play upload must use the exact EAS AAB and internal-only submit profile');
console.log('PASS: signed iOS/Google Play builds must target verified live Cloud Run production API.');
