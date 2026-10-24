'use strict';
// No provider calls. Signed-webhook logic and duplicate reversal handling.
const assert=require('node:assert/strict');
const Module=require('node:module');
const priorLoad=Module._load;
const rides=new Map(),reversed=new Set();
let calls=0;
const db={collection(name){
  assert.equal(name,'rides');
  return {
    where(field,op,value){
      assert.equal(field,'paymentIntentId');assert.equal(op,'==');
      return {limit:()=>({get:async()=>({docs:[...rides].filter(([,r])=>r.paymentIntentId===value)
        .map(([id,r])=>({id,data:()=>({...r})}))})})};
    },
    doc(id){return {set:async(x)=>rides.set(id,{...rides.get(id),...x})};},
  };
}};
const fake={
 './firebase-admin':{adminDb:()=>db,adminStatus:()=>({ok:true})},
 './tickets':{fileTicket:async()=>({ok:true,stored:true,emailed:true,caseNo:'CASE'})},
 './env':{readKey:()=>''},'./email':{money:n=>String(n)},
 './disputeevidence':{saveDisputeEvidence:async()=>({ref:'synthetic'})},
 './recruiter-commission-ledger':{reverseCommission:async({eventId,proof})=>{
   assert.equal(proof.verified,true);
   calls++;
   if(reversed.has(eventId))return {ok:true,duplicate:true};
   reversed.add(eventId);return {ok:true,status:'reversed'};
 }},
};
Module._load=function(id,parent,main){return Object.prototype.hasOwnProperty.call(fake,id)
 ? fake[id]:priorLoad.apply(this,arguments);};
(async()=>{
  const service=require('./webhook');
  rides.set('travel-123456',{status:'completed',paymentIntentId:'pi_fixture_12345',
    referralProgramVersion:'recruiter-15c-20261024-v1'});
  const e={id:'evt_refund_1234',type:'charge.refunded',
    data:{object:{payment_intent:'pi_fixture_12345',amount_refunded:200}}};
  assert.equal((await service.handleEvent(e)).ok,true);
  assert.equal(rides.get('travel-123456').recruiterRewardRefunded,true);
  assert.equal(reversed.size,2);
  await service.handleEvent(e);
  assert.equal(reversed.size,2,'provider replay may not reverse a cent twice');
  const updated={id:'evt_update_1234',type:'refund.updated',
    data:{object:{payment_intent:'pi_fixture_12345',amount:200,status:'succeeded'}}};
  assert.equal((await service.handleEvent(updated)).ok,true);
  assert.equal(reversed.size,2);
  rides.set('travel-no-recruiter',{paymentIntentId:'pi_normal_12345'});
  await service.handleEvent({id:'evt_normal_1234',type:'charge.refunded',
    data:{object:{payment_intent:'pi_normal_12345',amount_refunded:200}}});
  assert.equal(reversed.size,2,'unreferred Travels have zero recruiter writes');
  assert(calls>=4);
  console.log('PASS signed refund logic: funded Recruiter reversal, replay, later update and ordinary Travel isolation');
})().catch(err=>{console.error(err);process.exitCode=1;}).finally(()=>{Module._load=priorLoad;});
