'use strict';
// Founder-approved, ONE-TIME TEST-ONLY Recruiter commission provider verification.
// Test Express recipient is a stand-in only; this is NOT a real approved recruiter,
// commission-eligible Travel set, production Firestore wallet, or bank deposit.
// Requires separate real Stripe test payment / Connect transfer acceptance.
const Stripe=require('stripe');
const fs=require('node:fs');
const crypto=require('node:crypto');
const {safeSandboxSecretKey}=require('./stripe-test-key-policy');
const key=safeSandboxSecretKey(process.env.STRIPE_TEST_SECRET_KEY);
if(!key){console.error('STOP: protected sk_test_ key required');process.exit(2);}
const stripe=new Stripe(key,{apiVersion:'2024-06-20',maxNetworkRetries:1,timeout:25000});
const recipient='acct_1UVxihAmgNHFzmi5';
const id=crypto.randomBytes(10).toString('hex');
const batch='ar_rec_qa_'+id;
const group='ar_rec_'+batch;
const gross=90*(15+15),fee=200,net=gross-fee;
const payAmount=3000;
const log={schema:1,kind:'test-recruiter-commission-provider',mode:'NOT_VERIFIED',
 batchId:batch,sourceSha:process.env.GITHUB_SHA||null,
 recipientRole:'TEST_EXPRESS_STAND_IN_NOT_ACTUAL_RECRUITER',
 identities:'1 synthetic Recruiter/Operator/Traveler verified separately',
 qualifyingTravels:'90 IN_MEMORY_ONLY',commissionEvents:180,
 grossCommissionCents:gross,simulatedMonthlyFeeCents:fee,netTransferCents:net,
 paymentFundingCents:payAmount,productionFlags:'UNCHANGED',liveMoney:false,
 bankPayoutCertified:false,steps:[],provider:{},result:'FAIL'};
const note=(name,status,details={})=>{log.steps.push({name,status,...details});console.log(status+' '+name)};
const requireTrue=(x,msg)=>{if(!x)throw Error(msg)};
const save=()=>{fs.mkdirSync('artifacts/stripe-test-recruiter',{recursive:true});
 fs.writeFileSync('artifacts/stripe-test-recruiter/provider-evidence.json',JSON.stringify(log,null,2)+'\n')};
let pi,transfer,refund;
(async()=>{
try{
 requireTrue(gross===2700&&fee===200&&net===2500,'Commission arithmetic changed');
 const bal=await stripe.balance.retrieve();
 requireTrue(bal?.livemode===false,'Not TEST mode; no money writes');
 log.mode='TEST_ONLY';note('Independent Stripe TEST balance identity','PASS');
 const acct=await stripe.accounts.retrieve(recipient);
 requireTrue(acct?.id===recipient&&acct?.type==='express'&&
   acct?.capabilities?.transfers==='active','Test recipient cannot receive transfers');
 requireTrue(acct?.payouts_enabled===true,'Test recipient payouts are not yet enabled');
 log.provider.testRecipientId=acct.id;note('TEST Connect recipient active and payout-enabled','PASS');
 // Only a disposable synthetic $30 test payment funds this provider acceptance.
 // The 90 genuine commission-eligibility rules are independently tested with
 // fake in-memory user/Travel records and NEVER created on the live backend.
 pi=await stripe.paymentIntents.create({
  amount:payAmount,currency:'usd',payment_method_types:['card'],
  payment_method:'pm_card_visa',capture_method:'manual',confirm:true,
  transfer_group:group,metadata:{ar_qa_recruiter_batch:batch,
   ar_qa_only:'true',ar_qa_funding:'90 synthetic qualifying Travel fixture'},
 },{idempotencyKey:'ar_rec_qa_authorize_'+id});
 requireTrue(pi.livemode===false&&pi.status==='requires_capture'&&
   pi.amount_capturable===payAmount,'TEST funding authorization not confirmed');
 log.provider.testPaymentIntent=pi.id;note('Disposable $30 TEST card authorization','PASS');
 const captured=await stripe.paymentIntents.capture(pi.id,{amount_to_capture:payAmount},
  {idempotencyKey:'ar_rec_qa_capture_'+id});
 requireTrue(captured.livemode===false&&captured.status==='succeeded'&&
   captured.amount_received===payAmount,'TEST capture not confirmed');
 const check=await stripe.paymentIntents.retrieve(pi.id,{expand:['latest_charge']});
 const charge=check.latest_charge;
 requireTrue(typeof charge==='object'&&charge?.id&&
  check.metadata?.ar_qa_recruiter_batch===batch,'Captured charge not tied to TEST batch');
 log.provider.testCharge=charge.id;note('Same TEST funding charge fully captured','PASS');
 // source_transaction makes the provider test self-funding even if balance
 // settlement is pending. Production Recruiter scheduler uses available
 // platform balance, *not* a special $30 synthetic payment; do not equate them.
 transfer=await stripe.transfers.create({
  amount:net,currency:'usd',destination:recipient,source_transaction:charge.id,
  transfer_group:group,metadata:{ar_recruiter_batch:batch,
   ar_relationship:'recruiter',ar_qa_only:'true'},
 },{idempotencyKey:'ar_rec_qa_transfer_'+id});
 requireTrue(transfer.livemode===false&&transfer.destination===recipient&&
  transfer.amount===net&&transfer.source_transaction===charge.id&&
  transfer.transfer_group===group&&transfer.metadata?.ar_recruiter_batch===batch,
  'TEST Recruiter transfer not source-matched');
 const found=await stripe.transfers.retrieve(transfer.id);
 requireTrue(found.id===transfer.id&&found.amount===net&&
  found.source_transaction===charge.id,'Provider transfer reconciliation failed');
 log.provider.testCommissionTransfer=transfer.id;
 note('Actual Stripe TEST $25 Recruiter-labelled Connect transfer','PASS');
 // This represents a $27 earned balance less a retained $2 administration fee;
 // do not assert Stripe itself charged this fee or that a bank received $25.
 requireTrue(payAmount>=net+fee,'Funding / fee budget fails');
 note('Commission $27 gross / $2 modeled fee / $25 transferred','PASS');
 const reversed=await stripe.transfers.createReversal(transfer.id,{amount:net},
  {idempotencyKey:'ar_rec_qa_reverse_'+id});
 const post=await stripe.transfers.retrieve(transfer.id);
 requireTrue(reversed.transfer===transfer.id&&reversed.amount===net&&
  post.amount_reversed===net,'TEST commission transfer not fully reversed');
 log.provider.testTransferReversal=reversed.id;note('TEST Recruiter transfer reversal','PASS');
 const refundBody={payment_intent:pi.id,amount:payAmount,reason:'requested_by_customer',
  metadata:{ar_qa_recruiter_batch:batch,ar_qa_only:'true'}};
 refund=await stripe.refunds.create(refundBody,{idempotencyKey:'ar_rec_qa_refund_'+id});
 const retry=await stripe.refunds.create(refundBody,{idempotencyKey:'ar_rec_qa_refund_'+id});
 const again=await stripe.refunds.retrieve(refund.id);
 requireTrue(again.id===retry.id&&again.payment_intent===pi.id&&
  again.amount===payAmount,'TEST refund idempotency or provider retrieval failed');
 log.provider.testRefund=again.id;
 log.provider.refundStatus=again.status;
 note('TEST funding refund and duplicate replay',again.status==='succeeded'?'PASS':'PENDING');
 log.result=again.status==='succeeded'?'PASS':'REFUND_PENDING';
 if(log.result!=='PASS')process.exitCode=3;
 else console.log('PASS TEST Recruiter: active recipient, $27 gross/$2 modeled fee, $25 actual Connect transfer, full reversal/refund, provider idempotency. NOT LIVE RECRUITER BANK PAYOUT.');
}catch(e){
 note('Stripe TEST Recruiter provider acceptance','FAIL',{code:String(e.code||e.type||'error').slice(0,90),
  reason:String(e.message||'unknown').slice(0,180)});
 process.exitCode=1;
}finally{
 if(transfer?.id){
  try{
   const t=await stripe.transfers.retrieve(transfer.id);
   if(Number(t.amount_reversed||0)<t.amount){
    await stripe.transfers.createReversal(t.id,
      {amount:t.amount-Number(t.amount_reversed||0)},
      {idempotencyKey:'ar_rec_qa_cleanup_reverse_'+id});
    note('Cleanup outstanding TEST transfer','PASS');
   }
  }catch(e){note('Cleanup outstanding TEST transfer','FAIL',{code:String(e.code||'unknown')});process.exitCode=1;}
 }
 if(pi?.id){
  try{
   const state=await stripe.paymentIntents.retrieve(pi.id);
   if(state.status==='requires_capture')await stripe.paymentIntents.cancel(pi.id);
   if(state.status==='succeeded'&&!refund){
    refund=await stripe.refunds.create({payment_intent:pi.id,
       amount:state.amount_received,reason:'requested_by_customer'},
       {idempotencyKey:'ar_rec_qa_cleanup_refund_'+id});
    note('Cleanup captured TEST funding',refund.status==='succeeded'?'PASS':'PENDING');
   }
  }catch(e){note('Cleanup captured TEST funding','FAIL',{code:String(e.code||'unknown')});process.exitCode=1;}
 }
 save();
 console.log('EVIDENCE: artifacts/stripe-test-recruiter/provider-evidence.json; TEST ONLY.');
}
})().catch(e=>{log.result='FAIL';console.error('TEST Recruiter stop:',e.code||'unknown');process.exitCode=1;save()});
