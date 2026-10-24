'use strict';
// Once-funded Recruiter commission -> named batch reservation (not bank money).
// Reuses existing leased payout tick. Zero Firestore reads while disabled.
// One candidate doc written at threshold crossing; no recruit-list scanning.
const crypto=require('node:crypto');
const {reserveRecruiterPayout}=require('./recruiter-commission-ledger');
const FLOOR_CENTS=2500;
async function sweepRecruiterPayoutReservations({db,enabled=false,authorization,
 now=Date.now(),limit=12}={}){
 if(!enabled)return {ok:true,disabled:true,processed:0};
 if(!db||!Number.isSafeInteger(now)||now<=0||
    !Number.isSafeInteger(limit)||limit<1||limit>25||
    authorization?.programEnabled!==true||authorization?.providerApproved!==true||
    authorization?.counselApproved!==true||authorization?.scheduleApproved!==true||
    authorization?.provider!=='stripe_connect'||authorization?.activeMonthlyFeeCents!==200||
    authorization?.minimumCents!==FLOOR_CENTS)
    return {ok:false,reason:'payout_reservation_not_approved'};
 try{
   const page=await db.collection('recruiter_payout_candidates')
      .where('nextAttemptAt','<=',now).limit(limit).get();
   let reserved=0,waiting=0,errors=0;
   for(const candidate of page.docs||[]){
     const uid=candidate.id;
     const record=candidate.data()||{};
     if(record.uid!==uid||!Number.isSafeInteger(record.nextAttemptAt)||
       record.nextAttemptAt>now){errors++;continue;}
     let result=null;
     try{
       const rewards=await db.collection('referral_reward_events')
         .where('inviterUid','==',uid).where('status','==','available')
         .limit(200).get();
       const docs=rewards.docs||[];
       const total=docs.reduce((sum,d)=>sum+(Number(d.data()?.amountCents)||0),0);
       if(total>=FLOOR_CENTS){
         // Deterministic for this candidate attempt; reservations are transactional
         // and use fixed event IDs and one Stripe batch idempotency key.
         const batchId='recruiter_'+crypto.createHash('sha256')
           .update(uid+':'+record.nextAttemptAt).digest('hex').slice(0,28);
         result=await reserveRecruiterPayout({db,uid,batchId,
           eventIds:docs.map(d=>d.id),authorization,now});
       }else result={ok:false,reason:'below_batch_minimum'};
     }catch{result={ok:false,reason:'reservation_lookup_unavailable'};}
     // Even a successful reservation has not transferred money. Recheck a
     // small residual balance at the next due cycle, then disable the idle row.
     const retry=result?.ok?now+60*60*1000:
       result?.reason==='below_batch_minimum'?null:now+24*60*60*1000;
     try{
       await db.collection('recruiter_payout_candidates').doc(uid).set({
         nextAttemptAt:retry,lastAttemptAt:now,
         lastError:result?.ok?null:result?.reason||'requires_review',
       },{merge:true});
     }catch{errors++;continue;}
     if(result?.ok)reserved++;else if(retry===null)waiting++;else errors++;
   }
   return {ok:errors===0,reserved,waiting,errors};
 }catch{return {ok:false,reason:'candidate_queue_unavailable'};}
}
module.exports={FLOOR_CENTS,sweepRecruiterPayoutReservations};
