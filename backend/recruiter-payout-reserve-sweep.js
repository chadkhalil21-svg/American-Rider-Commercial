'use strict';
// Threshold-driven, due-only Recruiter reservations. Existing leased scheduler.
// Never sends Stripe money; the already-guarded bank worker does that separately.
// No full wallet scans, no second clock, no QR tracking writes.
const crypto=require('node:crypto');
const {reserveRecruiterPayout}=require('./recruiter-commission-ledger');
const {residualCloseoutDue}=require('./recruiter-payout-policy');
async function sweepRecruiterPayoutReservations({db,enabled=false,authorization,
 now=Date.now(),limit=12}={}){
 if(!enabled)return {ok:true,disabled:true,processed:0};
 const minimum=authorization?.minimumCents;
 if(!db||!Number.isSafeInteger(now)||now<=0||
   !Number.isSafeInteger(limit)||limit<1||limit>25||
   !Number.isSafeInteger(minimum)||minimum<=200||minimum>3000||
   authorization?.programEnabled!==true||authorization?.providerApproved!==true||
   authorization?.scheduleApproved!==true||
   authorization?.provider!=='stripe_connect'||authorization?.activeMonthlyFeeCents!==200)
   return {ok:false,reason:'payout_reservation_not_approved'};
 try{
   const page=await db.collection('recruiter_payout_candidates')
      .where('nextAttemptAt','<=',now).limit(limit).get();
   let reserved=0,waiting=0,errors=0;
   for(const candidate of page.docs||[]){
     const uid=candidate.id,entry=candidate.data()||{};
     if(entry.uid!==uid||!Number.isSafeInteger(entry.nextAttemptAt)||
        entry.nextAttemptAt>now){errors++;continue;}
     let result;
     try{
       // One bounded index lookup for this known owner, not all Recruiters.
       const rewards=await db.collection('referral_reward_events')
         .where('inviterUid','==',uid).where('status','==','available')
         .limit(200).get();
       const docs=(rewards.docs||[]).filter(d=>
          Number.isSafeInteger(d.data()?.amountCents)&&d.data().amountCents>0&&
          d.data()?.requiresRecovery!==true);
       const total=docs.reduce((sum,d)=>sum+d.data().amountCents,0);
       const closeout=residualCloseoutDue({candidate:entry,now,
         grossCents:total,minimumCents:minimum});
       if(total>=minimum||closeout){
         const ids=docs.map(d=>d.id).sort();
         const batchId='recruiter_'+crypto.createHash('sha256')
           .update(JSON.stringify([uid,ids])).digest('hex').slice(0,28);
         // Residual closeout is an authenticated, due-only one-off exception
         // to the ordinary batch size. The payout transaction independently
         // checks the 90-day inactivity and existing beneficiary eligibility.
         const releaseAuth=closeout?{...authorization,minimumCents:1,
           standardMinimumCents:minimum,closeout:true}:authorization;
         result=await reserveRecruiterPayout({db,uid,batchId,
           eventIds:ids,authorization:releaseAuth,now});
       }else result={ok:false,reason:'below_batch_minimum'};
     }catch{result={ok:false,reason:'reservation_lookup_unavailable'};}
     // Stripe's usual USD bank payout minimum is $1. For a smaller
     // undisputed residual, preserve the debt for a lawful alternative
     // instead of repeatedly trying an unpayable Connect bank transfer.
     const alternate=result?.reason==='bank_provider_minimum_not_met';
     // A previously qualified monthly batch can fall below $25 after a
     // documented refund. Requeue its existing 90-day residual due date;
     // setting null would strand a lawful earned balance indefinitely.
     const residualDue=Number.isSafeInteger(entry.lastEligibleRewardAt)?
       entry.lastEligibleRewardAt+90*86400000:null;
     const next=result?.ok?now+60*60*1000:
       alternate?null:result?.reason==='below_batch_minimum'?
       residualDue&&residualDue>now?residualDue:null:now+24*60*60*1000;
     try{
       await db.collection('recruiter_payout_candidates').doc(uid).set({
         nextAttemptAt:next,lastAttemptAt:now,
         alternativeCloseoutRequired:alternate||false,
         lastError:result?.ok?null:result?.reason||'requires_review',
       },{merge:true});
     }catch{errors++;continue;}
     if(result?.ok)reserved++;
     else if(result?.reason==='below_batch_minimum'||next===null)waiting++;
     else errors++;
   }
   return {ok:errors===0,reserved,waiting,errors};
 }catch{return {ok:false,reason:'candidate_queue_unavailable'};}
}
module.exports={sweepRecruiterPayoutReservations};
