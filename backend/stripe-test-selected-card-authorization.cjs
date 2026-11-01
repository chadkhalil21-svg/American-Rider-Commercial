'use strict';
// Provider acceptance of exact selected saved-card authorization, Stripe TEST ONLY.
// Creates NO bank payouts, transfers, real customers, captured charges or live prices.
const Stripe=require('stripe');
const fs=require('node:fs');
const crypto=require('node:crypto');
const {safeSandboxSecretKey}=require('./stripe-test-key-policy');
const {verifySelectedCard,exactChargedCardMatch}=require('./selected-card-authority');
const {minimumPlatformFeeCents}=require('./economics');
const key=safeSandboxSecretKey(process.env.STRIPE_TEST_SECRET_KEY);
if(!key){console.error('STOP: Stripe sk_test_ required');process.exit(2);}
const stripe=new Stripe(key,{apiVersion:'2024-06-20',maxNetworkRetries:1,timeout:25000});
const nonce=crypto.randomBytes(8).toString('hex');
const out={scope:'ACTUAL_STRIPE_TEST_SAVED_CARD_AUTHORIZATION_ONLY',mode:'test',
 createdAt:new Date().toISOString(),commit:process.env.GITHUB_SHA||null,
 livemode:false,bankPayout:false,chargeCaptured:false,details:[],result:'FAIL'};
const customers=[],intents=[];
function requireTrue(x,label){if(!x)throw Error(label);console.log('PASS '+label);}
function save(){fs.mkdirSync('artifacts/card-first-stripe-test',{recursive:true});
 fs.writeFileSync('artifacts/card-first-stripe-test/evidence.json',JSON.stringify(out,null,2)+'\n');}
(async()=>{
 try{
  const balance=await stripe.balance.retrieve();
  requireTrue(balance.livemode===false,'authenticated Stripe TEST account, never live');
  const c=await stripe.customers.create({email:'ar-test-'+nonce+'@example.invalid',
   metadata:{ar_test_only:'issuer_authorization'}},
   {idempotencyKey:'ar_issuer_test_customer_'+nonce});
  customers.push(c.id);
  const stranger=await stripe.customers.create({
   metadata:{ar_test_only:'stranger'}},{idempotencyKey:'ar_issuer_test_stranger_'+nonce});
  customers.push(stranger.id);
  const seen=[];
  for(const [method,country] of [['pm_card_visa','US'],['pm_card_gb','GB']]){
   const pm=await stripe.paymentMethods.attach(method,{customer:c.id});
   const selected=await verifySelectedCard({stripe,customerId:c.id,paymentMethodId:pm.id});
   requireTrue(selected.ok&&selected.country===country,'Stripe verifies selected '+country+' issuing country');
   requireTrue((await verifySelectedCard({stripe,customerId:stranger.id,paymentMethodId:pm.id})).ok===false,
     'cross-Traveler payment method rejected before charge');
   const fare=5000;
   const fee=minimumPlatformFeeCents({travelCostCents:fare,cardCountry:country});
   seen.push(fee);
   const amount=fare+fee;
   const created=await stripe.paymentIntents.create({
     amount,currency:'usd',customer:c.id,payment_method:pm.id,
     capture_method:'manual',payment_method_types:['card'],confirm:true,
     metadata:{ar_test_only:'saved_card_before_quote',
      selectedPaymentMethodId:pm.id,selectedCardIssuerCountry:country,quoteCents:String(amount)},
   },{idempotencyKey:'ar_test_card_auth_'+country+'_'+nonce});
   intents.push(created.id);
   const intent=await stripe.paymentIntents.retrieve(created.id,{expand:['latest_charge']});
   requireTrue(intent.livemode===false&&intent.status==='requires_capture'&&
     intent.amount===amount&&intent.amount_capturable===amount,
     'actual Stripe TEST '+country+' manual authorization, exact accepted total');
   requireTrue(exactChargedCardMatch({intent,paymentMethodId:pm.id,country}),
     'actual Stripe charge is the SAME selected '+country+' card and issuer');
   requireTrue(!exactChargedCardMatch({intent,paymentMethodId:pm.id,country:country==='US'?'GB':'US'}),
     'foreign/domestic issuer cannot be substituted after accepted quote');
   const canceled=await stripe.paymentIntents.cancel(created.id);
   requireTrue(canceled.status==='canceled',
     'authorization canceled without capture or bank movement');
   out.details.push({country,quoteCents:amount,cardOwned:true,authorized:true,
     canceled:true,issuerBound:true});
  }
  requireTrue(seen[0]<seen[1],'selected US card receives lower modeled fee than foreign issuer');
  out.result='PASS';
  console.log('PASS real Stripe TEST two issuers, same-card manual authorization and cancellation; no live money');
 }catch(e){
  out.errorCode=String(e.code||e.type||'test_failure').slice(0,90);
  out.error=String(e.message||'unknown').slice(0,190);
  process.exitCode=1;
  console.error('FAIL Stripe TEST card-first: '+out.errorCode+': '+out.error);
 }finally{
  for(const id of intents){
   try{const pi=await stripe.paymentIntents.retrieve(id);
    if(pi.status==='requires_capture'||pi.status==='requires_action'||pi.status==='requires_confirmation')
      await stripe.paymentIntents.cancel(id);
    if(pi.status==='succeeded'){out.result='FAIL';process.exitCode=1;
      console.error('STOP: unexpected captured TEST payment requires reconciliation');}
   }catch(e){out.result='FAIL';process.exitCode=1;out.cleanupError='test_intent_cleanup_unverified';}
  }
  for(const id of customers){try{const gone=await stripe.customers.del(id);
   if(gone.deleted!==true)throw Error('not deleted');}
   catch(e){out.result='FAIL';process.exitCode=1;out.cleanupError='test_customer_cleanup_unverified';}}
  save();
 }
})().catch(e=>{out.result='FAIL';out.error=String(e.message||e).slice(0,190);process.exitCode=1;save();});
