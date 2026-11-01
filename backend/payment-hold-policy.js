'use strict';
// PR #143 replacement: POLICY ONLY. This does NOT alter production automatic capture.
// Activation requires integrated PaymentSheet + provider webhooks + durable outbox +
// scheduled off-session authorization, actual Stripe sandbox evidence and legal approval.
// Never dispatch on a client's assertion that the payment is authorized.
const HOURS_24 = 24 * 60 * 60 * 1000;
const MIN_CAPTURE_HEADROOM_MS = 60 * 60 * 1000;
const FREE_CANCEL_MS = 2 * 60 * 1000;
const MAX_CANCELLATION_FEE_CENTS = 400;

function schedulePlan({now, departAt, savedMethod=false, futureUseConsented=false}) {
  if (!Number.isFinite(now) || !Number.isFinite(departAt) || departAt <= now)
    return {action:'invalid_time',mayDispatch:false};
  if (!futureUseConsented)
    return {action:'obtain_explicit_payment_consent',mayDispatch:false};
  if (departAt - now > HOURS_24)
    return {action:savedMethod?'wait_until_authorization_window':'setup_intent_off_session',mayDispatch:false};
  return {action:savedMethod?'authorize_saved_card':'authorize_with_traveler',mayDispatch:false};
}

// Stripe returns the capture deadline on the latest Charge card details.
// NEVER assume that a hold lasts exactly seven days; use the provider value.
function captureDeadlineMs(intent) {
  const secs = intent?.latest_charge?.payment_method_details?.card?.capture_before;
  return Number.isSafeInteger(secs) && secs > 0 ? secs * 1000 : null;
}

function verifyHold({intent,uid,rideId,totalCents,now,requiredUntil,
                     minCaptureHeadroomMs=MIN_CAPTURE_HEADROOM_MS} = {}) {
  const denied=(reason)=>({ok:false,reason});
  if (!intent || intent.status!=='requires_capture') return denied('not_authorized');
  if (String(intent.metadata?.uid||'')!==String(uid||'') ||
      String(intent.metadata?.rideId||'')!==String(rideId||'') || !uid || !rideId)
    return denied('ownership_or_travel_mismatch');
  if (intent.currency!=='usd' || !Number.isSafeInteger(totalCents) || totalCents<=0 ||
      intent.amount!==totalCents || intent.amount_capturable!==totalCents)
    return denied('amount_or_currency_mismatch');
  if(intent.metadata?.selectedPaymentMethodId&&
     !require('./selected-card-authority').exactChargedCardMatch({
       intent,paymentMethodId:intent.metadata.selectedPaymentMethodId,
       country:intent.metadata.selectedCardIssuerCountry}))
    return denied('selected_card_or_issuer_changed_requote_required');
  if (!Number.isFinite(now)||!Number.isFinite(requiredUntil)||requiredUntil<now)
    return denied('invalid_time');
  if(!Number.isSafeInteger(minCaptureHeadroomMs)||minCaptureHeadroomMs<30000||
      minCaptureHeadroomMs>MIN_CAPTURE_HEADROOM_MS)
    return denied('invalid_capture_safety_window');
  const expires=captureDeadlineMs(intent);
  if (!Number.isFinite(expires) ||
      expires <= Math.max(now,requiredUntil) + minCaptureHeadroomMs)
    return denied('capture_window_not_verified');
  return {ok:true,expires,reason:null};
}

function settlementPlan({intent,uid,rideId,totalCents,now,requiredUntil,travelState,
                         verifiedCancellationFeeCents=0,acceptedAt,operatorAtFault=false} = {}) {
  const auth=verifyHold({intent,uid,rideId,totalCents,now,requiredUntil});
  if (!auth.ok) return {action:'reconcile',reason:auth.reason};
  if (travelState==='completed')
    return {action:'capture',amountCents:totalCents,reason:'verified_completion'};
  if (travelState!=='cancelled')
    return {action:'wait',reason:'service_not_finished'};
  // Fee is accepted ONLY as a server-stored outcome from the existing verified GPS
  // cancellation-progress engine. No boolean progress flag from PR #143 is trusted.
  const withinGrace=Number.isFinite(acceptedAt) && Number.isFinite(now) &&
    now-acceptedAt < FREE_CANCEL_MS;
  const fee=Number.isSafeInteger(verifiedCancellationFeeCents)
    ? verifiedCancellationFeeCents : -1;
  if (operatorAtFault || withinGrace || !Number.isFinite(acceptedAt) ||
      acceptedAt>now || fee<=0 || fee>MAX_CANCELLATION_FEE_CENTS)
    return {action:'void_authorization',reason:'no_verified_earned_fee'};
  return {action:'capture',amountCents:Math.min(totalCents,fee),
          reason:'server_verified_cancellation_fee'};
}

module.exports={HOURS_24,MIN_CAPTURE_HEADROOM_MS,FREE_CANCEL_MS,
 MAX_CANCELLATION_FEE_CENTS,schedulePlan,captureDeadlineMs,verifyHold,settlementPlan};
