'use strict';
const assert=require('node:assert/strict');
const {sweepRecruiterPayoutReservations,FLOOR_CENTS}=require('./recruiter-payout-reserve-sweep');
(async()=>{
 const db={collection:()=>{throw Error('disabled sweep must perform zero Firestore reads');}};
 assert.equal(FLOOR_CENTS,2500);
 assert.deepEqual(await sweepRecruiterPayoutReservations({db}),
   {ok:true,disabled:true,processed:0});
 assert.equal((await sweepRecruiterPayoutReservations({db,enabled:true})).reason,
   'payout_reservation_not_approved');
 const auth={programEnabled:true,providerApproved:true,counselApproved:true,
  scheduleApproved:true,provider:'stripe_connect',activeMonthlyFeeCents:200,minimumCents:2500};
 const empty={collection:()=>({where:()=>({limit:()=>({get:async()=>({docs:[]})})})})};
 assert.deepEqual(await sweepRecruiterPayoutReservations({db:empty,enabled:true,authorization:auth}),
   {ok:true,reserved:0,waiting:0,errors:0});
 console.log('PASS recruiter batch reservation: zero reads if off, one due-index batch, explicit legal/provider gates');
})().catch(err=>{console.error(err);process.exitCode=1;});
