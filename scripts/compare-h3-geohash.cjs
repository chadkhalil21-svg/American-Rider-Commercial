'use strict';
// Offline experiment ONLY. Nothing is queried/written in Firebase, no live
// customers or location data. Run after installing h3-js in an isolated dev env.
// Benchmark compares candidate inclusion and regional density, NOT billed reads.
let h3;
try{h3=require('h3-js');}
catch{console.error('Install h3-js in a throwaway local benchmark environment; never add it to the production backend just for this experiment.');process.exitCode=2;return;}
const {encodeGeohash,prefixes,TIERS}=require('../backend/geooperators');
let seed=20261017;const rnd=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const centers=[{lat:25.7617,lng:-80.1918},{lat:26.1224,lng:-80.1434},{lat:26.7153,lng:-80.0534}];
function dist(a,b){const rad=Math.PI/180;const dlat=(a.lat-b.lat)*rad,dlng=(a.lng-b.lng)*rad;
 const h=Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlng/2)**2;
 return 3958.8*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));}
const operators=Array.from({length:10000},(_,i)=>{
 const c=centers[i%3];return {lat:c.lat+(rnd()-.5)*.22,lng:c.lng+(rnd()-.5)*.25};
});
const pts=Array.from({length:160},(_,i)=>{
 const c=centers[i%3];return {lat:c.lat+(rnd()-.5)*.19,lng:c.lng+(rnd()-.5)*.22};
});
const res=8,k=4;
let results={queries:pts.length,operators:operators.length,h3Resolution:res,h3Ring:k,
 geohashCandidates:0,h3Candidates:0,geohashMisses:0,h3Misses:0,closeNearbyPairs:0};
const packed=operators.map(o=>({...o,h3:h3.latLngToCell(o.lat,o.lng,res),hash5:encodeGeohash(o.lat,o.lng,5),hash4:encodeGeohash(o.lat,o.lng,4)}));
for(const p of pts){
 const near=new Set(packed.map((o,i)=>dist(p,o)<=3?i:-1).filter(i=>i>=0));
 const cells=new Set(h3.gridDisk(h3.latLngToCell(p.lat,p.lng,res),k));
 const hash4=new Set(prefixes(p,TIERS[1]));
 const hash5=new Set(prefixes(p,TIERS[0]));
 const g=new Set(),h=new Set();
 packed.forEach((o,i)=>{
  if(hash4.has(o.hash4)||hash5.has(o.hash5))g.add(i);
  if(cells.has(o.h3))h.add(i);
 });
 results.geohashCandidates+=g.size;results.h3Candidates+=h.size;
 for(const i of near){results.closeNearbyPairs++;if(!g.has(i))results.geohashMisses++;
  if(!h.has(i))results.h3Misses++;}
}
results.geohashCandidatesPerQuery=Math.round(results.geohashCandidates/pts.length);
results.h3CandidatesPerQuery=Math.round(results.h3Candidates/pts.length);
console.log(JSON.stringify(results,null,2));
console.log('SYNTHETIC ONLY. Change ring/resolution and coastline/density tests; do not migrate until exact-nearest eligibility and Firestore index/query costs are proven.');
