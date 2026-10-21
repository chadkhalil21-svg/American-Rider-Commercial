'use strict';
// Signed-provider reconciliation using an already loaded Travel. No extra queries,
// no speculative refund, no automatic clawback from an innocent Operator.
const CANCELLATION_CENTS=400;
function assessCapturedPayment({ride,intent}={}) {
 const denied=reason=>({ok:false,reason});
 if(!ride||!intent?.id)return denied('missing_travel_or_payment');
 if(String(ride.travelerUid||'')!==String(intent.metadata?.uid||''))return denied('owner_mismatch');
 if(ride.paymentIntentId&&String(ride.paymentIntentId)!==String(intent.id))
   return denied('duplicate_or_foreign_payment_intent');
 if(String(intent.currency||'').toLowerCase()!=='usd')return denied('currency_mismatch');
 const amount=Number(intent.amount_received),fare=Number(ride.costCents);
 if(!Number.isSafeInteger(fare)||fare<=0||!Number.isSafeInteger(amount)||amount<=0)
   return denied('invalid_provider_amount');
 const manual=intent.metadata?.capturePolicy==='manual_v1';
 if(manual) {
   if(ride.paymentCapturePolicy!=='manual_v1'||intent.capture_method!=='manual')
     return denied('manual_policy_mismatch');
   if(Number(intent.amount)!==fare)return denied('authorized_fare_mismatch');
   if(ride.status==='cancelled') {
     if(amount!==CANCELLATION_CENTS||
        Number(ride.cancellationFeeCaptureCents)!==CANCELLATION_CENTS)
       return denied('undisclosed_or_incorrect_cancellation_capture');
     return {ok:true,kind:'cancellation_fee',amountCents:amount};
   }
   if(ride.status!=='completed')return denied('full_capture_before_verified_completion');
   if(amount!==fare)return denied('completed_capture_amount_mismatch');
   return {ok:true,kind:'completed_fare',amountCents:amount};
 }
 if(ride.paymentCapturePolicy==='manual_v1')return denied('unexpected_legacy_capture_of_manual_travel');
 if(amount!==fare)return denied('captured_fare_amount_mismatch');
 return {ok:true,kind:'legacy_captured_fare',amountCents:amount};
}
function reviewDisputeClose({status,amount,hadOperatorTransfer=false}={}) {
 if(!Number.isSafeInteger(amount)||amount<0)return {kind:'review',reason:'invalid_provider_dispute_amount',automaticallyRefund:false};
 if(status==='lost')return {kind:'provider_loss',lossCents:amount,operatorTransferReview:!!hadOperatorTransfer,automaticallyRefund:false};
 if(status==='won')return {kind:'provider_won',lossCents:0,operatorTransferReview:false,automaticallyRefund:false};
 return {kind:'review',reason:'unexpected_dispute_outcome',automaticallyRefund:false};
}
function refundableChargeSafety(pi) {
 if(!pi||pi.status!=='succeeded')return {ok:false,reason:'not_captured'};
 if(pi.latest_charge?.disputed===true)return {ok:false,reason:'disputed_charge_requires_provider_reconciliation'};
 return {ok:true};
}
module.exports={assessCapturedPayment,reviewDisputeClose,refundableChargeSafety};
