'use strict';
// Read-only two-device QA failure snapshot. Run ONLY against disposable LOCAL
// Firebase emulators; never inspect a real operator or traveler.
const assert=require('node:assert/strict');
const {isolatedNativeQa}=require('./native-qa-isolation');
const {adminDb}=require('./firebase-admin');
async function main(){
  assert.equal(isolatedNativeQa(),true,'Refuse non-isolated QA snapshot');
  assert.equal(process.env.GOOGLE_CLOUD_PROJECT,'demo-american-rider-qa');
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST,'Local Firestore emulator required');
  assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST,'Local Auth emulator required');
  assert.ok(!process.env.K_SERVICE&&!process.env.GOOGLE_APPLICATION_CREDENTIALS,'Production forbidden');
  assert.match(process.env.STRIPE_SECRET_KEY||'',/^sk_test_/,'Stripe TEST mode required');
  const db=adminDb();assert.ok(db,'No local database');
  const now=Date.now();
  const [operatorSnap,travelerSnap,ridesSnap]=await Promise.all([
    db.collection('operators').doc('native-qa-operator').get(),
    db.collection('users').doc('native-qa-traveler').get(),
    db.collection('rides').where('travelerUid','==','native-qa-traveler').limit(10).get(),
  ]);
  assert.equal(operatorSnap.data()?.qaOnly,true,'Not a disposable QA Operator');
  assert.equal(travelerSnap.data()?.qaOnly,true,'Not a disposable QA Traveler');
  const o=operatorSnap.data();
  const rides=ridesSnap.docs.map(d=>{
    const r=d.data();
    return {id:d.id,status:r.status||null,operatorId:r.operatorId||null,
      travelerUid:r.travelerUid||null,assignmentAt:r.assignedAt||null,
      assignedAgeSeconds:r.assignedAt?Math.round((now-r.assignedAt)/1000):null,
      createdAgeSeconds:r.createdAt?Math.round((now-r.createdAt)/1000):null,
      offerStatus:r.offerStatus||null,acceptedAt:r.acceptedAt||null,
      paymentIntentPresent:!!r.paymentIntentId,transferPresent:!!r.transferId,
      fareCents:r.travelerTotalCents||r.totalCents||null};
  });
  console.log('LOCAL QA TWO-DEVICE FAILURE SNAPSHOT');
  console.log(JSON.stringify({asOf:new Date(now).toISOString(),
    operator:{available:o.available,commissioned:o.commissioned,
      currentRideId:o.currentRideId||null,geohashPresent:!!o.geohash,
      onlineAgeSeconds:Number.isFinite(Number(o.onlineAt))?Math.round((now-Number(o.onlineAt))/1000):null},
    rides},null,2));
}
main().catch(e=>{console.error('LOCAL_QA_SNAPSHOT_UNAVAILABLE:',e.message);process.exitCode=1});
