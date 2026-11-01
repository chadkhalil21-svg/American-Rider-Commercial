'use strict';
// Stripe TEST provider acceptance, never live money or bank records.
// Verifies the exact card selected belongs to the Traveler Stripe customer,
// including a US issuer and a foreign issuer, without creating a payment.
const Stripe=require('stripe');
const {safeSandboxSecretKey}=require('./stripe-test-key-policy');
const {verifySelectedCard,selectedCardMatch}=require('./selected-card-authority');
const key=safeSandboxSecretKey(process.env.STRIPE_TEST_SECRET_KEY);
if(!key){console.error('STOP: real Stripe sk_test_ required');process.exit(2);}
const stripe=new Stripe(key,{apiVersion:'2024-06-20',timeout:25000,maxNetworkRetries:1});
const created=[];
const check=(ok,message)=>{if(!ok)throw Error(message);console.log('PASS '+message);};
(async()=>{
 try{
  const balance=await stripe.balance.retrieve();
  check(balance.livemode===false,'authenticated actual Stripe TEST');
  const traveler=await stripe.customers.create({
   email:'american-rider-issuer-test@example.invalid',
   metadata:{ar_test_only:'selected_issuer'},
  });
  created.push(traveler.id);
  const other=await stripe.customers.create({metadata:{ar_test_only:'different_traveler'}});
  created.push(other.id);
  for(const [method,country] of [['pm_card_visa','US'],['pm_card_gb','GB']]){
   const attached=await stripe.paymentMethods.attach(method,{customer:traveler.id});
   check(attached.customer===traveler.id,'attached '+method+' to correct TEST customer');
   const proof=await verifySelectedCard({stripe,customerId:traveler.id,paymentMethodId:attached.id});
   check(proof.ok&&proof.country===country&&proof.domestic===(country==='US'),
    'actual Stripe confirms '+country+' card issuer and customer');
   const forged=await verifySelectedCard({stripe,customerId:other.id,paymentMethodId:attached.id});
   check(forged.ok===false,'cross-customer card ownership blocked: '+country);
   const countrySpoof=selectedCardMatch({paymentMethod:attached,customerId:traveler.id,
    paymentMethodId:attached.id,cardCountry:'US'});
   check(countrySpoof.country===country,'client-supplied issuer cannot replace Stripe country');
  }
  console.log('PASS authentic Stripe TEST US/GB card issuer ownership and cross-account restrictions; no charge or payout');
 }catch(e){console.error('FAIL stripe selected-card issuer TEST: '+String(e.code||'provider')+
   ' '+String(e.message||'unknown').slice(0,180));process.exitCode=1;}
 finally{
  for(const id of created){
   try{const x=await stripe.customers.del(id);if(x.deleted!==true)throw Error('not deleted');
    console.log('PASS deleted disposable Stripe TEST Customer');}
   catch(e){process.exitCode=1;console.error('FAIL TEST Customer cleanup '+String(e.code||e.message||'').slice(0,140));}
  }
 }
})().catch(e=>{console.error('FAIL unexpected Stripe TEST '+String(e.message||e).slice(0,160));process.exitCode=1;});
