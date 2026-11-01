'use strict';
// Real Stripe TEST-only verification of one existing Operator receiving BOTH
// normal Travel and earned referral commission into the SAME Express account.
// Never creates a connected account, changes payout cadence, touches Firebase,
// sends a bank payout, or uses live money. Test provider proof != bank receipt.
const fs=require('node:fs');
const crypto=require('node:crypto');
const Stripe=require('stripe');
const {safeSandboxSecretKey}=require('./stripe-test-key-policy');
const secret=safeSandboxSecretKey(process.env.STRIPE_TEST_SECRET_KEY);
if(!secret){console.error('STOP: Stripe sk_test_ secret required');process.exit(2);}
const stripe=new Stripe(secret,{apiVersion:'2024-06-20',maxNetworkRetries:1,timeout:25000});
const id=crypto.randomBytes(10).toString('hex');
const existingOperatorAccount='acct_1UVxihAmgNHFzmi5'; // Prior verified TEST Express recipient; NEVER live.
const travel='ar_qa_operator_travel_'+id;
const total=2000,travelFare=1500,operatorTravel=Math.round(travelFare*0.99),referral=15;
const evidence={schema:1,kind:'EXISTING_OPERATOR_TRAVEL_PLUS_REFERRAL',mode:'NOT_VERIFIED',
  recipientRole:'EXISTING_TEST_EXPRESS_STAND_IN_NOT_REAL_OPERATOR',
  testedCommit:process.env.GITHUB_SHA||null,liveMoney:false,bankPayoutTested:false,
  secondStripeAccountCreated:false,normalPayoutScheduleChanged:false,
  travelerChargeCents:total,travelFareCents:travelFare,operatorTravelCents:operatorTravel,
  referralCommissionCents:referral,steps:[],provider:{},result:'FAIL'};
const requireTrue=(x,message)=>{if(!x)throw Error(message);};
const step=(label,status)=>{evidence.steps.push({label,status});console.log(status+' '+label);};
const save=()=>{fs.mkdirSync('artifacts/operator-referral-stripe-test',{recursive:true});
  fs.writeFileSync('artifacts/operator-referral-stripe-test/provider-evidence.json',
    JSON.stringify(evidence,null,2)+'\n');};
let pi=null,refund=null,oldSchedule=null;
const transfers=[];
(async()=>{
try{
 requireTrue(operatorTravel===1485&&referral===15&&operatorTravel+referral<=total,
   'Incorrect Operator or 15-cent referral economics');
 const balance=await stripe.balance.retrieve();
 requireTrue(balance.livemode===false,'Stripe account is not TEST mode');
 evidence.mode='TEST_ONLY';step('Authenticated actual Stripe TEST balance','PASS');
 const recipient=await stripe.accounts.retrieve(existingOperatorAccount);
 requireTrue(recipient?.id===existingOperatorAccount&&recipient.type==='express'&&
   recipient.capabilities?.transfers==='active'&&recipient.payouts_enabled===true&&
   recipient.details_submitted===true,'Previously verified TEST Express account not transfer-ready');
 oldSchedule=JSON.stringify(recipient.settings?.payouts?.schedule||null);
 evidence.provider.sameExistingTestRecipient=recipient.id;
 step('Reused the previously verified Operator TEST account','PASS');
 pi=await stripe.paymentIntents.create({
   amount:total,currency:'usd',payment_method_types:['card'],
   payment_method:'pm_card_visa',capture_method:'manual',confirm:true,
   transfer_group:travel,metadata:{ar_qa_only:'true',ar_qa_operator_travel:travel},
 },{idempotencyKey:'ar_qa_operator_charge_'+id});
 requireTrue(pi.livemode===false&&pi.status==='requires_capture'&&
   pi.amount_capturable===total,'TEST charge not authorized');
 evidence.provider.paymentIntent=pi.id;step('Actual $20 TEST Traveler authorization','PASS');
 const captured=await stripe.paymentIntents.capture(pi.id,{amount_to_capture:total},
   {idempotencyKey:'ar_qa_operator_capture_'+id});
 requireTrue(captured.livemode===false&&captured.status==='succeeded'&&
   captured.amount_received===total,'TEST charge not captured');
 const retr=await stripe.paymentIntents.retrieve(pi.id,{expand:['latest_charge']});
 const charge=retr.latest_charge;
 requireTrue(typeof charge==='object'&&charge?.id&&
  retr.metadata?.ar_qa_operator_travel===travel,'Travel payment identity not established');
 evidence.provider.testCharge=charge.id;
 step('Captured one actual TEST Travel funding charge','PASS');
 for(const spec of [
  {role:'operator_travel_fare',amount:operatorTravel},
  {role:'operator_referral_commission',amount:referral}
 ]){
  const body={amount:spec.amount,currency:'usd',destination:recipient.id,
   source_transaction:charge.id,transfer_group:travel,
   metadata:{ar_qa_only:'true',ar_qa_operator_travel:travel,ar_role:spec.role}};
  const key='ar_qa_operator_transfer_'+spec.role+'_'+id;
  const t=await stripe.transfers.create(body,{idempotencyKey:key});
  transfers.push(t.id);
  const again=await stripe.transfers.create(body,{idempotencyKey:key});
  const found=await stripe.transfers.retrieve(t.id);
  requireTrue(t.livemode===false&&again.id===t.id&&found.id===t.id&&
    found.destination===existingOperatorAccount&&found.amount===spec.amount&&
    found.source_transaction===charge.id&&
    found.metadata?.ar_role===spec.role&&found.transfer_group===travel,
    'Actual Stripe same-account transfer or idempotent replay failed: '+spec.role);
  evidence.provider[spec.role+'Transfer']=t.id;
  step('Actual Stripe TEST '+spec.role+' '+spec.amount+' cents to the SAME account, exact replay','PASS');
 }
 requireTrue(transfers.length===2&&transfers[0]!==transfers[1],
  'Travel and referral transfers must have distinct idempotency and ledger identities');
 const after=await stripe.accounts.retrieve(existingOperatorAccount);
 requireTrue(JSON.stringify(after.settings?.payouts?.schedule||null)===oldSchedule,
  'Existing Operator automatic payout schedule changed');
 evidence.provider.existingPayoutSchedule=after.settings?.payouts?.schedule||null;
 step('No second Connect account, fee or payout schedule change','PASS');
 for(const idOfTransfer of transfers){
  const t=await stripe.transfers.retrieve(idOfTransfer);
  const rev=await stripe.transfers.createReversal(idOfTransfer,{amount:t.amount},
    {idempotencyKey:'ar_qa_operator_reverse_'+idOfTransfer});
  const restored=await stripe.transfers.retrieve(idOfTransfer);
  requireTrue(rev.amount===t.amount&&restored.amount_reversed===t.amount,
    'Actual TEST reversal failed');
 }
 step('Reversed both TEST transfers, including the 15-cent commission','PASS');
 const refundBody={payment_intent:pi.id,amount:total,reason:'requested_by_customer',
  metadata:{ar_qa_only:'true',ar_qa_operator_travel:travel}};
 refund=await stripe.refunds.create(refundBody,
  {idempotencyKey:'ar_qa_operator_refund_'+id});
 const again=await stripe.refunds.create(refundBody,
  {idempotencyKey:'ar_qa_operator_refund_'+id});
 const confirmed=await stripe.refunds.retrieve(refund.id);
 requireTrue(refund.id===again.id&&confirmed.payment_intent===pi.id&&
  confirmed.amount===total,'Actual TEST refund or duplicate refund replay failed');
 evidence.provider.refund=confirmed.id;
 evidence.provider.refundStatus=confirmed.status;
 requireTrue(confirmed.status==='succeeded','Stripe TEST refund not yet succeeded');
 step('Refunded the TEST charge once; duplicate refund blocked','PASS');
 evidence.result='PASS';
 console.log('PASS real Stripe TEST existing Operator account: $14.85 Travel + $0.15 referral, both reversed, $20 funding refunded; no live bank payout');
}catch(e){
 evidence.result='FAIL';evidence.errorCode=String(e.code||e.type||'test_failure').slice(0,85);
 evidence.errorSummary=String(e.message||'unknown').slice(0,180);
 console.error('STOP TEST: '+evidence.errorCode+': '+evidence.errorSummary);
 process.exitCode=1;
}finally{
 for(const tId of transfers){
  try{
   const t=await stripe.transfers.retrieve(tId);
   if(Number(t.amount_reversed||0)<t.amount){
    await stripe.transfers.createReversal(tId,{amount:t.amount-Number(t.amount_reversed||0)},
      {idempotencyKey:'ar_qa_operator_cleanup_'+tId});
    step('Cleanup any outstanding TEST transfer','PASS');
   }
  }catch(e){step('Cleanup TEST transfer','FAIL');evidence.result='FAIL';process.exitCode=1;}
 }
 if(pi?.id){
  try{
   const current=await stripe.paymentIntents.retrieve(pi.id);
   if(current.status==='requires_capture')await stripe.paymentIntents.cancel(pi.id);
   if(current.status==='succeeded'&&!refund){
    refund=await stripe.refunds.create({payment_intent:pi.id,amount:current.amount_received,
       reason:'requested_by_customer'},
     {idempotencyKey:'ar_qa_operator_cleanup_refund_'+id});
    if(refund.status!=='succeeded'){evidence.result='FAIL';process.exitCode=1;}
   }
  }catch(e){step('Cleanup TEST payment','FAIL');evidence.result='FAIL';process.exitCode=1;}
 }
 save();console.log('Evidence: artifacts/operator-referral-stripe-test/provider-evidence.json (TEST ONLY)');
}
})().catch(e=>{evidence.result='FAIL';evidence.errorCode=String(e.code||'unexpected');save();process.exitCode=1;});