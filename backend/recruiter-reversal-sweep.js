'use strict';
// Only server-verified Stripe dispute events and confirmed refund API results
// may queue this fixed-Travel, fixed-role financial reversal. No global scans
// or customer-facing side effects; money cannot be silently paid twice.
const {reverseCommission}=require('./recruiter-commission-ledger');
const valid=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{8,128}$/.test(x);
async function sweepVerifiedRecruiterReversals({db,enabled=false,limit=20,now=Date.now()}={}){
 if(!enabled)return {ok:true,disabled:true,processed:0};
 if(!db||!Number.isSafeInteger(limit)||limit<1||limit>30)
   return {ok:false,reason:'invalid_reversal_queue'};
 try{
  const page=await db.collection('rides').where('recruiterReversalPending','==',true).limit(limit).get();
  let processed=0,blocked=0;
  for(const rideDoc of page.docs||[]){
   const ride=rideDoc.data()||{};
   const proof={verified:true,reason:ride.recruiterReversalReason,
     eventId:ride.recruiterReversalProviderEventId};
   if(!['refund','dispute'].includes(proof.reason)||!valid(proof.eventId)){
    blocked++;continue;
   }
   let safe=true;
   for(const role of ['operator','traveler']){
    const eventId=rideDoc.id+'_'+role;
    const ref=db.collection('referral_reward_events').doc(eventId);
    const snap=await ref.get();
    if(!snap.exists)continue;
    const result=await reverseCommission({db,eventId,proof,now});
    if(!result.ok){safe=false;break;}
   }
   if(!safe){blocked++;continue;}
   await db.collection('rides').doc(rideDoc.id).set({
     recruiterReversalPending:false,recruiterReversalCheckedAt:now,
   },{merge:true});
   processed++;
  }
  return {ok:blocked===0,processed,blocked};
 }catch{return {ok:false,reason:'verified_reversal_queue_unavailable'};}
}
module.exports={sweepVerifiedRecruiterReversals};
