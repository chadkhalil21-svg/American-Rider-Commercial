'use strict';
const assert=require('node:assert/strict');
const {sweepVerifiedRecruiterReversals}=require('./recruiter-reversal-sweep');
(async()=>{
 const noReads={collection(){throw Error('unexpected database read while off')}};
 assert.deepEqual(await sweepVerifiedRecruiterReversals({db:noReads}),
  {ok:true,disabled:true,processed:0});
 assert.equal((await sweepVerifiedRecruiterReversals({
  db:noReads,enabled:true,limit:0})).reason,'invalid_reversal_queue');
 console.log('PASS Recruiter reversals: dormant zero-read default, bounded provider-proof queue');
})().catch(e=>{console.error(e);process.exitCode=1;});
