'use strict';
// Durable, server-owned record of observed, settled Travels. This is not a
// commission, bonus, payout or evidence the charge can never be refunded.
// A pending flag is written ONLY with the successful Operator settlement.
// A bounded sweep resumes safely after a crash; every event has a fixed ID.
const {evidence}=require('./referral-accrual');
const {validUid}=require('./recruiter-portal');
const ROLES=['operator','traveler'];
const COLLECTION={operator:'recruiter_operator_settlements',
  traveler:'recruiter_traveler_settlements'};
const validTravelId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{8,80}$/.test(id);
async function recordSettledTravel({db,rideId,now=Date.now()}={}){
  if(!db||!validTravelId(rideId)||!Number.isSafeInteger(now)||now<=0)
    return {ok:false,reason:'invalid_request'};
  try{
    return await db.runTransaction(async tx=>{
      const rideRef=db.collection('rides').doc(rideId);
      const rideSnap=await tx.get(rideRef);
      if(!rideSnap.exists||rideSnap.data()?.referralTrackingPending!==true)
        return {ok:true,recorded:0,skipped:true};
      const travel=evidence(rideSnap.data(),rideId);
      if(!travel)return {ok:false,reason:'settlement_not_verified'};
      const records=await Promise.all(ROLES.map(async role=>{
        const inviteeUid=role==='operator'?travel.operatorUid:travel.travelerUid;
        const claimRef=db.collection('referral_attributions').doc(inviteeUid+'_'+role);
        const claimSnap=await tx.get(claimRef);
        const claim=claimSnap.exists?claimSnap.data():null;
        if(!claim||claim.inviteeUid!==inviteeUid||claim.role!==role||
           !validUid(claim.inviterUid)||claim.inviterUid===inviteeUid)
          return {role,claim:null};
        const recruiter=await tx.get(db.collection('recruiter_accounts').doc(claim.inviterUid));
        if(!recruiter.exists||!['approved','suspended'].includes(recruiter.data()?.status))
          return {role,claim:null};
        const eventRef=db.collection(COLLECTION[role]).doc(rideId);
        const eventSnap=await tx.get(eventRef);
        return {role,claim,claimRef,inviteeUid,eventRef,exists:eventSnap.exists};
      }));
      let recorded=0;
      for(const item of records){
        if(!item.claim||item.exists)continue;
        const previous=item.claim.recordedSettledTravels??0;
        if(!Number.isSafeInteger(previous)||previous<0||previous>=Number.MAX_SAFE_INTEGER)
          return {ok:false,reason:'activity_counter_needs_review'};
        tx.create(item.eventRef,{
          inviterUid:item.claim.inviterUid,inviteeUid:item.inviteeUid,
          role:item.role,rideId,settledAt:rideSnap.data().settledAt,
          observedAt:now,status:'settled_observed',
          // Refunds/disputes may later reverse a settlement; NOT payable.
          commissionCents:null,payoutStatus:'not_commissioned',version:1,
        });
        tx.update(item.claimRef,{recordedSettledTravels:previous+1,
          recordedSettlementUpdatedAt:now});
        recorded++;
      }
      // This flag is cleared in the SAME transaction as the activity events.
      tx.update(rideRef,{referralTrackingPending:false,referralTrackedAt:now});
      return {ok:true,recorded};
    });
  }catch{return {ok:false,reason:'activity_unavailable'};}
}
async function sweepSettledTravelActivity({db,limit=20}={}){
  if(!db||!Number.isSafeInteger(limit)||limit<1||limit>50)
    return {ok:false,reason:'invalid_request'};
  try{
    const page=await db.collection('rides').where('referralTrackingPending','==',true)
      .limit(limit).get();
    let recorded=0,processed=0,blocked=0;
    for(const doc of page.docs||[]){
      const r=await recordSettledTravel({db,rideId:doc.id});
      if(!r.ok){blocked++;continue;}
      processed++;recorded+=r.recorded||0;
    }
    return {ok:true,processed,recorded,blocked};
  }catch{return {ok:false,reason:'activity_sweep_unavailable'};}
}
async function recruiterSettlementCounts({db,uid}={}){
  if(!db||!validUid(uid))return null;
  try{
    const [operators,travelers]=await Promise.all(ROLES.map(role=>
      db.collection(COLLECTION[role]).where('inviterUid','==',uid).count().get()));
    return {operatorSettlementRecords:Number(operators.data().count)||0,
      travelerSettlementRecords:Number(travelers.data().count)||0};
  }catch{return null;}
}
module.exports={COLLECTION,recordSettledTravel,sweepSettledTravelActivity,recruiterSettlementCounts};
