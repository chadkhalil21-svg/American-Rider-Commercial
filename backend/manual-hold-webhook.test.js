'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const rows={T:{travelerUid:'traveler',costCents:2500,status:'awaiting_payment',
 paymentIntentId:null,tripNo:'AR-HOLD-TEST',paymentCapturePolicy:'manual_v1'}};
let writes=0;const notices=new Map();
const doc=(id)=>({
 id,
 get:async()=>({exists:!!rows[id],data:()=>structuredClone(rows[id])}),
 update:async patch=>{rows[id]={...rows[id],...patch};writes++}
});
const db={collection:()=>({doc}),runTransaction:async fn=>fn({get:ref=>ref.get(),update:(ref,patch)=>ref.update(patch)})};
const firebase=require.resolve(path.join(__dirname,'firebase-admin.js'));
require.cache[firebase]={id:firebase,filename:firebase,loaded:true,
 exports:{adminDb:()=>db,adminStatus:()=>({ok:true})},children:[],paths:[]};
const support=require.resolve(path.join(__dirname,'tickets.js'));
require.cache[support]={id:support,filename:support,loaded:true,
 exports:{fileTicket:async a=>{notices.set(a.idempotencyKey,a);
 return {ok:true,stored:true,emailed:true,caseNo:'AR-SYNTHETIC'};}},children:[],paths:[]};
const {handleEvent}=require('./webhook');
const ev=(type,fields={})=>({id:'evt-synthetic',type,data:{object:{
 id:'pi_manual',currency:'usd',amount:2500,status:'requires_capture',
 capture_method:'manual',amount_capturable:2500,amount_received:0,
 metadata:{uid:'traveler',rideId:'T',capturePolicy:'manual_v1'},...fields}}});
(async()=>{
 let e=await handleEvent(ev('payment_intent.amount_capturable_updated'));
 assert.equal(e.ok,true);assert.equal(rows.T.paymentIntentId,'pi_manual');
 assert.equal(rows.T.authorizationState,'held');assert.equal(rows.T.paidAt,undefined);
 const previous=writes;
 await handleEvent(ev('payment_intent.amount_capturable_updated'));
 assert.equal(writes,previous,'replayed hold event does not generate redundant document writes');
 e=await handleEvent(ev('payment_intent.succeeded',{status:'succeeded',amount_received:2500}));
 assert.equal(e.action,'booking reconciled');
 assert.equal(rows.T.authorizationState,'captured');
 assert.equal(rows.T.capturedCents,2500);
 assert.equal(rows.T.refundPending,undefined,'completed Travel has no refund');
 rows.T.status='cancelled';rows.T.cancellationFeeCaptureCents=400;
 delete rows.T.paidAt;
 e=await handleEvent(ev('payment_intent.succeeded',{status:'succeeded',amount_received:400}));
 assert.equal(e.action,'booking reconciled');
 assert.equal(rows.T.capturedCents,400);assert.equal(rows.T.refundPending,undefined);
 const caught=await handleEvent(ev('payment_intent.succeeded',
   {status:'succeeded',amount_received:399,metadata:{uid:'attacker',rideId:'T',capturePolicy:'manual_v1'}}));
 assert.equal(caught.action,'successful payment flagged for reconciliation');
 assert.equal(rows.T.capturedCents,400);
 assert.equal(notices.size,1,'wrong owner is flagged, not paid');
 console.log('PASS: authorized hold is not a charge, 0 redundant replay writes, $25/full and $4/fee webhook proof, hostile mismatch');
})().catch(e=>{console.error(e);process.exitCode=1});
