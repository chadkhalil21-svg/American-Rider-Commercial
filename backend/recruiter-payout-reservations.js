'use strict';
// Collect only already-available, verified recruiter ledger events into a
// scheduled payout batch. Transfer to Stripe is performed later by the
// existing guarded bank worker. No money movement or full collection scans.
const crypto=require('node:crypto');
const {reserveRecruiterPayout}=require('./recruiter-commission-ledger');
async function sweepRecruiterPayoutReservations({db,enabled=false,authorization,
 now=Date.now(),walletLimit=12,eventLimit=200}={}){
 if(!enabled)return {ok:true,disabled:true,reserved:0};
 const minimum=authorization?.minimumCents;
 if(!db||!authorization||!Number.isSafeInteger(minimum)||minimum<=200||minimum>3000||
    !Number.isSafeInteger(walletLimit)||walletLimit<1||walletLimit>20||
    !Number.isSafeInteger(eventLimit)||eventLimit<1||eventLimit>200)
   return {ok:false,reason:'payout_terms_or_budget_unapproved'};
 try{
  const wallets=await db.collection('recruiter_commission_wallets')
    .where('availableCents','>=',minimum).limit(walletLimit).get();
  let reserved=0,blocked=0;
  for(const wallet of wallets.docs||[]){
   const uid=wallet.id;
   // Only the intended Recruiter's eligible events. The matching composite
   // index is declared alongside the source, not assumed deployed.
   const page=await db.collection('referral_reward_events')
     .where('inviterUid','==',uid).where('status','==','available')
     .limit(eventLimit).get();
   const items=(page.docs||[]).filter(d=>d.data()?.requiresRecovery!==true&&
     Number.isSafeInteger(d.data()?.amountCents)&&d.data().amountCents>0);
   const amount=items.reduce((n,d)=>n+d.data().amountCents,0);
   if(amount<minimum)continue;
   const ids=items.map(d=>d.id).sort();
   const token=crypto.createHash('sha256')
     .update(JSON.stringify([uid,ids])).digest('hex').slice(0,40);
   const result=await reserveRecruiterPayout({db,uid,batchId:'rec_'+token,
     eventIds:ids,authorization,now});
   if(result.ok)reserved++;else blocked++;
  }
  return {ok:blocked===0,reserved,blocked};
 }catch{return {ok:false,reason:'payout_reservation_queue_unavailable'};}
}
module.exports={sweepRecruiterPayoutReservations};
