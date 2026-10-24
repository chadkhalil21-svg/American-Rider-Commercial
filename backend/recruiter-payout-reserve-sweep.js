'use strict';
// Threshold-driven, due-only Recruiter reservations. Existing leased scheduler.
// Never sends Stripe money; the already-guarded bank worker does that separately.
// No full wallet scans, no second clock, no QR tracking writes.
const crypto=require('node:crypto');
const {reserveRecruiterPayout}=require('./recruiter-commission-ledger');
async function sweepRecruiterPayoutReservations({db,enabled=false,authorization,
 now=Date.now(),limit=12}={}){
 if(!enabled)return {ok:true,disabled:true,processed:0};
 const minimum=authorization?.minimumCents;
 if(!db||!Number.isSafeInteger(now)||now<=0||
   !Number.isSafeInteger(limit)||limit<1||limit>25||
   !Number.isSafeInteger(minimum)||minimum<=200||minimum>3000||
   authorization?.programEnabled!==true||authorization?.providerApproved!==true||
   authorization?.counselApproved!==true||authorization?.scheduleApproved!==true||
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
       if(total>=minimum){
         const ids=docs.map(d=>d.id).sort();
         const batchId='recruiter_'+crypto.createHash('sha256')
           .update(JSON.stringify([uid,ids])).digest('hex').slice(0,28);
         result=await reserveRecruiterPayout({db,uid,batchId,
           eventIds:ids,authorization,now});
       }else result={ok:false,reason:'below_batch_minimum'};
     }catch{result={ok:false,reason:'reservation_lookup_unavailable'};}
     const next=result?.ok?now+60*60*1000:
       result?.reason==='below_batch_minimum'?null:now+24*60*60*1000;
     try{
       await db.collection('recruiter_payout_candidates').doc(uid).set({
         nextAttemptAt:next,lastAttemptAt:now,
         lastError:result?.ok?null:result?.reason||'requires_review',
       },{merge:true});
     }catch{errors++;continue;}
     if(result?.ok)reserved++;else if(next===null)waiting++;else errors++;
   }
   return {ok:errors===0,reserved,waiting,errors};
 }catch{return {ok:false,reason:'candidate_queue_unavailable'};}
}
module.exports={sweepRecruiterPayoutReservations};
