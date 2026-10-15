'use strict';
// Synthetic concurrency fixture; no real passengers, Stripe or Firebase.
const assert=require('node:assert/strict');
const {journeyFor}=require('./fareauthority');
const {prepareBooking,bookingId}=require('./booking');
const NOW=Date.parse('2026-10-15T12:00:00Z');
const FIRST_ID='a'.repeat(40),FIRST_NO='AR-PAID-FIRST-MIA';
const baseFirst={
 travelerUid:'guardian',tripNo:FIRST_NO,status:'completed',completedAt:NOW-60000,
 paymentIntentId:'pi_synthetic_first',travelCostCents:1200,governmentFeeCents:0,
 tollCents:0,party:{teen:true,guardianUid:'guardian',teenUid:'teen',
 familyLinkId:'family1',travelerName:'Teen Traveler'}
};
function mockDb(first=baseFirst){
 const data=new Map([['rides/'+FIRST_ID,structuredClone(first)]]);
 let chain=Promise.resolve();
 const ref=(collection,id)=>({id,path:collection+'/'+id});
 const db={
  data,
  collection(name){return {
   doc(id){return ref(name,id);},
   where(field,operator,value){
    const terms=[[field,operator,value]];
    const q={
     where(f,o,v){terms.push([f,o,v]);return q;},
     limit(n){q.limitN=n;return q;},
     async get(){
      const docs=[...data.entries()].filter(([p,row])=>p.startsWith(name+'/')&&
       terms.every(([f,o,v])=>o==='=='&&f.split('.').reduce((a,k)=>a?.[k],row)===v))
       .slice(0,q.limitN||Infinity).map(([p,row])=>({id:p.slice(name.length+1),data:()=>structuredClone(row)}));
      return {docs};
     }
    };
    return q;
   }
  };},
  runTransaction(fn){
   const next=chain.then(async()=>{
    const writes=[];
    const tx={
     async get(r){return {exists:data.has(r.path),data:()=>structuredClone(data.get(r.path))};},
     create(r,v){writes.push(['create',r.path,structuredClone(v)]);},
     update(r,v){writes.push(['update',r.path,structuredClone(v)]);}
    };
    const result=await fn(tx);
    for(const [op,path,payload] of writes){
     if(op==='create'){assert(!data.has(path),'transactional create must be unique');data.set(path,payload);}
     else{assert(data.has(path));data.set(path,{...data.get(path),...payload});}
    }
    return result;
   });
   chain=next.catch(()=>{});
   return next;
  }
 };
 return db;
}
const key=n=>'smart-second-car-'+String(n).padStart(20,'0');
const proposed=(j,n)=>({tripNo:'AR-SMART-SECOND-'+n,travelCostCents:900,costCents:1150,
 pickupLat:25.78,pickupLng:-80.20,party:j.party,journey:j});
(async()=>{
 const db=mockDb();
 const journey=await journeyFor({db,uid:'guardian',journeyNo:FIRST_NO,now:NOW});
 assert(journey&&journey.leg1RideId===FIRST_ID);
 assert.equal(journey.party.teen,true);
 const requests=Array.from({length:40},(_,i)=>prepareBooking({
  db,uid:'guardian',key:key(i),fingerprint:'route-'+i,record:proposed(journey,i),now:NOW}));
 const outcomes=await Promise.all(requests);
 assert.equal(outcomes.filter(r=>r.status===201).length,1,'only one second car may be created');
 assert.equal(outcomes.filter(r=>r.body.code==='smart_continuation_exists').length,39);
 const acceptedIndex=outcomes.findIndex(r=>r.status===201);
 const accepted=outcomes[acceptedIndex].body;
 assert.equal(db.data.get('rides/'+FIRST_ID).smartContinuationRideId,accepted.rideId);
 assert.equal([...db.data.keys()].filter(x=>x.startsWith('rides/')).length,2,
  'only one additional billable booking exists');
 const retry=await prepareBooking({db,uid:'guardian',key:key(acceptedIndex),
  fingerprint:'route-'+acceptedIndex,record:proposed(journey,acceptedIndex),now:NOW});
 assert.equal(retry.status,200);
 assert.equal(retry.body.rideId,accepted.rideId);
 assert.equal(await journeyFor({db,uid:'guardian',journeyNo:FIRST_NO,now:NOW}),null);
 // Fake failures between quoting and confirming must be rejected in the transaction.
 for(const [condition,change] of [
  ['refund',{refundId:'re_synthetic'}],
  ['refund underway',{refundPending:true}],
  ['no longer completed',{status:'cancelled'}],
  ['second leg masquerading as first',{journey:{journeyNo:'AR-OTHER'}}],
  ['stale completion',{completedAt:NOW-49*3600000}],
  ['other owner',{travelerUid:'other'}],
  ['different quoted fare',{travelCostCents:1201}],
  ['future timestamp',{completedAt:NOW+10000}]
 ]){
  const altered=mockDb({...baseFirst,...change});
  const denied=await prepareBooking({db:altered,uid:'guardian',key:key(99),
   fingerprint:condition,record:proposed(journey,99),now:NOW});
  assert.equal(denied.status,409,condition);
  assert.equal(altered.data.size,1,condition+' must not stage a second Travel');
 }
 assert.equal(await journeyFor({db:mockDb(),uid:'other',journeyNo:FIRST_NO,now:NOW}),null);
 assert.equal(bookingId('guardian',key(0)).length,40);
 console.log('PASS 40 simultaneous Smart second-car attempts, safe retry, Teen party continuity, refunded/foreign/chained/stale refusals');
})().catch(e=>{console.error(e);process.exitCode=1;});
