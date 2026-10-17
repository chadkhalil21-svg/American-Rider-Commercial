'use strict';
const assert=require('node:assert/strict');
const G=require('./geooperators');
const { DISCLOSURE_VERSION }=require('./disclosure');
const { distanceMiles }=require('./matching');
const src={lat:25.7617,lng:-80.1918};
const c=G.decodeBounds(G.encodeGeohash(src.lat,src.lng,5));
const pickup={lat:(c.lat[0]+c.lat[1])/2,lng:(c.lng[0]+c.lng[1])/2};
const center5=G.encodeGeohash(pickup.lat,pickup.lng,5);
const center4=G.encodeGeohash(pickup.lat,pickup.lng,4);
const now=Date.now();
function good(id,lat,lng,more={}){
  return {id,available:true,lat,lng,onlineAt:now,
    screeningCheckedAt:now,insuranceExpiry:'2099-01-01',
    disclosureVersion:DISCLOSURE_VERSION,commissioned:true,
    documentBlocked:false,screeningBlocked:false,classes:['Standard'],
    ...more};
}
function mkDoc(x){return {id:x.id,data:()=>({...x})};}
function fakeDb(records) {
  const searches=[],pages=[];
  const db={collection:()=>({where:()=>({orderBy:()=>({
    startAt(prefix){searches.push(prefix);return {
      endAt(){return {
        limit(n){return {get:async()=>{
          const values=records[prefix]||[];
          return {docs:values.slice(0,n).map(mkDoc)};
        }};},
        startAfter(doc){return {limit(n){return {get:async()=>{
          pages.push({prefix,after:doc.id,n});
          const values=records[prefix]||[];
          const index=values.findIndex(v=>v.id===doc.id);
          return {docs:values.slice(index+1,index+1+n).map(mkDoc)};
        }};}};},
      };},
    };},
  })})})};
  return {db,searches,pages};
}
const matchOptions={travelClass:'Standard',requireScreening:true,now};
function count(steps,precision){return steps.filter(x=>x.length===precision).length;}
(async()=>{
 assert(G.fineCoverageRadiusMiles(pickup,G.TIERS[0])>0.5,'fine cell union covers a safe radius');
 const close=good('eligible-close',pickup.lat+0.0005,pickup.lng);
 assert(distanceMiles(pickup,close)<G.fineCoverageRadiusMiles(pickup,G.TIERS[0]));
 const far=good('fallback-distant',pickup.lat+0.03,pickup.lng);
 {
   const {db,searches}=fakeDb({[center5]:[close],[center4]:[far]});
   const result=await G.nearbyOperatorCandidates(db,pickup,{safeMatching:matchOptions});
   assert.equal(count(searches,4),0,'eligible nearby Operator stops before broad search');
   assert.equal(count(searches,5),9,'nine nearby cells searched completely');
   assert.deepEqual(result.map(x=>x.id),['eligible-close']);
 }
 {
   const ineligible=good('screened-out',close.lat,close.lng,{screeningBlocked:true});
   const {db,searches}=fakeDb({[center5]:[ineligible],[center4]:[far]});
   const result=await G.nearbyOperatorCandidates(db,pickup,{safeMatching:matchOptions});
   assert(count(searches,4)>0,'screening failures must search more distant cells');
   assert(result.some(x=>x.id==='fallback-distant'));
 }
 {
   const queued=good('underway-nearby',close.lat,close.lng,{currentRideId:'ride_assigned'});
   const {db,searches}=fakeDb({[center5]:[close,queued],[center4]:[far]});
   await G.nearbyOperatorCandidates(db,pickup,{safeMatching:matchOptions});
   assert(count(searches,4)>0,'occupied Operators may become queue-eligible after verified Travel check');
 }
 {
   const saturated=Array.from({length:120},(_,i)=>good('large-'+i,close.lat,close.lng));
   const {db,searches,pages}=fakeDb({[center5]:saturated,[center4]:[far]});
   const result=await G.nearbyOperatorCandidates(db,pickup,{safeMatching:matchOptions});
   assert(count(searches,4)>0,'saturated fine cell never silently hides nearest available Operator');
   assert(pages.some(x=>x.n===80),'remaining candidates come from non-overlapping next page');
   assert(result.some(x=>x.id==='large-119'));
 }
 {
   const edge=good('near-fine-cell-edge',c.lat[1]-0.00005,c.lng[1]-0.00005);
   const {db,searches}=fakeDb({[center5]:[edge],[center4]:[far]});
   await G.nearbyOperatorCandidates(db,pickup,{safeMatching:matchOptions});
   assert(count(searches,4)>0,'nearby match too far to prove optimal requires outer search');
 }
 {
   const {db,searches}=fakeDb({[center5]:[close],[center4]:[far]});
   const result=await G.nearbyOperatorCandidates(db,pickup);
   assert(count(searches,4)>0,'default callers retain complete two-tier search');
   assert(result.some(x=>x.id==='fallback-distant'));
 }
 assert.equal(G.fineCoverageRadiusMiles({lat:85,lng:10},G.TIERS[0]),0);
 assert.equal(G.fineCoverageRadiusMiles({lat:25,lng:179.9},G.TIERS[0]),0);
 console.log('PASS safe nearby-first search, screening failures, busy queues, saturation, geographic boundary and default fallback');
})().catch(e=>{console.error(e);process.exitCode=1;});
