'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {sanitizeReceiptEvent,applyReceiptDeliveryEvent}=require('./travel-receipt-delivery');
function database() {
 const rows={travel_receipt_outbox:{rr1:{rideId:'ride_paid_1',
   to:'traveler@example.com',providerMessageId:'em_123',deliveryStatus:'accepted'}},
   rides:{ride_paid_1:{status:'completed'}}};
 const refs=(collection,id)=>({collection,id});
 const db={
  collection(collection){return {
   doc:id=>refs(collection,id),
   where:(field,op,value)=>({
    limit:n=>({
     get:async()=>({docs:Object.entries(rows[collection]||{})
      .filter(([,x])=>x[field]===value).slice(0,n)
      .map(([id])=>({ref:refs(collection,id)}))}),
    }),
   }),
  };},
  async runTransaction(fn) {
   const writes=[];
   const tx={
    get:async ref=>({exists:!!rows[ref.collection]?.[ref.id],
      data:()=>rows[ref.collection]?.[ref.id]}),
    set:(ref,patch,options)=>writes.push(()=>{
      rows[ref.collection]??={};
      rows[ref.collection][ref.id]=options?.merge?
       {...(rows[ref.collection][ref.id]||{}),...patch}:patch;
    }),
   };
   const out=await fn(tx);
   for(const work of writes)work();
   return out;
  },
 };
 return {db,rows};
}
(async()=>{
 assert.equal(sanitizeReceiptEvent('event1',{type:'email.delivered',data:{
  email_id:'em_123',from:'insurance@americanrider.app'}}),null);
 assert.equal(sanitizeReceiptEvent('event1',{type:'email.delivered',data:{
  email_id:'em_123',from:'unrelated@example.com'}}),null);
 const packet={type:'email.delivered',created_at:'2026-10-24T00:00:00.000Z',
   data:{email_id:'em_123',from:'American Rider <receipts@americanrider.tech>',
     to:['traveler@example.com']}};
 const event=sanitizeReceiptEvent('event1',packet);
 assert.equal(event.kind,'travel_receipt');
 assert.equal(event.emailId,'em_123');
 assert.equal(sanitizeReceiptEvent('event2',{...packet,data:{...packet.data,
   from:'receipts@americanrider.app'}}).kind,'travel_receipt');
 assert.throws(()=>sanitizeReceiptEvent('event3',{...packet,data:{
  ...packet.data,email_id:'../../bad'}}),/invalid/);
 const store=database();
 const delivered=await applyReceiptDeliveryEvent({db:store.db,event,now:1000});
 assert.equal(delivered.updated,true);
 assert.equal(store.rows.travel_receipt_outbox.rr1.deliveryStatus,'email.delivered');
 assert.equal(store.rows.rides.ride_paid_1.receiptDeliveredAt,event.eventAt);
 assert.equal((await applyReceiptDeliveryEvent({db:store.db,
   event:{...event,id:'event2',type:'email.sent',eventAt:event.eventAt-1},now:1001})).ignored,true);
 assert.equal((await applyReceiptDeliveryEvent({db:store.db,event:{
   ...event,id:'event3',type:'email.bounced',eventAt:event.eventAt+1,
 },now:1002})).updated,true);
 assert.equal(store.rows.rides.ride_paid_1.receiptDeliveryFailed,true);
 assert.equal(store.rows.rides.ride_paid_1.receiptDeliveryStatus,'email.bounced');
 assert.equal((await applyReceiptDeliveryEvent({db:store.db,event:{
   ...event,id:'event4',eventAt:event.eventAt+2,
 },now:1003})).ignored,true,'old type cannot override bounce');
 assert.equal((await applyReceiptDeliveryEvent({db:store.db,event:{
   ...event,id:'event5',recipient:'elsewhere@example.com',eventAt:event.eventAt+2,
 },now:1004})).unmatched,true);
 assert.equal((await applyReceiptDeliveryEvent({db:store.db,event:{
   ...event,id:'event6',emailId:'email_not_saved',eventAt:event.eventAt+2,
 },now:1005})).reason,'receipt_not_correlated_yet');
 const server=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
 assert(server.includes('sanitizeReceiptEvent(verified.id, verified.event)'));
 assert(server.includes('applyReceiptDeliveryEvent({db:adminDb(),event})'));
 assert(server.includes("from:'American Rider <receipts@americanrider.tech>'"),
  'completed Travel receipt sender matches signed webhook correlation identity');
 console.log('PASS signed receipt event scoping, provider ID correlation, inbox-delivery proof, bounces, replay/race recovery');
})().catch(e=>{console.error(e);process.exitCode=1;});
