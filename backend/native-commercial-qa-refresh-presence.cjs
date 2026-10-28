'use strict';
// The native QA fixture is provisioned before long Xcode/emulator boot; dispatch
// must not use a stale presence. Refresh ONLY the existing local emulator test
// Operator, immediately before the Traveler's real booking journey.
const assert=require('node:assert/strict');
const {isolatedNativeQa}=require('./native-qa-isolation');
const {adminDb}=require('./firebase-admin');
const {encodeGeohash}=require('./geooperators');
async function main(){
  assert.equal(isolatedNativeQa(),true,'Refusing any Operator writes outside disposable LOCAL native QA');
  assert.equal(process.env.GOOGLE_CLOUD_PROJECT,'demo-american-rider-qa','Wrong Firebase project');
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST,'Firestore emulator not configured');
  assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST,'Auth emulator not configured');
  assert.ok(!process.env.K_SERVICE&&!process.env.GOOGLE_APPLICATION_CREDENTIALS,'Production credentials or Cloud Run forbidden');
  assert.match(process.env.STRIPE_SECRET_KEY||'',/^sk_test_/,'Stripe TEST only');
  const db=adminDb();assert.ok(db,'Local Firestore Admin unavailable');
  const ref=db.collection('operators').doc('native-qa-operator');
  const snap=await ref.get();
  assert.ok(snap.exists,'Missing disposable Operator fixture');
  const o=snap.data();
  assert.equal(o.uid,'native-qa-operator','Refuse to modify a non-QA Operator');
  assert.equal(o.qaOnly,true,'Refuse to modify unmarked Operator');
  assert.equal(o.available,true,'Refuse to put unavailable Operator on duty');
  assert.equal(o.commissioned,true,'QA Operator fixture not commissioned');
  assert.ok(String(o.stripeAccountId||'').startsWith('acct_'),'Stripe TEST recipient not seeded');
  assert.equal(o.geohash,encodeGeohash(25.7617,-80.1918,7),'Fleet record not searchable by the actual geohash index');
  assert.equal(Number(o.lat),25.7617);
  assert.equal(Number(o.lng),-80.1918);
  const now=Date.now();
  await ref.update({onlineAt:now});
  console.log('PASS: only existing local QA Operator presence renewed immediately before device booking');
}
main().catch(e=>{console.error('LOCAL_QA_OPERATOR_REFRESH_BLOCKED:',e.message);process.exitCode=1;});
