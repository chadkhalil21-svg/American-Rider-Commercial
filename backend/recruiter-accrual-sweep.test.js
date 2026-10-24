'use strict';
const assert=require('node:assert/strict');
const {sweepFundedRecruiterAccrual,sweepMaturedRecruiterRewards}=require('./recruiter-accrual-sweep');
(async()=>{
  const forbidden={collection(){throw Error('disabled code performed a Firestore read')}};
  assert.deepEqual(await sweepFundedRecruiterAccrual({db:forbidden}),
    {ok:true,disabled:true,processed:0});
  assert.deepEqual(await sweepMaturedRecruiterRewards({db:forbidden}),
    {ok:true,disabled:true,processed:0});
  assert.equal((await sweepFundedRecruiterAccrual({db:forbidden,enabled:true,holdMs:0})).reason,
    'unapproved_reward_terms');
  assert.equal((await sweepMaturedRecruiterRewards({db:forbidden,approved:true,holdMs:0})).reason,
    'unapproved_reward_terms');
  // A permanently refunded Travel is removed from the due queue exactly
  // once, without any reward and without scanning all Recruiters.
  const fields={referralAccrualPending:true,recruiterRewardRefunded:true,
    status:'completed',referralProgramVersion:'recruiter-15c-20261024-v1'};
  const refundDb={
    collection(name){assert.equal(name,'rides');return {doc(id){assert.equal(id,'travel-refunded');return {id};},
      where(field,cmp,value){
        assert.equal(field,'referralAccrualPending');
        assert.equal(cmp,'==');assert.equal(value,true);
        return {limit(n){assert.equal(n,25);return {get:async()=>({docs:[{id:'travel-refunded'}]})};}};
      }};},
    async runTransaction(cb){
      const tx={
        async get(){return {exists:true,data:()=>fields};},
        update(_,patch){Object.assign(fields,patch);}
      };
      return cb(tx);
    },
  };
  const reaped=await sweepFundedRecruiterAccrual({db:refundDb,enabled:true,holdMs:86400000});
  assert.equal(reaped.ok,true);
  assert.equal(reaped.processed,1);
  assert.equal(reaped.credited,0);
  assert.equal(fields.referralAccrualPending,false);
  console.log('PASS recruiter financial queues: fail-closed, zero reads while off, bounded batch contracts');
})().catch(e=>{console.error(e);process.exitCode=1;});
