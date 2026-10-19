'use strict';
// PAYMENT POLICY PROPOSAL ONLY. No Stripe calls; NEVER used to change live capture.
// For automated deployment, integrate this through all money/dispatch/receipt paths
// with idempotent Stripe test coverage, full localization and manual approval.
const AUTHORIZE_BEFORE_MS=24*60*60*1000;
const CANCEL_GRACE_MS=2*60*1000;
const ARRIVAL_FEE_CENTS=300;
const allowedHoldStatuses=new Set(['requires_capture']);
function scheduledPaymentAction({now,scheduledAt,hasSavedCard=false}={}){
 if(!Number.isFinite(now)||!Number.isFinite(scheduledAt)||scheduledAt<now)
   return {action:'reject_invalid_time',dispatch:false};
 if(scheduledAt-now>AUTHORIZE_BEFORE_MS)
   return {action:hasSavedCard?'wait_for_authorization_window':'collect_payment_method_consent',dispatch:false};
 return {action:'authorize_card_and_verify_requires_capture',dispatch:false};
}
function dispatchEligibility({paymentStatus,authorizationExpiresAt,now,consentConfirmed=false}={}){
 if(!consentConfirmed)return {dispatch:false,reason:'payment_authorization_consent_missing'};
 if(!allowedHoldStatuses.has(paymentStatus))return {dispatch:false,reason:'funds_not_authorized'};
 if(!Number.isFinite(now)||!Number.isFinite(authorizationExpiresAt)||authorizationExpiresAt<=now+60*60*1000)
   return {dispatch:false,reason:'authorization_expiring_or_expired'};
 return {dispatch:true,reason:null};
}
function cancellationFeeDecision({acceptedAt,now,verifiedProgress=false,arrivedAt,
   operatorAtFault=false,travelerAtFault=true}={}){
 // Case recording, pickup progress and timestamp are authoritative server data,
 // not a flag the Operator can set for monetary reward.
 if(operatorAtFault||!travelerAtFault)return {feeCents:0,reason:'not_traveler_fault'};
 if(!Number.isFinite(now)||!Number.isFinite(acceptedAt)||acceptedAt>now)
   return {feeCents:0,reason:'not_verified_accepted'};
 // The promised free period applies even if the Operator arrives unusually quickly.
 if(now-acceptedAt<CANCEL_GRACE_MS)return {feeCents:0,reason:'within_free_window'};
 if(Number.isFinite(arrivedAt)&&arrivedAt<=now)
   return {feeCents:ARRIVAL_FEE_CENTS,reason:'verified_arrival'};
 if(verifiedProgress!==true)return {feeCents:0,reason:'progress_not_proven'};
 return {feeCents:ARRIVAL_FEE_CENTS,reason:'verified_en_route_after_grace'};
}
module.exports={AUTHORIZE_BEFORE_MS,CANCEL_GRACE_MS,ARRIVAL_FEE_CENTS,
 scheduledPaymentAction,dispatchEligibility,cancellationFeeDecision};
