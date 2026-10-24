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
const now=Date.UTC(2026,10,1),eligibleAt=now-30*86400000,updates=[];
const candidateDb={
 collection(name){
  if(name==='recruiter_payout_candidates')return {
   where(field,op,value){
    assert.equal(field,'nextAttemptAt');
    assert.equal(op,'<=');
    assert.equal(value,now);
    return {limit(n){
     assert.equal(n,12);
     return {get:async()=>({docs:[{
      id:'recruiter-001',
      data:()=>({uid:'recruiter-001',nextAttemptAt:now,
       lastEligibleRewardAt:eligibleAt})
     }]})};
    }};
   },
   doc(uid){
    assert.equal(uid,'recruiter-001');
    return {set:async value=>updates.push(value)};
   },
  };
  if(name==='referral_reward_events')return {
   where(field,op,value){
    assert.equal(field,'inviterUid');
    assert.equal(op,'==');
    assert.equal(value,'recruiter-001');
    return {where(field2,op2,value2){
     assert.equal(field2,'status');
     assert.equal(op2,'==');
     assert.equal(value2,'available');
     return {limit(n){
      assert.equal(n,200);
      return {get:async()=>({docs:[{
       id:'ride-000000_operator',
       data:()=>({amountCents:15})
      }]})};
     }};
    }};
   },
  };
  throw Error('unexpected collection '+name);
 }
};
const requeued=await sweepRecruiterPayoutReservations({db:candidateDb,enabled:true,
 now,authorization:{programEnabled:true,providerApproved:true,counselApproved:true,
 scheduleApproved:true,provider:'stripe_connect',activeMonthlyFeeCents:200,minimumCents:2500}});
assert.deepEqual(requeued,{ok:true,reserved:0,waiting:1,errors:0});
assert.equal(updates[0].nextAttemptAt,eligibleAt+90*86400000,
 'a refunded below-threshold monthly batch must retain its 90-day residual due date');

console.log('PASS: candidate-only Recruiter reservation, no extra cron or disabled reads');
})().catch(e=>{console.error(e);process.exitCode=1;});
