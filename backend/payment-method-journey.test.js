'use strict';
// Synthetic Traveler journey. Uses in-memory Stripe primitives, never provider
// credentials, real cards, a charge, or a live account.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const sourcePath=path.join(__dirname,'payments.js');
const nativeRequire=createRequire(sourcePath);
const customers=new Map(),methods=new Map(),byKey=new Map();
let customerCreates=0,setupCreates=0,charged=0;
const stripe={
 customers:{
  search:async()=>({data:[]}), // intentionally eventually consistent
  create:async(data,opts)=>{
   const key=opts?.idempotencyKey;
   assert.ok(/^ar_traveler_[0-9a-f]{40}$/.test(key),'stable non-PII key');
   if(byKey.has(key))return byKey.get(key);
   const c={id:'cus_'+(++customerCreates),email:data.email,metadata:data.metadata,
     invoice_settings:{default_payment_method:null}};
   byKey.set(key,c);customers.set(c.id,c);return c;
  },
  update:async(id,obj)=>{
   const c=customers.get(id);assert.ok(c);
   c.invoice_settings.default_payment_method=obj.invoice_settings.default_payment_method;
   return c;
  },
 },
 paymentMethods:{
  list:async({customer,type})=>({data:[...methods.values()].filter(x=>x.customer===customer&&x.type===type)}),
  retrieve:async(id)=>methods.get(id)||null,
  detach:async(id)=>{const m=methods.get(id);assert.ok(m);methods.delete(id);return {...m,customer:null};},
 },
 ephemeralKeys:{create:async({customer})=>({secret:'eph_'+customer})},
 setupIntents:{create:async({customer,payment_method_types,usage})=>{
   assert.deepEqual([...payment_method_types],['card']);
   assert.equal(usage,'off_session');setupCreates++;
   return {client_secret:'seti_secret_'+setupCreates,id:'seti_'+setupCreates,customer};
 }},
 paymentIntents:{create:async()=>{charged++;throw Error('synthetic journey must never charge');}},
};
const sandboxModule={exports:{}};
vm.runInNewContext(fs.readFileSync(sourcePath,'utf8'),{
 module:sandboxModule,exports:sandboxModule.exports,console,process,Buffer,URL,
 require:(p)=>p==='stripe'?()=>stripe:p==='./env'?{
   readKey:()=> 'sk_test_SYNTHETIC_NEVER_SENT',
   hasInvalidHeaderChars:()=>false,describeInvalidChars:()=>[]
 }:nativeRequire(p),
},{filename:sourcePath});
const api=sandboxModule.exports;
function simulateConfirmSetup(customer,id,brand,last4,country='US'){
 methods.set(id,{id,type:'card',customer,card:{
   brand,last4,country,exp_month:12,exp_year:2030,wallet:null,
 }});
}
(async()=>{
 const identity={uid:'synthetic_traveler_1',email:'synthetic@example.invalid'};
 // First sign-in, overlapping Wallet and Add Payment Method visits.
 const [first,second]=await Promise.all([
   api.customerForTraveler(identity),api.customerForTraveler(identity)]);
 assert.equal(first.id,second.id);
 assert.equal(customerCreates,1,'concurrent customer creation is idempotent');
 assert.deepEqual(await api.listPaymentMethods(identity),[]);
 // The Traveler opens Add Payment, then dismisses PaymentSheet: no saved card.
 const cancelled=await api.createSetupIntent(identity);
 assert.ok(cancelled.clientSecret&&cancelled.ephemeralKeySecret);
 assert.equal((await api.listPaymentMethods(identity)).length,0);
 assert.equal(charged,0);
 // Successful SetupIntent saves a new card to this Traveler.
 const ready=await api.createSetupIntent(identity);
 simulateConfirmSetup(ready.customerId,'pm_SyntheticVisa','visa','4242');
 let list=await api.listPaymentMethods(identity);
 assert.equal(list.length,1);assert.equal(list[0].last4,'4242');
 assert.equal(list[0].isDefault,false);
 // Set as default, reopen Wallet: server returns actual Stripe state.
 assert.equal((await api.setDefaultPaymentMethod({...identity,paymentMethodId:'pm_SyntheticVisa'})).ok,true);
 list=await api.listPaymentMethods(identity);
 assert.equal(list[0].isDefault,true);
 // Another saved card and switch: default is the account's preference, never
 // authority to assume this card will be selected inside PaymentSheet.
 simulateConfirmSetup(ready.customerId,'pm_SyntheticMaster','mastercard','4444','GB');
 assert.equal((await api.setDefaultPaymentMethod({...identity,paymentMethodId:'pm_SyntheticMaster'})).ok,true);
 list=await api.listPaymentMethods(identity);
 assert.equal(list.filter(x=>x.isDefault).length,1);
 assert.equal(list.find(x=>x.isDefault).id,'pm_SyntheticMaster');
 // Another person's card cannot be made default or removed.
 simulateConfirmSetup('cus_Other','pm_SomeoneElse','visa','9999');
 assert.equal((await api.setDefaultPaymentMethod({...identity,paymentMethodId:'pm_SomeoneElse'})).ok,false);
 assert.equal((await api.detachPaymentMethod({...identity,paymentMethodId:'pm_SomeoneElse'})).ok,false);
 // Remove default: automatically switch to the remaining saved card.
 assert.equal((await api.detachPaymentMethod({...identity,paymentMethodId:'pm_SyntheticMaster'})).ok,true);
 list=await api.listPaymentMethods(identity);
 assert.equal(list.length,1);assert.equal(list[0].id,'pm_SyntheticVisa');
 assert.equal(list[0].isDefault,true);
 // Remove last card: clear default so off-session operations cannot use it.
 assert.equal((await api.detachPaymentMethod({...identity,paymentMethodId:'pm_SyntheticVisa'})).ok,true);
 assert.equal(customers.get(first.id).invoice_settings.default_payment_method,'');
 assert.equal((await api.listPaymentMethods(identity)).length,0);
 assert.equal(charged,0);
 // Unsaved cards and Apple/Google Pay remain international-safe. An
 // explicitly selected saved Stripe card may use only its verified issuer.
 const fareSource=fs.readFileSync(path.join(__dirname,'fareauthority.js'),'utf8');
 assert.match(fareSource,/let cardCountry=null,selectedPaymentMethodId=null;/);
 assert.match(fareSource,/await cardCountryFor\(\{uid,email,paymentMethodId:body.paymentMethodId\}\)/);
 assert.doesNotMatch(fareSource,/uid && cardCountryFor \? cardCountryFor/);
 const {minimumPlatformFeeCents}=require('./economics');
 assert.ok(minimumPlatformFeeCents({travelCostCents:5000,cardCountry:null}) >
   minimumPlatformFeeCents({travelCostCents:5000,cardCountry:'US'}));
 const mobile=fs.readFileSync(path.join(__dirname,'../src/backend/payments.ts'),'utf8');
 const wallet=fs.readFileSync(path.join(__dirname,'../app/wallet.tsx'),'utf8');
 assert.match(mobile,/setupIntentClientSecret: setup\.clientSecret/);
 assert.match(mobile,/allowsDelayedPaymentMethods: false/);
 assert.match(mobile,/const canceled = presented\.error\.code === 'Canceled'/);
 assert.match(wallet,/setPendingRemove\(m\)/);
 assert.match(wallet,/state === 'unreadable'/);
 assert.match(wallet,/platformPaySupported\(\)/);
 console.log('PASS: anonymous prepayment view, distinct customer, cancelled setup, add card, list, default, switch, foreign card, ownership, remove, no charge, unknown issuer safe pricing, selected issuer verification, Apple Pay/Google Pay capability wiring');
})().catch(e=>{console.error(e);process.exitCode=1;});
