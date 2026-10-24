'use strict';
const assert=require('node:assert/strict');
const {fundedRecruiterSnapshot}=require('./recruiter-reward-budget');
const {PROGRAM}=require('./referral-accrual');
const base={travelCostCents:1750,travelerPays:2000,
  governmentFeeCents:0,tollCents:0,cardCountry:'US'};
assert.deepEqual(fundedRecruiterSnapshot(base),{},
 'disabled program never adds booked-Travel fields or costs');
assert.deepEqual(fundedRecruiterSnapshot(base,{enabled:true}),
 {referralAvailableCents:30,referralProgramVersion:PROGRAM.version});
assert.equal(fundedRecruiterSnapshot({...base,cardCountry:'GB'},{enabled:true}).referralAvailableCents,0,
 'international processor economics must preserve contribution minimum');
assert.equal(fundedRecruiterSnapshot({...base,cardCountry:null},{enabled:true}).referralAvailableCents,0,
 'unknown card country costs as international');
assert.equal(fundedRecruiterSnapshot({...base,travelerPays:0},{enabled:true}).referralAvailableCents,0);
assert.equal(fundedRecruiterSnapshot({...base,travelerPays:1900},{enabled:true}).referralAvailableCents,0);
assert.equal(fundedRecruiterSnapshot({...base,governmentFeeCents:-1},{enabled:true}).referralAvailableCents,0);
assert.equal(PROGRAM.perTravelCents,15);
assert.equal(PROGRAM.maxTravels,200);
assert.equal(PROGRAM.enabled,false,'Founder rate approval is not legal/payment activation');
console.log('PASS founded $0.15 x roles: unchanged ordinary quote, zero reads, risk allowance and issuer-safe quote budget');
