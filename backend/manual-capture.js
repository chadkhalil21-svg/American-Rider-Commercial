'use strict';
const { verifyHold }=require('./payment-hold-policy');
const { STANDARD_CANCELLATION_GROSS_CENTS, OPERATOR_NET_CENTS }=require('./fee-economics');
// Pure provider-compatible operation. Provider API is supplied by caller to keep
// synthetic tests separate from live Stripe and prevent unintentional money movement.
async function executeManualSettlement({
 stripe,paymentIntentId,uid,rideId,totalCents,action,requiredUntil=Date.now(),
 now=Date.now(),verifiedFeeCents=0
}={}) {
 const reject=(code)=>({ok:false,code});
 if(!stripe||!paymentIntentId||!uid||!rideId) return reject('missing_binding');
 if(!['complete','cancel','fee'].includes(action)) return reject('invalid_settlement_action');
 if(!Number.isSafeInteger(totalCents)||totalCents<=0) return reject('invalid_amount');
 if(action==='fee'&&verifiedFeeCents!==STANDARD_CANCELLATION_GROSS_CENTS)
   return reject('fee_not_verified_or_disclosed');
 // Call Stripe once for status; never trust a phone's payment claim.
 const pi=await stripe.paymentIntents.retrieve(paymentIntentId,{expand:['latest_charge']});
 if(!pi||pi.metadata?.uid!==String(uid)||pi.metadata?.rideId!==String(rideId)||
    pi.id!==String(paymentIntentId)||pi.currency!=='usd'||pi.amount!==totalCents)
   return reject('wrong_payment_or_travel');
 const captureCents=action==='complete'?totalCents:
   action==='fee'?STANDARD_CANCELLATION_GROSS_CENTS:0;
 if(action==='fee'&&totalCents<captureCents) return reject('hold_too_small');
 if(pi.status==='succeeded') {
   if(action==='cancel')return reject('already_captured_requires_refund_or_review');
   if(pi.amount_received!==captureCents)return reject('different_amount_already_captured');
   return {ok:true,status:'captured',captureCents,operatorNetCents:action==='fee'?OPERATOR_NET_CENTS:null,
      reused:true,paymentIntentId:pi.id};
 }
 if(pi.status==='canceled') {
   return action==='cancel'?{ok:true,status:'released',captureCents:0,reused:true,paymentIntentId:pi.id}:
     reject('already_released');
 }
 if(pi.status!=='requires_capture')return reject('intent_not_authorized');
 // Stripe cancellation of a confirmed but uncaptured intent does NOT incur
 // an ordinary card refund. It needs no capture window once canceled.
 if(action==='cancel') {
   const canceled=await stripe.paymentIntents.cancel(pi.id,{cancellation_reason:'requested_by_customer'},
      {idempotencyKey:`ar_hold_void_${rideId}`});
   return canceled.status==='canceled'?{ok:true,status:'released',captureCents:0,
      paymentIntentId:pi.id}:reject('void_not_confirmed');
 }
 const v=verifyHold({intent:pi,uid,rideId,totalCents,now,requiredUntil});
 if(!v.ok)return reject(v.reason);
 const captured=await stripe.paymentIntents.capture(pi.id,{amount_to_capture:captureCents},
   {idempotencyKey:`ar_hold_${action}_${rideId}_${captureCents}`});
 if(captured.status!=='succeeded'||captured.amount_received!==captureCents)
   return reject('capture_not_confirmed');
 return {ok:true,status:'captured',captureCents,
   operatorNetCents:action==='fee'?OPERATOR_NET_CENTS:null,
   paymentIntentId:captured.id,captureBeforeMs:v.expires};
}
module.exports={executeManualSettlement};
