'use strict';
// Statutory electronic receipt completeness, using only locally stored facts.
// No email service or payment network is invoked.
const assert = require('node:assert/strict');
const { receiptEmail } = require('./email');

const start=Date.parse('2026-10-23T10:00:00Z');
const ride={
  tripNo:'AR-SYNTHETIC-RECEIPT',costCents:2690,
  dep:'Brickell, Miami',dest:'Coral Gables, FL',
  travelClass:'Standard',operatorName:'Synthetic Operator',
  miles:7.2,onboardAt:start,completedAt:start+13*60_000,
};
const sent=receiptEmail(ride);
for(const message of [sent.html,sent.text]){
  assert(message.includes('$26.90'),'one recorded Travel Total');
  assert(message.includes(ride.dep)&&message.includes(ride.dest),'origin and destination included');
  assert(message.includes('13 minutes (boarding to completion)'),'actual boarding-to-completion duration');
  assert(message.includes('7.2 miles (recorded route)'),'recorded route distance with provenance');
  assert(message.includes(ride.tripNo),'original travel record identity');
}
assert(sent.subject.includes(ride.tripNo));
const older=receiptEmail({...ride,miles:null,onboardAt:null,completedAt:null});
for(const message of [older.html,older.text]){
  assert(message.includes('Travel time'),'missing time is explicitly disclosed');
  assert(message.includes('Route distance'),'missing distance is explicitly disclosed');
  assert(!message.includes('13 minutes')&&!message.includes('7.2 miles'),
    'missing historical data must never be invented');
}
const hostile=receiptEmail({...ride,miles:-5,completedAt:start-60_000});
assert(!hostile.text.includes('-5 miles'),'invalid distance must not be printed');
assert(!hostile.text.includes('13 minutes'),'inverted travel timestamps must not be fabricated');
console.log('PASS: statutory receipt email includes exact Travel fare, both endpoints, actual boarding time and recorded route miles; missing/invalid data never invented');
