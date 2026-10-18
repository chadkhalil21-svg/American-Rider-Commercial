'use strict';
const assert=require('node:assert/strict');
const {plan}=require('./travel-load-budget.cjs');
for(let pass=0;pass<2;pass++){
  const x=plan(100000);
  assert.equal(x.onDutyOperators,150000);
  assert.ok(Math.abs(x.apiPresenceRequestsPerSecond-1666.6666666666667)<0.001);
  assert.ok(Math.abs(x.firestorePositionWritesPerSecond-6666.666666666667)<0.001);
  assert.ok(Math.abs(x.replacementTravelStartsPerSecond-100000/3600)<0.001);
  assert.equal(x.apiPresenceRequestsInWindow,6000000);
  assert.equal(x.firestorePositionWritesInWindow,24000000);
  assert.equal(x.certifiedCapacity,false);
  const y=plan(10000,{observedHours:.25,gpsSeconds:30});
  assert.equal(y.firestorePositionWritesInWindow,300000);
  assert.equal(y.apiPresenceRequestsInWindow,150000);
  assert.throws(()=>plan(0),/positive/);
  assert.throws(()=>plan(-2),/positive/);
  assert.throws(()=>plan(3.5),/safe integer/);
  assert.throws(()=>plan(100,{observedHours:0}),/positive/);
  assert.throws(()=>plan(100,{presenceSeconds:NaN}),/positive/);
}
console.log('PASS twice: deterministic traffic projections; not certified capacity');
