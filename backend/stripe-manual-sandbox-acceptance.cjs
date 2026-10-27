'use strict';
// Explicit test-key-only integration acceptance, no production traffic, transfers or payouts.
// Run via the founder's manual GitHub workflow. NEVER accept a live/restricted-live key.
const crypto=require('node:crypto');
const Stripe=require('stripe');
const {safeSandboxSecretKey}=require('./stripe-test-key-policy');
const key=safeSandboxSecretKey(process.env.STRIPE_TEST_SECRET_KEY);
if(!key) {
 console.error('STOP: STRIPE_TEST_SECRET_KEY must contain one complete sk_test_ secret. No live money permitted.');
 process.exit(1);
}
const stripe=new Stripe(key,{apiVersion:'2024-06-20',maxNetworkRetries:1});
const run=crypto.randomUUID();
const made=[];
const assure=(x,message)=>{if(!x)throw new Error(message)};
async function authorize(name){
 const pi=await stripe.paymentIntents.create({
   amount:1000,currency:'usd',payment_method_types:['card'],
   payment_method:'pm_card_visa',capture_method:'manual',confirm:true,
   metadata:{product:'American Rider test-only authorization',flow:name,
     acceptance_run:run,capturePolicy:'manual_v1'},
 },{idempotencyKey:'ar_sandbox_manual_'+run+'_'+name});
 made.push(pi.id);
 assure(pi.status==='requires_capture'&&pi.amount_capturable===1000,
   name+': Stripe did not reserve 1000 cents');
 const found=await stripe.paymentIntents.retrieve(pi.id,{expand:['latest_charge']});
 const deadline=found.latest_charge?.payment_method_details?.card?.capture_before;
 assure(Number.isSafeInteger(deadline)&&deadline*1000>Date.now()+60_000,
   name+': Stripe has not returned a usable card capture_before');
 return pi;
}
(async()=>{
 try {
   // Stripe itself, not a guessed alphabet for its credentials, proves test mode.
   // Do no financial writes until the authenticated account confirms livemode=false.
   const scope=await stripe.balance.retrieve();
   assure(scope?.livemode===false,'Stripe API did not confirm sandbox balance; no test payments performed');
   const full=await authorize('complete');
   const captured=await stripe.paymentIntents.capture(full.id,{amount_to_capture:1000},
     {idempotencyKey:'ar_sandbox_capture_'+run+'_full'});
   assure(captured.status==='succeeded'&&captured.amount_received===1000,
     'completed Travel did not capture 1000 cents');
   const free=await authorize('free-cancel');
   const voided=await stripe.paymentIntents.cancel(free.id,{cancellation_reason:'requested_by_customer'},
     {idempotencyKey:'ar_sandbox_void_'+run});
   assure(voided.status==='canceled'&&voided.amount_received===0&&voided.amount_capturable===0,
     'unused authorization did not release with zero captured funds');
   // Stripe may record the release of an uncaptured hold as a Refund object.
   // A refund object is not evidence of a second settled money movement.
   const releasedCharge=await stripe.charges.retrieve(voided.latest_charge);
   assure(releasedCharge.captured===false&&releasedCharge.amount_captured===0&&
     releasedCharge.balance_transaction===null,
     'unused authorization unexpectedly created a settled charge');
   const refunds=await stripe.refunds.list({payment_intent:free.id,limit:10});
   assure(!refunds.has_more&&refunds.data.every(refund=>refund.balance_transaction===null),
     'unused authorization unexpectedly created a settled refund balance movement');
   const fee=await authorize('partial');
   const part=await stripe.paymentIntents.capture(fee.id,{amount_to_capture:400},
     {idempotencyKey:'ar_sandbox_capture_'+run+'_partial'});
   assure(part.status==='succeeded'&&part.amount_received===400,
     'partial capture did not collect exactly 400 cents');
   console.log('PASS: three REAL Stripe TEST PaymentIntents: full capture, free authorization release with no settled money movement, 400-cent partial capture.');
   console.log('Test-only PaymentIntent IDs:',made.join(', '));
 } catch(e) {
   console.error('Stripe TEST acceptance FAILED:',String(e.code||e.type||e.message||e));
   process.exitCode=1;
 } finally {
   // Release any still-open TEST holds from an interrupted acceptance run.
   for(const id of made){
     try {
       const pi=await stripe.paymentIntents.retrieve(id);
       if(['requires_capture','requires_action','requires_confirmation',
           'requires_payment_method'].includes(pi.status))
         await stripe.paymentIntents.cancel(id,{cancellation_reason:'abandoned'});
     }catch{/* The test run has already failed or completed; never affect a live key. */}
   }
 }
})().catch(e=>{console.error('Stripe TEST acceptance failed',e.message);process.exitCode=1;});
