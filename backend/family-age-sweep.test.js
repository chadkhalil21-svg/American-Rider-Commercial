'use strict';
// Synthetic Firestore test: age-out must never scan unrelated reservations or
// cancel one claimed by the scheduler after a query began.
const assert=require('node:assert/strict');
const path=require('node:path');
const now=Date.UTC(2026,9,15,12);
const rows={
 family_links:{
  aged:{status:'active',teenDob:'2008-10-15'},
  young:{status:'active',teenDob:'2011-10-15'}
 },
 scheduled_rides:{
  young_booking:{status:'reserved',party:{teen:true,familyLinkId:'young'}},
  unrelated:{status:'reserved',party:{teen:false}}
 }
};
for(let n=0;n<102;n++) rows.scheduled_rides['aged_'+String(n).padStart(3,'0')]={status:'reserved',party:{teen:true,familyLinkId:'aged'}};
rows.scheduled_rides.race={status:'reserved',party:{teen:true,familyLinkId:'aged'}};
let scheduledQueries=0,queryLimitMax=0,raced=false;
const snapshot=(col,id)=>({exists:!!rows[col]?.[id],id,data:()=>structuredClone(rows[col][id]||{}),ref:reference(col,id)});
function reference(col,id){return {id,
 async get(){
  if(col==='scheduled_rides'&&id==='race'&&!raced){raced=true;rows.scheduled_rides.race.status='dispatching';}
  return snapshot(col,id);
 },
 async set(changes,{merge}={}){rows[col][id]=merge?{...rows[col][id],...changes}:changes;},
 async update(changes){Object.assign(rows[col][id],changes);}
};}
function query(col,filters=[],limit=null){return {
 where(field,op,value){return query(col,[...filters,[field,op,value]],limit);},
 limit(n){return query(col,filters,n);},
 async get(){
  if(col==='scheduled_rides'){
   scheduledQueries++;
   assert(filters.some(([f,o,v])=>f==='party.familyLinkId'&&o==='=='&&v==='aged'),'query must target the exact Family');
   assert(filters.some(([f,o,v])=>f==='status'&&o==='=='&&v==='reserved'),'query must target only reserved Travels');
   assert(Number.isInteger(limit)&&limit<=100,'queries must be page-bounded');
   queryLimitMax=Math.max(queryLimitMax,limit);
  }
  const docs=Object.keys(rows[col]||{}).filter(id=>filters.every(([f,o,v])=>{
   assert.equal(o,'==');
   return f.split('.').reduce((value,key)=>value?.[key],rows[col][id])===v;
  })).sort().slice(0,limit??Infinity).map(id=>({...snapshot(col,id)}));
  return {docs};
 }
};}
const db={
 collection(col){return {doc:id=>reference(col,id),where:(f,o,v)=>query(col).where(f,o,v)};},
 runTransaction:async cb=>cb({get:ref=>ref.get(),update:(ref,value)=>ref.update(value)})
};
const adminPath=require.resolve(path.join(__dirname,'firebase-admin.js'));
const originalAdmin=require.cache[adminPath];
require.cache[adminPath]={id:adminPath,filename:adminPath,loaded:true,exports:{adminDb:()=>db,adminStatus:()=>({reason:null})}};
const familyPath=require.resolve(path.join(__dirname,'family.js'));
const originalFamily=require.cache[familyPath];
delete require.cache[familyPath];
(async()=>{try{
 const {sweepFamilyAgeOut}=require('./family');
 const out=await sweepFamilyAgeOut({now});
 assert.equal(out.ok,true);
 assert.equal(out.agedOut,1);
 assert.equal(out.cancelledScheduledTravels,102);
 assert.equal(rows.family_links.aged.status,'aged_out');
 assert.equal(rows.family_links.young.status,'active');
 assert.equal(rows.scheduled_rides.race.status,'dispatching','do not cancel a journey already claimed by the scheduler');
 assert.equal(rows.scheduled_rides.young_booking.status,'reserved');
 assert.equal(rows.scheduled_rides.unrelated.status,'reserved');
 assert(scheduledQueries>=2&&scheduledQueries<=5,'bounded queries must advance through multiple pages');
 assert.equal(queryLimitMax,100);
 assert.equal(Object.values(rows.scheduled_rides).filter(x=>x.party?.familyLinkId==='aged'&&x.status==='reserved').length,0);
 console.log('PASS Teen age-out: only matching reserved bookings read, multiple bounded pages, dispatch race preserved');
}finally{
 if(originalAdmin)require.cache[adminPath]=originalAdmin;else delete require.cache[adminPath];
 if(originalFamily)require.cache[familyPath]=originalFamily;else delete require.cache[familyPath];
}})().catch(e=>{console.error(e);process.exitCode=1;});
