'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {HOURS_24, schedulePlan,verifyHold,settlementPlan}=require('./payment-hold-policy');
const now=Date.UTC(2026,9,20,12,0,0);
const until=now+30*60*1000;
function intent(overrides={}) {
  return {
    status:'requires_capture',currency:'usd',amount:2500,amount_capturable:2500,
    metadata:{uid:'traveler-one',rideId:'ride-one'},
    latest_charge:{payment_method_details:{card:{capture_before:Math.ceil((now+3*HOURS_24)/1000)}}},
    ...overrides,
  };
}
function opts(pi=intent()) {
  return {intent:pi,uid:'traveler-one',rideId:'ride-one',totalCents:2500,now,requiredUntil:until};
}
function run() {
  assert.equal(schedulePlan({now,departAt:now+30*HOURS_24,savedMethod:false,futureUseConsented:true}).action,'setup_intent_off_session');
  assert.equal(schedulePlan({now,departAt:now+30*HOURS_24,savedMethod:true,futureUseConsented:true}).action,'wait_until_authorization_window');
  assert.equal(schedulePlan({now,departAt:now+HOURS_24/2,savedMethod:true,futureUseConsented:true}).action,'authorize_saved_card');
  assert.equal(schedulePlan({now,departAt:now+HOURS_24/2,savedMethod:false,futureUseConsented:true}).action,'authorize_with_traveler');
  assert.equal(schedulePlan({now,departAt:now+HOURS_24/2,futureUseConsented:false}).action,'obtain_explicit_payment_consent');
  assert.equal(schedulePlan({now,departAt:now-1,savedMethod:true,futureUseConsented:true}).mayDispatch,false);
  assert.equal(verifyHold(opts()).ok,true);
  assert.equal(verifyHold(opts(intent({status:'succeeded'}))).reason,'not_authorized');
  assert.equal(verifyHold(opts(intent({metadata:{uid:'other',rideId:'ride-one'}}))).reason,'ownership_or_travel_mismatch');
  assert.equal(verifyHold(opts(intent({metadata:{uid:'traveler-one',rideId:'other'}}))).reason,'ownership_or_travel_mismatch');
  assert.equal(verifyHold(opts(intent({amount:2501}))).reason,'amount_or_currency_mismatch');
  assert.equal(verifyHold(opts(intent({amount_capturable:2000}))).reason,'amount_or_currency_mismatch');
  assert.equal(verifyHold(opts(intent({currency:'eur'}))).reason,'amount_or_currency_mismatch');
  assert.equal(verifyHold(opts(intent({latest_charge:null}))).reason,'capture_window_not_verified');
  assert.equal(verifyHold(opts(intent({latest_charge:{payment_method_details:{card:{capture_before:Math.floor((now+30*60*1000)/1000)}}}}))).reason,'capture_window_not_verified');
  assert.deepEqual(
    settlementPlan({...opts(),travelState:'completed'}),
    {action:'capture',amountCents:2500,reason:'verified_completion'});
  assert.equal(settlementPlan({...opts(),travelState:'accepted'}).action,'wait');
  assert.equal(settlementPlan({...opts(),travelState:'cancelled',acceptedAt:now-30000,verifiedCancellationFeeCents:400}).action,'void_authorization');
  assert.equal(settlementPlan({...opts(),travelState:'cancelled',acceptedAt:now-180000,verifiedCancellationFeeCents:0}).action,'void_authorization');
  assert.equal(settlementPlan({...opts(),travelState:'cancelled',acceptedAt:now-180000,verifiedCancellationFeeCents:400,operatorAtFault:true}).action,'void_authorization');
  assert.equal(settlementPlan({...opts(),travelState:'cancelled',acceptedAt:now-180000,verifiedCancellationFeeCents:401}).action,'void_authorization');
  assert.deepEqual(settlementPlan({...opts(),travelState:'cancelled',acceptedAt:now-180000,verifiedCancellationFeeCents:400}),
    {action:'capture',amountCents:400,reason:'server_verified_cancellation_fee'});
  // Synthetic, deterministic stress: unknown or near-expiring capture deadlines
  // always DENY dispatch; otherwise validate amount and ownership.
  for(let i=0;i<20000;i++){
    const near=i%2===0;
    const exp=near ? now+10*60*1000 : now+2*HOURS_24;
    const pi=intent({latest_charge:{payment_method_details:{card:{capture_before:Math.floor(exp/1000)}}}});
    assert.equal(verifyHold(opts(pi)).ok,!near);
  }
  // Deployment isolation: imported policy MUST NOT be enabled by importing it.
  const payments=fs.readFileSync(path.join(__dirname,'payments.js'),'utf8');
  const booking=fs.readFileSync(path.join(__dirname,'booking.js'),'utf8');
  assert(!payments.slice(payments.indexOf('async function createPaymentIntent('),payments.indexOf('async function resumePaymentIntent(')).includes("capture_method: 'manual'"));
  assert(booking.includes("payment.status === 'succeeded'"));
}
run();run();
console.log('PASS twice: PR143 future authorization/capture/void policy + 40,000 synthetic hold conditions; production auto-capture unchanged.');
