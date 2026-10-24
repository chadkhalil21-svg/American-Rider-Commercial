'use strict';
const assert=require('node:assert/strict');
const {DAY_MS,RESIDUAL_DAYS,nextMonthlyPayoutAt,
  nextRecruiterCandidateAt,residualCloseoutDue}=require('./recruiter-payout-policy');
const utc=Date.UTC;
const oct=utc(2026,9,24,18,0);
assert.equal(nextMonthlyPayoutAt(oct),utc(2026,10,1));
assert.equal(nextMonthlyPayoutAt(utc(2026,11,31,23,59)),utc(2027,0,1));
assert.equal(nextMonthlyPayoutAt(0),null);
assert.equal(nextRecruiterCandidateAt({now:oct,grossCents:2500,minimumCents:2500}),utc(2026,10,1));
assert.equal(nextRecruiterCandidateAt({now:oct,grossCents:2499,minimumCents:2500}),
 oct+RESIDUAL_DAYS*DAY_MS);
assert.equal(nextRecruiterCandidateAt({now:oct,grossCents:0,minimumCents:2500}),
 oct+RESIDUAL_DAYS*DAY_MS);
assert.equal(nextRecruiterCandidateAt({now:oct,grossCents:1,minimumCents:200}),null);
const candidate={lastEligibleRewardAt:oct,nextAttemptAt:oct+90*DAY_MS};
assert.equal(residualCloseoutDue({candidate,now:candidate.nextAttemptAt-1,
 grossCents:15,minimumCents:2500}),false,'no early residual payout');
assert.equal(residualCloseoutDue({candidate,now:candidate.nextAttemptAt,
 grossCents:15,minimumCents:2500}),true,'closeout due at day 90');
assert.equal(residualCloseoutDue({candidate,now:candidate.nextAttemptAt,
 grossCents:2500,minimumCents:2500}),false,'standard monthly batch keeps its own rule');
assert.equal(residualCloseoutDue({candidate,now:candidate.nextAttemptAt,
 grossCents:0,minimumCents:2500}),false,'no fake zero balance bank payout');
assert.equal(residualCloseoutDue({candidate:{lastEligibleRewardAt:oct,
 nextAttemptAt:null},now:candidate.nextAttemptAt,grossCents:15,minimumCents:2500}),false);
console.log('PASS Founder-approved UTC monthly payout boundary and 90-day residual timing, no early/zero payout');
