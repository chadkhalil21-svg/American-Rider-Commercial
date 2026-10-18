const assert=require('node:assert/strict');const fs=require('node:fs');
const G=require('./geooperators');
assert.equal(G.encodeGeohash(25.7617,-80.1918,7).length,7);
for(const t of G.TIERS)assert.ok(G.prefixes({lat:25.7617,lng:-80.1918},t).length<=9);
for(const p of [{lat:25.7617,lng:-80.1918},{lat:61.2181,lng:-149.9003},{lat:64.1466,lng:-21.9426},{lat:0.1,lng:179.99}]){
  for(const t of G.TIERS){const ps=G.prefixes(p,t);assert.ok(ps.length>=4&&ps.length<=9);assert.ok(ps.every(x=>x.length===t.precision));}
}
const b=G.decodeBounds(G.encodeGeohash(61.2181,-149.9003,5));assert.ok(b&&b.lat[0]<=61.2181&&b.lat[1]>=61.2181&&b.lng[0]<=-149.9003&&b.lng[1]>=-149.9003);
assert.equal(G.PER_PREFIX_LIMIT,40);assert.equal(G.SATURATION_LIMIT,120);
const server=fs.readFileSync(__dirname+'/server.js','utf8'),sched=fs.readFileSync(__dirname+'/scheduler.js','utf8'),mon=fs.readFileSync(__dirname+'/monitor.js','utf8');
assert.ok(server.includes('geohash: encodeGeohash(lat, lng)'));
assert.ok(server.includes('nearbyOperatorCandidates(db, pickup'));
assert.ok(!server.includes("collection('operators').where('available', '==', true).get()"));
assert.ok(!sched.includes("collection('operators').get()"));
assert.ok(!mon.includes("collection('operators').get()"));

(async()=>{
  const calls=[];
  const docsByPrecision={5:[{id:'inner-ineligible',data:()=>({lat:25.76,lng:-80.19,available:true})}],4:[{id:'outer-eligible',data:()=>({lat:25.80,lng:-80.22,available:true})}]};
  const db={collection:()=>({where:()=>({orderBy:()=>({startAt:(prefix)=>({endAt:()=>({limit:()=>({get:async()=>{calls.push(prefix);return {docs:docsByPrecision[prefix.length]||[]};}})})})})})})};
  const rows=await G.nearbyOperatorCandidates(db,{lat:25.7617,lng:-80.1918});
  assert.ok(rows.some(x=>x.id==='inner-ineligible')&&rows.some(x=>x.id==='outer-eligible'),'candidate retrieval widens even when the inner tier is non-empty');
  assert.ok(calls.some(x=>x.length===5)&&calls.some(x=>x.length===4),'both bounded tiers are queried');
  const limits=[];
  const full40=Array.from({length:40},(_,i)=>({id:'s'+i,data:()=>({lat:25.76,lng:-80.19,available:true})}));
  const db2={collection:()=>({where:()=>({orderBy:()=>({startAt:()=>({endAt:()=>({limit:(n)=>({get:async()=>{limits.push(n);return {docs:n===40?full40:full40};}})})})})})})};
  await G.nearbyOperatorCandidates(db2,{lat:25.7617,lng:-80.1918});
  assert.ok(limits.includes(40)&&limits.includes(120),'a saturated prefix escalates once to the bounded saturation ceiling');
  let observed=null;
  const beforeCalls=limits.length;
  const items=await G.nearbyOperatorCandidates(db2,{lat:25.7617,lng:-80.1918},{
    onStats: stats => {observed=stats;},
  });
  assert.ok(items.length>0);
  assert.equal(observed.uniqueCandidates,items.length);
  assert.equal(observed.tiersQueried,2);
  assert.equal(observed.queries,limits.length-beforeCalls,
    'instrumentation counts the actual Firestore calls; makes no extra queries');
  assert.ok(observed.documentsReturned>=items.length);
  assert.equal(observed.providerBilledReadsVerified,false);
  assert.ok(Object.isFrozen(observed));
  assert.ok((await G.nearbyOperatorCandidates(db2,{lat:25.7617,lng:-80.1918},{
    onStats:()=>{throw Error('collector unavailable');},
  })).length>0,'unavailable optional collector does not fail dispatch');
  console.log('all bounded-geographic dispatch tests passed');
})().catch(e=>{console.error(e);process.exit(1);});
