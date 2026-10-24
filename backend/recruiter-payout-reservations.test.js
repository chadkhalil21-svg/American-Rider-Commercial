'use strict';
const assert=require('node:assert/strict');
const {sweepRecruiterPayoutReservations}=require('./recruiter-payout-reservations');
(async()=>{
 const db={collection(){throw Error('Never read while OFF')}};
 assert.deepEqual(await sweepRecruiterPayoutReservations({db}),
   {ok:true,disabled:true,reserved:0});
 assert.equal((await sweepRecruiterPayoutReservations({db,enabled:true,
   authorization:{minimumCents:200}})).reason,'payout_terms_or_budget_unapproved');
 assert.equal((await sweepRecruiterPayoutReservations({db,enabled:true,
   authorization:{minimumCents:1000000}})).reason,'payout_terms_or_budget_unapproved');
 console.log('PASS payouts reserved only with reviewed minimum, bounded due queries, no IO while off');
})().catch(e=>{console.error(e);process.exitCode=1;});
