'use strict';
// Optional, bounded financial accrual and maturity workers. The EXISTING leased
// production clock owns them; absent verified activation, zero database I/O.
const {recordHeldAccrual,PROGRAM}=require('./referral-accrual');
const {releaseCommission}=require('./recruiter-commission-ledger');
const LIMIT=25;
async function sweepFundedRecruiterAccrual({db,enabled=false,holdMs,now=Date.now(),limit=LIMIT}={}){
 if(!enabled)return {ok:true,disabled:true,processed:0};
 if(!db||!Number.isSafeInteger(holdMs)||holdMs<86400000||holdMs>120*86400000||
    !Number.isSafeInteger(limit)||limit<1||limit>50)return {ok:false,reason:'unapproved_reward_terms'};
 try{
  const page=await db.collection('rides').where('referralAccrualPending','==',true).limit(limit).get();
  let processed=0,credited=0,blocked=0;
  for(const doc of page.docs||[]){
   const result=await recordHeldAccrual({db,rideId:doc.id,
      program:{...PROGRAM,enabled:true,holdMs},now});
   if(!result.ok){
     // A verified refund, dispute or cancellation permanently disqualifies
     // a still-pending reward. Retire that named Travel once, rather than
     // repeatedly rereading the same poisoned indexed queue every minute.
     if(result.reason==='settlement_or_program_not_verified'){
       const ref=db.collection('rides').doc(doc.id);
       const retired=await db.runTransaction(async tx=>{
         const snap=await tx.get(ref);
         const ride=snap.exists?snap.data():null;
         if(!ride||ride.referralAccrualPending!==true)return false;
         const terminal=ride.recruiterRewardRefunded===true||
           ride.refunded===true||ride.disputed===true||
           ride.status==='cancelled';
         if(!terminal)return false;
         tx.update(ref,{referralAccrualPending:false,
           referralAccrualRejectedAt:now,
           referralAccrualRejection:'verified_refund_dispute_or_cancellation'});
         return true;
       });
       if(retired){processed++;continue;}
     }
     blocked++;continue;
   }
   processed++;credited+=result.events;
  }
  return {ok:blocked===0,processed,credited,blocked};
 }catch{return {ok:false,reason:'funded_accrual_queue_unavailable'};}
}
async function sweepMaturedRecruiterRewards({db,approved=false,holdMs,minimumCents,now=Date.now(),limit=LIMIT}={}){
 if(!approved)return {ok:true,disabled:true,processed:0};
 if(!db||!Number.isSafeInteger(holdMs)||holdMs<86400000||holdMs>120*86400000||
    !Number.isSafeInteger(limit)||limit<1||limit>50)return {ok:false,reason:'unapproved_reward_terms'};
 try{
  // Single-field range query; no pairwise fleet scan or composite index.
  const page=await db.collection('referral_reward_events')
    .where('nextReleaseAt','<=',now).limit(limit).get();
  let released=0,blocked=0;
  for(const doc of page.docs||[]){
   const out=await releaseCommission({db,eventId:doc.id,
     terms:{enabled:true,approved:true,version:PROGRAM.version,holdMs,minimumCents},now});
   if(out.ok){released++;continue;}
   blocked++;
   // Backoff, then explicit exception after repeated failure. In no case
   // does an unverifiable reward become money or block booking.
   await db.runTransaction(async tx=>{
    const ref=db.collection('referral_reward_events').doc(doc.id);
    const snap=await tx.get(ref);
    if(!snap.exists||snap.data()?.status!=='held')return;
    const fails=Math.min(5,Number(snap.data()?.maturityFailures||0)+1);
    tx.update(ref,{maturityFailures:fails,
      nextReleaseAt:fails>=5?null:now+6*60*60*1000,
      ...(fails>=5?{reviewRequired:true}:{}),
      lastMaturityFailure:String(out.reason||'requires_review').slice(0,100)});
   });
  }
  return {ok:blocked===0,released,blocked};
 }catch{return {ok:false,reason:'maturity_queue_unavailable'};}
}
module.exports={sweepFundedRecruiterAccrual,sweepMaturedRecruiterRewards};
