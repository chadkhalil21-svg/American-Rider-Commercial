'use strict';
// Trust only the LOCAL, synthetic Firestore snapshot after the real native
// Operator touch. Never treat successful ADB input as a server acceptance.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const file=process.argv[2];
assert.match(file||'',/^artifacts\/native-commercial-android\/acceptance-after-watcher\.json$/);
const raw=fs.readFileSync(file,'utf8');
const marker='LOCAL QA TWO-DEVICE FAILURE SNAPSHOT';
const i=raw.indexOf(marker);
assert.ok(i>=0,'No independently queried LOCAL Firestore record');
const brace=raw.indexOf('{',i);
assert.ok(brace>=0,'No local snapshot JSON');
const record=JSON.parse(raw.slice(brace));
assert.equal(record.rides?.length,1,'Exactly one disposable QA Travel required');
const ride=record.rides[0];
assert.equal(ride.travelerUid,'native-qa-traveler');
assert.equal(ride.operatorId,'native-qa-operator');
assert.equal(record.operator?.currentRideId,ride.id,'Operator was not assigned this same Travel');
assert.ok(['accepted','arrived','in_progress','completed'].includes(ride.status),
  'Server has not accepted the Traveler');
assert.ok(ride.acceptedAt,'Server acceptance timestamp missing');
assert.ok(ride.paymentIntentPresent,'No existing TEST authorization');
console.log('PASS: single REAL native Operator touch accepted by LOCAL backend for same TEST Travel');
