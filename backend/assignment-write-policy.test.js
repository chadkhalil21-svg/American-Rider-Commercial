'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {shouldRecordUnanswered} = require('./assignment-write-policy');

function exercise(){
  assert.equal(shouldRecordUnanswered(null),true);
  assert.equal(shouldRecordUnanswered({unanswered:false}),true);
  assert.equal(shouldRecordUnanswered({unanswered:true}),true);
  assert.equal(shouldRecordUnanswered({unanswered:true,unansweredAt:0}),true);
  assert.equal(shouldRecordUnanswered({unanswered:true,unansweredAt:-10}),true);
  assert.equal(shouldRecordUnanswered({unanswered:true,unansweredAt:'old'}),true);
  assert.equal(shouldRecordUnanswered({unanswered:true,unansweredAt:123456}),false);
  let writes=0,checks=0,ride={id:'paid_assigned_1',status:'assigned',paymentIntentId:'pi_synthetic'};
  for(let minute=0;minute<60;minute++){
    checks++; // every minute still attempts to find an eligible replacement
    if(shouldRecordUnanswered(ride)){
      writes++;
      ride={...ride,unanswered:true,unansweredAt:100000+minute*60000};
    }
  }
  assert.equal(checks,60);
  assert.equal(writes,1,'an unanswered Travel gets one initial write, not sixty');
  assert.equal(ride.unansweredAt,100000,'preserve first meaningful observation');
  // New released/reassigned offer can reset its marker to be recorded once again.
  ride={...ride,unanswered:false};
  assert.equal(shouldRecordUnanswered(ride),true);
  // Confirm the real server still runs the entire candidate lookup and timeout
  // sweep on every tick and never skips payout/reconciliation status handling.
  const source=fs.readFileSync(path.join(__dirname,'monitor.js'),'utf8');
  const start=source.indexOf('async function sweepAssignments(');
  const end=source.indexOf('module.exports =',start);
  const fn=source.slice(start,end);
  assert(start>=0&&end>start,'sweepAssignments exists');
  assert(fn.includes('await nearbyOperatorCandidates(db, from, { excludeIds: exclude })'));
  assert(fn.includes('if (shouldRecordUnanswered(ride))'));
  assert(fn.includes("await write(db, ride.id, { unanswered: true, unansweredAt: now })"));
  assert(fn.includes('out.stranded.push(ride.id)'));
  assert(fn.includes("where('status', '==', 'assigned')"));
  assert(fn.includes('age > STALE_ASSIGNMENT_MS') && fn.includes('WITHDRAWN_REPLACEMENT_MS'),
    'old unanswered assignments still expire; withdrawn accepted pickup uses a shorter window');
  assert(fn.includes("refundPending: !!current.paymentIntentId"),'refund obligation not removed');
}
exercise();exercise();
console.log('PASS twice: 120 synthetic sweep ticks, two markers instead of 120 writes; re-offer, expiry and refunds preserved.');
