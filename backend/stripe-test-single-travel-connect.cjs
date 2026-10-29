'use strict';
// Actual Stripe SANDBOX provider checks. Never accepts live credentials, never
// writes production Firestore, and never claims live Operator/Recruiter readiness.
const fs=require('node:fs'), crypto=require('node:crypto'), Stripe=require('stripe');
const {safeSandboxSecretKey}=require('./stripe-test-key-policy');
const secret=safeSandboxSecretKey(process.env.STRIPE_TEST_SECRET_KEY);
if(!secret){console.error('STOP: complete sk_test_ key required; no provider changes');process.exit(2);}
const stripe=new Stripe(secret,{apiVersion:'2024-06-20',maxNetworkRetries:1,timeout:25000});
const id=crypto.randomUUID().replace(/-/g,'').slice(0,20);
const travel='AR-QA-TRAVEL-'+id;
const group='ar_qa_'+id;
const log={schema:1,kind:'test-provider-connect',travelId:travel,mode:'UNVERIFIED',sourceSha:process.env.GITHUB_SHA||null,
 note:'Synthetic single Travel identifier; no Firebase live Travel or real Operator, Recruiter or bank payout',steps:[],provider:{},gates:{},result:'FAIL'};
const note=(name,status,data={})=>{log.steps.push({name,status,...data});console.log(status+' '+name);};
const insist=(value,message)=>{if(!value)throw Error(message)};
const dump=()=>{fs.mkdirSync('artifacts/stripe-test-travel',{recursive:true});fs.writeFileSync('artifacts/stripe-test-travel/provider-evidence.json',JSON.stringify(log,null,2)+'\n')};
let intent,transfer,recipient,refund;
(async()=>{
  try{
    const balance=await stripe.balance.retrieve();
    insist(balance?.livemode===false,'Not authenticated to Stripe sandbox. NO payment writes');
    log.mode='TEST_ONLY';note('Stripe authenticated sandbox preflight','PASS');
    const capability=await stripe.accounts.retrieve();
    insist(capability?.id&&capability?.charges_enabled!==undefined,'Test platform identity unavailable');
    log.gates.connectPlatformIdVerified=true;
    note('Test platform identity','PASS');
    // A disposable, UNVERIFIED Express account used solely for a sandbox
    // transfer. Never count this as a verified Recruiter or real Operator.
    recipient=await stripe.accounts.create({type:'express',country:'US',
      capabilities:{transfers:{requested:true}},
      metadata:{ar_qa_only:'true',ar_qa_travel:travel}});
    insist(recipient?.livemode===false&&recipient.id?.startsWith('acct_'),'Test recipient did not verify sandbox identity');
    log.provider.sandboxRecipient=recipient.id;
    note('Disposable unverified TEST Connect recipient','PASS');
    // Create a real provider TEST authorization under one immutable synthetic
    // Travel identity. This is not an actual Firebase booking.
    intent=await stripe.paymentIntents.create({
      amount:2000,currency:'usd',payment_method_types:['card'],
      payment_method:'pm_card_visa',capture_method:'manual',confirm:true,
      transfer_group:group,metadata:{ar_qa_travel:travel,ar_qa_only:'true'}
    },{idempotencyKey:'ar_qa_authorize_'+id});
    insist(intent.livemode===false&&intent.status==='requires_capture'&&intent.amount_capturable===2000,
      'Real Stripe TEST authorization not confirmed');
    log.provider.paymentIntent=intent.id;
    note('Same-Travel TEST $20 authorization','PASS');
    const captured=await stripe.paymentIntents.capture(intent.id,{amount_to_capture:2000},
      {idempotencyKey:'ar_qa_capture_'+id});
    insist(captured.livemode===false&&captured.status==='succeeded'&&captured.amount_received===2000,
      'TEST capture not settled');
    const actual=await stripe.paymentIntents.retrieve(intent.id,{expand:['latest_charge']});
    const charge=actual.latest_charge;
    insist(typeof charge==='object'&&charge?.id&&
      charge.metadata?.ar_qa_travel===travel&&actual.metadata?.ar_qa_travel===travel,
      'Stripe charge metadata not tied to the same synthetic Travel');
    log.provider.charge=charge.id; note('Same-Travel TEST full capture','PASS');
    // source_transaction binds the transfer to this EXACT captured charge;
    // transfer_group metadata alone would not prove a financial relationship.
    transfer=await stripe.transfers.create({
      amount:1500,currency:'usd',destination:recipient.id,
      source_transaction:charge.id,transfer_group:group,
      metadata:{ar_qa_travel:travel,ar_qa_only:'true'}
    },{idempotencyKey:'ar_qa_transfer_'+id});
    insist(transfer.livemode===false&&transfer.source_transaction===charge.id&&
      transfer.destination===recipient.id&&transfer.amount===1500&&
      transfer.transfer_group===group&&transfer.metadata?.ar_qa_travel===travel,
      'TEST transfer not linked to the exact captured charge');
    const fromProvider=await stripe.transfers.retrieve(transfer.id);
    insist(fromProvider.id===transfer.id&&fromProvider.source_transaction===charge.id,
      'TEST Connect transfer retrieval did not reconcile');
    log.provider.transfer=transfer.id;note('TEST Connect transfer source-transaction reconciliation','PASS');
    const reversal=await stripe.transfers.createReversal(transfer.id,{amount:1500},
      {idempotencyKey:'ar_qa_transfer_reversal_'+id});
    insist(reversal.amount===1500&&reversal.transfer===transfer.id,
      'Transfer reversal not accepted by Stripe');
    const reversed=await stripe.transfers.retrieve(transfer.id);
    insist(reversed.amount_reversed===1500,'TEST transfer reversal not reconciled');
    log.provider.transferReversal=reversal.id;
    note('TEST Connect transfer reversal','PASS');
    const options={payment_intent:intent.id,amount:2000,reason:'requested_by_customer',
      metadata:{ar_qa_travel:travel,ar_qa_only:'true'}};
    refund=await stripe.refunds.create(options,{idempotencyKey:'ar_qa_refund_'+id});
    const repeat=await stripe.refunds.create(options,{idempotencyKey:'ar_qa_refund_'+id});
    const fetched=await stripe.refunds.retrieve(refund.id);
    insist(refund.id===repeat.id&&fetched.payment_intent===intent.id&&fetched.amount===2000,
      'Stripe TEST refund or retry idempotency failed');
    log.provider.refund=fetched.id; log.provider.refundStatus=fetched.status;
    note('Same-Travel TEST refund and provider idempotency', 'PASS',{providerStatus:fetched.status});
    log.result=fetched.status==='succeeded'?'PASS':'REFUND_PENDING';
    if(log.result==='PASS')console.log('PASS: test-only same synthetic Travel authorized, captured, transferred, reversed, refunded and reconciled');
    else {console.error('REFUND_PENDING_NOT_SETTLED: provider reports',fetched.status);process.exitCode=3;}
  }catch(e){
    note('Provider acceptance','FAIL',{errorCode:String(e.code||e.type||'provider_failure').slice(0,90),
       summary:String(e.message||'').slice(0,160)});
    process.exitCode=1;
  }finally{
    if(intent?.id){
      try{
        const state=await stripe.paymentIntents.retrieve(intent.id);
        if(state.status==='requires_capture')await stripe.paymentIntents.cancel(intent.id);
      }catch{}
    }
    // Never hide a failure to reverse a sandbox transfer as a successful
    // cleanup. Objects are explicitly retained for authenticated inspection.
    dump();
    console.log('Provider evidence preserved; TEST-only and no real payout.');
  }
})().catch(e=>{console.error('TEST provider runner stopped',e.code||'unknown');process.exitCode=1;dump()});
