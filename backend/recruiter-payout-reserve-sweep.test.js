'use strict';
const assert=require('node:assert/strict');
const {sweepRecruiterPayoutReservations}=require('./recruiter-payout-reserve-sweep');
(async()=>{
const blocked={collection(){throw Error('disabled program performed a read')}};
assert.deepEqual(await sweepRecruiterPayoutReservations({db:blocked}),
 {ok:true,disabled:true,processed:0});
assert.equal((await sweepRecruiterPayoutReservations({db:blocked,enabled:true,authorization:{}})).reason,
 'payout_reservation_not_approved');
assert.equal((await sweepRecruiterPayoutReservations({db:blocked,enabled:true,
 authorization:{programEnabled:true,providerApproved:true,counselApproved:true,
 scheduleApproved:true,provider:'stripe_connect',activeMonthlyFeeCents:200,minimumCents:200}})).reason,
 'payout_reservation_not_approved');
const due={collection(name){
 if(name!=='recruiter_payout_candidates')throw Error('unexpected wallet scan');
 return {where(field,op,value){
  assert.equal(field,'nextAttemptAt');assert.equal(op,'<=');assert.equal(value,1000);
  return {limit(n){assert.equal(n,12);return {get:async()=>({docs:[]})};}};
 }};
}};
assert.deepEqual(await sweepRecruiterPayoutReservations({db:due,enabled:true,now:1000,
 authorization:{programEnabled:true,providerApproved:true,counselApproved:true,
 scheduleApproved:true,provider:'stripe_connect',activeMonthlyFeeCents:200,minimumCents:2500}}),
 {ok:true,reserved:0,waiting:0,errors:0});
console.log('PASS: candidate-only Recruiter reservation, no extra cron or disabled reads');
})().catch(e=>{console.error(e);process.exitCode=1;});
