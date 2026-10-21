'use strict';
// REAL handleEvent logic against offline Firestore + ticket fakes.
// No Stripe request, funds, real passenger, live email, or database mutation.
const assert = require('node:assert/strict');
const Module = require('node:module');
const load = Module._load;
let outage=false,dbReads=0;
const rides=new Map(),cases=new Map(),calls=[];
const db={
  collection(name){
    assert.equal(name,'rides');
    return {doc(id){return {id,async get(){
      dbReads++;
      return {exists:rides.has(id),data:()=>({...rides.get(id)})};
    }};}};
  },
  async runTransaction(fn){return fn({
    get:ref=>ref.get(),
    update(ref,fields){assert.ok(rides.has(ref.id));rides.set(ref.id,{...rides.get(ref.id),...fields})},
  });},
};
const mocks={
  './firebase-admin':{adminDb:()=>db,adminStatus:()=>({ok:true})},
  './tickets':{async fileTicket(args){
    if(outage)throw Error('synthetic outbound delivery unavailable');
    calls.push(args);
    if(!cases.has(args.idempotencyKey)){
      cases.set(args.idempotencyKey,{...args,caseNo:'AR-PAYMENT-'+(cases.size+1)});
    }
    return {ok:true,stored:true,emailed:true,caseNo:cases.get(args.idempotencyKey).caseNo};
  }},
  './env':{readKey:()=>''},
  './email':{money:n=>'$'+(Number(n||0)/100).toFixed(2)},
  './operatorfees':{recordPayoutActivity:async()=>{throw Error('unexpected fee mutation')}},
  './disputeevidence':{saveDisputeEvidence:async()=>{throw Error('unexpected dispute mutation')}},
};
Module._load=function(req,parent,isMain){
  if(Object.prototype.hasOwnProperty.call(mocks,req))return mocks[req];
  return load.apply(this,arguments);
};
let service;try{service=require('./webhook')}finally{Module._load=load}
const event=({id='pi_fixture',eventId='evt_a',rideId,uid='patron',amount=1900,
               product='American Rider travel',currency='usd'}={})=>({
  id:eventId,type:'payment_intent.succeeded',
  data:{object:{id,amount_received:amount,currency,
    metadata:{product,uid,...(rideId===undefined?{}:{rideId})}}},
});
async function run(){
 for(let pass=0;pass<2;pass++){
  outage=false;dbReads=0;cases.clear();calls.length=0;rides.clear();
  rides.set('r1',{travelerUid:'patron',costCents:1900,status:'accepted',
    paymentIntentId:null,tripNo:'AR-TEST-1'});
  rides.set('r_cancel',{travelerUid:'patron',costCents:1900,status:'cancelled',
    paymentIntentId:null,tripNo:'AR-CANCELLED'});
  const op=await service.handleEvent(event({id:'pi_operator',product:'American Rider operator account cost'}));
  assert.equal(op.ok,true);assert.equal(cases.size,0);
  assert.equal(dbReads,0,'known non-Travel charge should not read the ride database');

  const matched=await service.handleEvent(event({id:'pi_matched',rideId:'r1'}));
  assert.equal(matched.action,'booking reconciled');assert.equal(cases.size,0);
  assert.equal(rides.get('r1').paymentIntentId,'pi_matched');

  const cancelled=await service.handleEvent(event({id:'pi_cancelled',rideId:'r_cancel'}));
  assert.equal(cancelled.ok,true);assert.equal(rides.get('r_cancel').refundPending,true);
  assert.equal(cases.size,0,'valid canceled Travel should use existing refund reconciliation');

  const orphan=event({id:'pi_orphan',eventId:'evt_o'});
  const a=await service.handleEvent(orphan);
  assert.equal(a.ok,true);assert.equal(a.action,'successful payment flagged for reconciliation');
  assert.equal(cases.size,1);
  const ticket=[...cases.values()][0];
  assert.ok(ticket.description.includes('pi_orphan'));
  assert.ok(ticket.description.includes('booking reference missing'));
  assert.ok(ticket.description.includes('1900 cents'));
  assert.equal(ticket.kind,'support');

  const duplicate=await service.handleEvent(event({id:'pi_orphan',eventId:'evt_o_different'}));
  assert.equal(duplicate.caseNo,a.caseNo);
  assert.equal(cases.size,1,'different events for same payment must make only one case');

  const variants=[
   {id:'pi_no_ride',rideId:'not_existing',expected:'booking not found'},
   {id:'pi_wrong_uid',rideId:'r1',uid:'intruder',expected:'owner_mismatch'},
   // Each of these also presents a SECOND provider payment ID for a Travel
   // already holding pi_matched; the strict binding rejects that first.
   // Separate payment-exception-policy tests prove amount/currency validation
   // for the correct original PaymentIntent.
   {id:'pi_wrong_amount',rideId:'r1',amount:2500,expected:'duplicate_or_foreign_payment_intent'},
   {id:'pi_wrong_currency',rideId:'r1',currency:'eur',expected:'duplicate_or_foreign_payment_intent'},
  ];
  for(const v of variants){
    const response=await service.handleEvent(event(v));
    assert.equal(response.ok,true);assert.ok(response.caseNo);
    const matching=[...cases.values()].find(x=>x.description.includes(v.id));
    assert.ok(matching.description.includes(v.expected));
  }
  assert.equal(rides.get('r1').paymentIntentId,'pi_matched',
    'mismatched successful payments must not change the real Travel');
  assert.equal(cases.size,1+variants.length);

  outage=true;
  await assert.rejects(()=>service.handleEvent(event({id:'pi_retry'})),
    /synthetic outbound delivery unavailable/);
  outage=false;
  const recovered=await service.handleEvent(event({id:'pi_retry',eventId:'evt_later'}));
  assert.equal(recovered.ok,true);assert.equal(cases.size,2+variants.length);
  await assert.rejects(()=>service.handleEvent(event({id:'',eventId:'evt_invalid'})),
    /no PaymentIntent ID/);
  assert.equal(cases.size,2+variants.length);
 }
 console.log('PASS TWICE: signed-event handler logic, Operator fees excluded, paid Travel match/cancellation, missing/foreign/mismatched payment, duplicate case, outage replay, malformed provider IDs. No external calls or money.');
}
run().catch(e=>{console.error(e);process.exitCode=1});
