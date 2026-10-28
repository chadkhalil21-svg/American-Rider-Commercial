'use strict';
// The real /travel/accept must be committed before native Operator boarding.
const assert=require('node:assert/strict');
const {isolatedNativeQa}=require('../backend/native-qa-isolation');
const {adminDb}=require('../backend/firebase-admin');
(async()=>{
  assert.equal(isolatedNativeQa(),true,'Local QA only');
  assert.equal(process.env.GOOGLE_CLOUD_PROJECT,'demo-american-rider-qa');
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);
  assert.match(process.env.STRIPE_SECRET_KEY||'',/^sk_test_/);
  assert.ok(!process.env.K_SERVICE && !process.env.GOOGLE_APPLICATION_CREDENTIALS);
  const db=adminDb();assert.ok(db,'No local Firestore');
  const op=(await db.collection('operators').doc('native-qa-operator').get()).data()||{};
  assert.equal(op.qaOnly,true);
  const rideId=String(op.currentRideId||'');assert.ok(rideId,'No Operator-assigned Travel');
  const ride=(await db.collection('rides').doc(rideId).get()).data()||{};
  assert.equal(ride.travelerUid,'native-qa-traveler');
  assert.equal(ride.operatorId,'native-qa-operator');
  assert.equal(ride.status,'accepted','Device touch did not commit real server acceptance');
  assert.ok(ride.acceptedAt,'No real acceptedAt timestamp');
  console.log('PASS: same LOCAL paid Travel accepted by the real backend');
})().catch(e=>{console.error('QA_IOS_ACCEPTANCE_NOT_VERIFIED:',e.message);process.exitCode=1});
