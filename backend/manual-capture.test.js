'use strict';
const assert=require('node:assert/strict');
const {executeManualSettlement}=require('./manual-capture');
const now=Date.UTC(2026,9,21,15,30);
function setup(opts={}){
 let pi={id:'pi_test',status:'requires_capture',capture_method:'manual',amount:2500,amount_capturable:2500,currency:'usd',
  metadata:{uid:'person',rideId:'journey',capturePolicy:'manual_v1'},amount_received:0,
  latest_charge:{payment_method_details:{card:{capture_before:Math.floor((now+2*86400000)/1000)}}},...opts};
 const calls={retrieve:0,capture:0,cancel:0,ids:[]};
 const stripe={paymentIntents:{
  retrieve:async()=>{calls.retrieve++;return {...pi}},
  capture:async(id,params,meta)=>{
   calls.capture++;calls.ids.push(meta.idempotencyKey);
   pi={...pi,status:'succeeded',amount_received:params.amount_to_capture,amount_capturable:0};
   return {...pi};
  },
  cancel:async(id,params,meta)=>{
   calls.cancel++;calls.ids.push(meta.idempotencyKey);pi={...pi,status:'canceled',amount_capturable:0};return {...pi};
  },
 }};
 const run=(action,extra={})=>executeManualSettlement({stripe,paymentIntentId:'pi_test',uid:'person',
   rideId:'journey',totalCents:2500,now,requiredUntil:now+3600000,action,...extra});
 return {stripe,calls,run};
}
(async()=>{
 const a=setup(),paid=await a.run('complete');
 assert.equal(paid.captureCents,2500);assert.equal(paid.status,'captured');
 assert.equal((await a.run('complete')).reused,true);assert.equal(a.calls.capture,1);
 assert.equal((await a.run('cancel')).code,'already_captured_requires_refund_or_review');
 for(const pending of ['requires_payment_method','requires_confirmation','requires_action']){
   const pendingSheet=setup({status:pending});
   const canceled=await pendingSheet.run('cancel');
   assert.equal(canceled.status,'released','canceled '+pending+' without a refund');
   assert.equal(pendingSheet.calls.cancel,1);
   assert.equal(pendingSheet.calls.capture,0);
 }
 const b=setup(),voided=await b.run('cancel');
 assert.equal(voided.status,'released');assert.equal(b.calls.capture,0);assert.equal(b.calls.cancel,1);
 assert.equal((await b.run('cancel')).reused,true);assert.equal(b.calls.cancel,1);
 const c=setup(),fee=await c.run('fee',{verifiedFeeCents:400});
 assert.equal(fee.captureCents,400);assert.equal(fee.operatorNetCents,300);
 assert.equal(c.calls.capture,1);assert.equal((await c.run('fee',{verifiedFeeCents:400})).reused,true);
 assert.equal((await c.run('complete')).code,'different_amount_already_captured');
 assert.equal((await setup().run('fee',{verifiedFeeCents:300})).code,'fee_not_verified_or_disclosed');
 assert.equal((await setup({status:'processing'}).run('complete')).code,'intent_not_authorized');
 assert.equal((await setup({metadata:{uid:'other',rideId:'journey'}}).run('complete')).code,'wrong_payment_or_travel');
 assert.equal((await setup({amount_capturable:2000}).run('complete')).code,'amount_or_currency_mismatch');
 assert.equal((await setup({capture_method:'automatic'}).run('complete')).code,'not_a_manual_travel_authorization');
 assert.equal((await setup({metadata:{uid:'person',rideId:'journey'}}).run('complete')).code,'not_a_manual_travel_authorization');
 const headroom=setup({latest_charge:{payment_method_details:{card:{
   capture_before:Math.floor((now+180000)/1000)}}}});
 const capturedLate=await headroom.run('complete',{requiredUntil:now});
 assert.equal(capturedLate.ok,true,'valid completed travel captures with three-minute Stripe headroom even when dispatch requires one hour');
 assert.equal(headroom.calls.capture,1);
 const tooLate=setup({latest_charge:{payment_method_details:{card:{
   capture_before:Math.floor((now+28000)/1000)}}}});
 assert.equal((await tooLate.run('complete',{requiredUntil:now})).code,'capture_window_not_verified');
 assert.equal(tooLate.calls.capture,0);
 assert.equal((await setup({latest_charge:null}).run('complete')).code,'capture_window_not_verified');
 assert.equal((await setup({status:'canceled'}).run('complete')).code,'already_released');
 assert.equal((await setup({amount_received:0,status:'succeeded'}).run('complete')).code,'different_amount_already_captured');
 for(let i=0;i<1000;i++){
  const e=setup({latest_charge:{payment_method_details:{card:{capture_before:Math.floor((now+1000+i)/1000)}}}});
  assert.equal((await e.run('complete')).code,'capture_window_not_verified');
  assert.equal(e.calls.capture,0);
 }
 console.log('PASS: 1,000 synthetic authorization expiries, strict binding, $4 single capture/$3 Operator, no-refund full void, replay and legacy status guards');
})().catch(e=>{console.error(e);process.exitCode=1;});
