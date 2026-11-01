'use strict';
const assert=require('node:assert/strict');
const {verifySelectedCard,selectedCardMatch,exactChargedCardMatch}=
 require('./selected-card-authority');
const customerId='cus_TravelCustomer123456';
const us={id:'pm_SavedUSA123456',customer:customerId,type:'card',card:{country:'US'}};
const foreign={id:'pm_SavedGBR123456',customer:customerId,type:'card',card:{country:'GB'}};
(async()=>{
 let reads=0;
 const stripe={paymentMethods:{retrieve:async id=>{reads++;
  if(id===us.id)return us;if(id===foreign.id)return foreign;
  throw Error('unknown');}}};
 assert.deepEqual(await verifySelectedCard({stripe,customerId,paymentMethodId:us.id}),
  {ok:true,paymentMethodId:us.id,country:'US',domestic:true});
 assert.deepEqual(await verifySelectedCard({stripe,customerId,paymentMethodId:foreign.id}),
  {ok:true,paymentMethodId:foreign.id,country:'GB',domestic:false});
 assert.equal(reads,2);
 assert.equal((await verifySelectedCard({stripe,customerId:'cus_OtherCustomer123456',paymentMethodId:us.id})).ok,false);
 assert.equal((await verifySelectedCard({stripe,customerId,paymentMethodId:'pm_otherUnknown123'})).ok,false);
 assert.equal((await verifySelectedCard({stripe,customerId,paymentMethodId:'badcard'})).ok,false);
 assert.equal(reads,4,'invalid IDs never reach provider');
 assert.equal(selectedCardMatch({paymentMethod:{...us,type:'bank'},customerId,paymentMethodId:us.id}).ok,false);
 assert.equal(selectedCardMatch({paymentMethod:{...us,card:{}},customerId,paymentMethodId:us.id}).ok,false);
 assert.equal(selectedCardMatch({paymentMethod:{...us,customer:'cus_OtherCustomer123456'},customerId,paymentMethodId:us.id}).ok,false);
 const intent={payment_method:us.id,status:'requires_capture',latest_charge:{
   payment_method_details:{type:'card',card:{country:'US'}}}};
 assert(exactChargedCardMatch({intent,paymentMethodId:us.id,country:'US'}));
 assert(!exactChargedCardMatch({intent,paymentMethodId:us.id,country:'GB'}),
  'Issuer must not change under an accepted Traveler Total');
 assert(!exactChargedCardMatch({intent:{...intent,payment_method:foreign.id},paymentMethodId:us.id,country:'US'}),
  'PaymentSheet switch must NOT silently use a cheaper quote');
 assert(!exactChargedCardMatch({intent:{...intent,latest_charge:null},paymentMethodId:us.id,country:'US'}),
  'No charge details is not issuer proof');
 assert(!exactChargedCardMatch({intent:{...intent,status:'requires_payment_method'},paymentMethodId:us.id,country:'US'}));
 console.log('PASS: Stripe-owned US/foreign card issuer before quoting; post-authorization charge binding rejects switched card, unknown issuer and fraud. Read-only, no native build or live changes.');
})().catch(e=>{console.error(e);process.exitCode=1;});
