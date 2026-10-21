'use strict';
// Fixed $3 cancellation compensation, exactly once across Stripe timeouts,
// Firebase process restarts and idempotency-key expiration.
// A failed provider outcome is UNCERTAIN, not permission to send money again.
const GROSS_CENTS=400,NET_CENTS=300;
const uncertain=code=>({ok:false,code,unconfirmed:true,
 error:'Fixed Operator compensation requires financial reconciliation'});
function matchingTransfer(t,{rideId,paymentIntentId,accountId,chargeId,group}) {
 return !!t&&typeof t.id==='string'&&t.currency==='usd'&&
  t.destination===accountId&&t.source_transaction===chargeId&&
  t.transfer_group===group&&t.amount===NET_CENTS&&
  t.metadata?.rideId===rideId&&t.metadata?.paymentIntentId===paymentIntentId&&
  t.reversed!==true&&Number(t.amount_reversed||0)===0;
}
async function transferCancellationOnce({
 db,rideId,paymentIntentId,expectedUid,accountId,chargeId,
 findTransfers,createTransfer,now=Date.now()
}={}) {
 if(!db?.runTransaction||!rideId||!paymentIntentId||!expectedUid||
   !accountId||!chargeId||!findTransfers||!createTransfer)
   return uncertain('missing_transfer_authority');
 const ref=db.collection('rides').doc(rideId);
 const ledgerRef=db.collection('cancellation_transfer_ledger').doc(rideId);
 const group='ar_cancel_'+rideId;
 let claim;
 try{claim=await db.runTransaction(async tx=>{
   const rideSnap=await tx.get(ref),ledgerSnap=await tx.get(ledgerRef);
   const ride=rideSnap.exists?rideSnap.data():null;
   const ledger=ledgerSnap.exists?ledgerSnap.data():null;
   if(!ride||ride.status!=='cancelled'||ride.paymentCapturePolicy!=='manual_v1'||
      ride.paymentIntentId!==paymentIntentId||
      String(ride.travelerUid)!==String(expectedUid)||
      Number(ride.cancellationFeeCaptureCents)!==GROSS_CENTS||
      Number(ride.arrivalFeeCents)!==NET_CENTS||!ride.operatorId)
     return {code:'fee_record_not_verified'};
   if(ledger&&(ledger.paymentIntentId!==paymentIntentId||
      ledger.accountId!==accountId||ledger.chargeId!==chargeId||
      ledger.operatorId!==ride.operatorId))
     return {code:'fixed_transfer_identity_conflict'};
   if(ride.arrivalFeeTransferId)
     return {already:ride.arrivalFeeTransferId};
   if(ledger)return {newAttempt:false};
   tx.create(ledgerRef,{
     rideId,operatorId:ride.operatorId,paymentIntentId,accountId,chargeId,
     amountCents:NET_CENTS,group,state:'unconfirmed',startedAt:now,
   });
   return {newAttempt:true};
 });}catch{return uncertain('fixed_transfer_ledger_unavailable')}
 if(claim.code)return uncertain(claim.code);
 if(claim.already)return {ok:true,alreadySettled:true,transferId:claim.already,
   amountCents:NET_CENTS};
 let transfer;
 try{
   const found=await findTransfers(group);
   if(!found||!Array.isArray(found.data)||found.has_more||found.data.length>1)
     return uncertain('provider_transfer_ambiguous');
   transfer=found.data[0]||null;
 }catch{return uncertain('provider_transfer_check_failed')}
 const v={rideId,paymentIntentId,accountId,chargeId,group};
 if(transfer&&!matchingTransfer(transfer,v))return uncertain('provider_transfer_mismatch');
 if(!transfer&&!claim.newAttempt)return uncertain('prior_transfer_outcome_uncertain');
 if(!transfer){
   try {transfer=await createTransfer(group);}
   catch {return uncertain('provider_transfer_creation_uncertain')}
   if(!matchingTransfer(transfer,v))return uncertain('created_transfer_unverified');
 }
 try{
   const committed=await db.runTransaction(async tx=>{
     const rideSnap=await tx.get(ref),ledSnap=await tx.get(ledgerRef);
     if(!rideSnap.exists||!ledSnap.exists)return false;
     const ride=rideSnap.data(),led=ledSnap.data();
     if(ride.paymentIntentId!==paymentIntentId||ride.status!=='cancelled'||
        String(ride.travelerUid)!==String(expectedUid)||
        ride.operatorId!==led.operatorId||
        led.accountId!==accountId||led.chargeId!==chargeId||
        Number(ride.cancellationFeeCaptureCents)!==GROSS_CENTS||
        (ride.arrivalFeeTransferId&&ride.arrivalFeeTransferId!==transfer.id)||
        (led.transferId&&led.transferId!==transfer.id))return false;
     tx.set(ledgerRef,{state:'transferred',transferId:transfer.id,verifiedAt:now},{merge:true});
     tx.set(ref,{arrivalFeeTransferId:transfer.id,arrivalFeePaidAt:now,
       arrivalFeePending:false,arrivalFeeBlockedReason:null},{merge:true});
     return true;
   });
   if(!committed)return uncertain('post_transfer_ledger_conflict');
 }catch{return uncertain('post_transfer_ledger_unconfirmed')}
 return {ok:true,transferId:transfer.id,amountCents:NET_CENTS,reconciled:!claim.newAttempt};
}
module.exports={transferCancellationOnce,matchingTransfer,NET_CENTS,GROSS_CENTS};
