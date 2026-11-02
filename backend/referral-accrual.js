'use strict';
// Prepared reward accounting: settlement evidence + exactly-once HELD accrual.
// No Stripe calls, no Traveler credits, no bank transfers, no API route.
// Founder-approved $0.15 per qualifying completed paid Travel per attributed role.
// 200-Travel limit remains the existing conservative safeguard, subject to final written terms.
// Explicit legal, budget and provider gates keep production OFF until commissioned.
// Read actual ride fields: operatorId/travelerUid/transferId/settledAt, not
// fictitious fields such as operatorUid or paymentStatus='captured'.
const {rewardDecision}=require('./referral-policy');
const PROGRAM=Object.freeze({
  enabled:false,perTravelCents:15,maxTravels:200,maxCents:3000,
  version:'recruiter-15c-20261031-v2',holdMs:86400000,
});
function evidence(ride,id){
  if(!ride||typeof id!=='string'||!id)return null;
  if(ride.status!=='completed'||typeof ride.operatorId!=='string'||
     typeof ride.travelerUid!=='string'||!ride.operatorId||!ride.travelerUid||
     !ride.paymentIntentId||!ride.transferId||
     !Number.isFinite(ride.settledAt)||ride.settledAt<=0)return null;
  if(ride.operatorDemo===true||ride.synthetic===true||
     ride.refundPending===true||ride.refunded===true||
     ride.recruiterRewardRefunded===true||
     ride.disputePending===true||ride.disputed===true||
     ride.payoutReconciliationNeeded===true)return null;
  // A manual authorization is NOT a paid Travel until captured.
  if(ride.paymentCapturePolicy==='manual_v1'&&
     (ride.authorizationState!=='captured'||!ride.capturedAt||
      !Number.isSafeInteger(ride.capturedCents)||ride.capturedCents<=0))return null;
  if(ride.paymentCapturePolicy!=='manual_v1'&&
     (!ride.paidAt||!Number.isFinite(ride.paidAt)))return null;
  return {id,operatorUid:ride.operatorId,travelerUid:ride.travelerUid,
    status:'completed',paymentStatus:'captured',refunded:false,
    disputed:false,synthetic:false};
}
async function recordHeldAccrual({db,rideId,program=PROGRAM,now=Date.now()}={}){
  if(!db||typeof rideId!=='string'||!/^[a-zA-Z0-9_-]{8,80}$/.test(rideId))
    return {ok:false,reason:'invalid_request'};
  if(program.enabled!==true)return {ok:false,reason:'program_off',events:0};
  if(!Number.isSafeInteger(program.holdMs)||program.holdMs<86400000||program.holdMs>120*86400000)
    return {ok:false,reason:'hold_not_approved',events:0};
  try{
    return await db.runTransaction(async tx=>{
      const rideRef=db.collection('rides').doc(rideId);
      // No queries, scans or fixed hot global counter.
      const snap=await tx.get(rideRef);
      const ride=snap.exists?snap.data():null;
      const travel=evidence(ride,rideId);
      if(!travel||ride.referralProgramVersion!==program.version)
        return {ok:false,reason:'settlement_or_program_not_verified',events:0};
      if(ride.referralAccrualPending!==true)
        return {ok:true,duplicate:true,events:0,heldCents:0};
      // This must be set by the authoritative, post-expense quote and budget
      // calculation. An absent or unverifiable budget gives zero rewards.
      const budget=ride?.referralAvailableCents;
      if(!Number.isSafeInteger(budget)||budget<0)return {ok:false,reason:'no_funded_budget',events:0};
      const roles=[['operator',travel.operatorUid],['traveler',travel.travelerUid]];
      const reads=await Promise.all(roles.map(async([role,uid])=>{
        const claimRef=db.collection('referral_attributions').doc(uid+'_'+role);
        const eventRef=db.collection('referral_reward_events').doc(rideId+'_'+role);
        const [claim,event]=await Promise.all([tx.get(claimRef),tx.get(eventRef)]);
        return {role,uid,claimRef,eventRef,claim:claim.exists?claim.data():null,
          done:event.exists};
      }));
      let remaining=budget;
      let credited=0;
      for(const item of reads){
        if(!item.claim||item.done||item.claim.rewardEnabled!==true||
           item.claim.inviteeUid!==item.uid||item.claim.role!==item.role||
           item.claim.programVersion!==program.version)continue;
        const decision=rewardDecision({
          attribution:{targetRole:item.role,inviteeUid:item.uid},
          travel,program,
          priorQualifiedTravels:Number(item.claim.qualifiedTravels||0),
          earnedCents:Number(item.claim.earnedCents||0),
          availableContributionCents:remaining,
        });
        if(!decision.eligible)continue;
        tx.create(item.eventRef,{
          travelId:rideId,inviteeUid:item.uid,inviterUid:item.claim.inviterUid,
          role:item.role,programVersion:program.version,
          amountCents:decision.rewardCents,status:'held',createdAt:now,
          nextReleaseAt:now+program.holdMs,
        });
        tx.update(item.claimRef,{
          qualifiedTravels:Number(item.claim.qualifiedTravels||0)+1,
          earnedCents:Number(item.claim.earnedCents||0)+decision.rewardCents,
        });
        remaining-=decision.rewardCents;credited++;
      }
      tx.update(rideRef,{referralAccrualPending:false,referralAccruedAt:now});
      return {ok:true,events:credited,heldCents:budget-remaining};
    });
  }catch{return {ok:false,reason:'accrual_unavailable',events:0};}
}
module.exports={PROGRAM,evidence,recordHeldAccrual};
