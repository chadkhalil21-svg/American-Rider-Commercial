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
assert.equal(fundedRecruiterSnapshot({...base,cardCountry:'GB'},{enabled:true}).referralAvailableCents,30,
 'valid foreign-card Travel earns referral even when its individual margin is tight');
assert.equal(fundedRecruiterSnapshot({...base,cardCountry:null},{enabled:true}).referralAvailableCents,30,
 'unknown card country is not grounds to forfeit a valid recruiter reward');
assert.equal(fundedRecruiterSnapshot({...base,travelerPays:0},{enabled:true}).referralAvailableCents,0);
assert.equal(fundedRecruiterSnapshot({...base,travelerPays:1900},{enabled:true}).referralAvailableCents,0);
assert.equal(fundedRecruiterSnapshot({...base,governmentFeeCents:-1},{enabled:true}).referralAvailableCents,0);
assert.equal(PROGRAM.perTravelCents,15);
assert.equal(PROGRAM.maxTravels,200);
assert.equal(PROGRAM.enabled,false,'Founder rate approval is not legal/payment activation');
console.log('PASS guaranteed $0.15 x roles: no Travel-margin forfeiture; malformed quotes rejected; program off safe');
