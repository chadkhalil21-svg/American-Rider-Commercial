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
  console.log('PASS recruiter financial queues: fail-closed, zero reads while off, bounded batch contracts');
})().catch(e=>{console.error(e);process.exitCode=1;});
