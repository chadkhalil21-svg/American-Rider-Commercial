'use strict';
// LOCAL native QA only. Simulate a legitimate Operator device driving to the
// same paid Travel's destination. This file NEVER writes Firestore or Stripe.
// The server still independently checks fresh GPS proximity before completion.
const assert = require('node:assert/strict');
const { isolatedNativeQa } = require('../backend/native-qa-isolation');
const { adminDb } = require('../backend/firebase-admin');
const { distanceMiles } = require('../backend/matching');

function guard() {
  assert.equal(isolatedNativeQa(), true, 'Refuse non-isolated QA');
  assert.equal(process.env.GOOGLE_CLOUD_PROJECT, 'demo-american-rider-qa');
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);
  assert.match(process.env.STRIPE_SECRET_KEY || '', /^sk_test_/);
  assert.ok(!process.env.K_SERVICE && !process.env.GOOGLE_APPLICATION_CREDENTIALS);
}
function coord(x, max) {
  const n = Number(x);
  assert.ok(Number.isFinite(n) && Math.abs(n) <= max, 'Invalid native QA destination position');
  return n;
}
async function main() {
  guard();
  const mode = process.argv[2];
  assert.ok(['coordinates','verify'].includes(mode), 'Expected coordinates or verify');
  const db = adminDb();
  assert.ok(db, 'No local QA Firestore');
  const opSnap = await db.collection('operators').doc('native-qa-operator').get();
  const op = opSnap.data() || {};
  assert.equal(op.qaOnly, true, 'Refuse non-disposable Operator');
  const rideId = String(op.currentRideId || '');
  assert.ok(rideId, 'No accepted Operator Travel to finish');
  const rideSnap = await db.collection('rides').doc(rideId).get();
  const ride = rideSnap.data() || {};
  assert.equal(ride.qaOnly === true || ride.travelerUid === 'native-qa-traveler', true,
    'Refuse non-QA Traveler');
  assert.equal(ride.operatorId, 'native-qa-operator', 'Travel ownership changed');
  assert.equal(ride.status, 'onboard', 'Must board actual native Travel before moving');
  const lat = coord(ride.destinationLat, 90);
  const lng = coord(ride.destinationLng, 180);
  assert.ok(distanceMiles({ lat, lng }, { lat: 25.7617, lng: -80.1918 }) > 1,
    'Test Travel destination must be away from original pickup');
  if (mode === 'coordinates') {
    // ADB emu geo fix expects longitude first, then latitude.
    process.stdout.write(lng + ' ' + lat + '\n');
  } else {
    const current = {lat: coord(op.lat,90),lng:coord(op.lng,180)};
    const age = Date.now() - Number(op.onlineAt || 0);
    const miles = distanceMiles(current, {lat,lng});
    const ok = age >= 0 && age < 5*60*1000 && miles <= 1;
    console.log('QA_OPERATOR_DESTINATION_POSITION', JSON.stringify({
      status: ride.status, distanceMiles: Number(miles.toFixed(3)),
      ageSeconds: Number((age/1000).toFixed(1)), valid: ok
    }));
    if (!ok) process.exitCode = 1;
  }
}
main().catch(e => {
  console.error('QA_NATIVE_DESTINATION_NOT_READY:', e.message);
  process.exitCode=1;
});
