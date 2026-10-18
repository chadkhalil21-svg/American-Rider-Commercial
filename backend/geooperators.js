// Bounded geographic Operator retrieval for dispatch.
//
// Firestore has no native radius query. Operators store a geohash; dispatch queries bounded
// neighboring geohash cells and matching.js remains the exact distance/eligibility authority.
// Cell centers are derived from the geohash's actual decoded bounds, not fixed degree offsets,
// so the neighborhood construction remains valid across latitudes and the antimeridian.
const BASE32='0123456789bcdefghjkmnpqrstuvwxyz';
const PER_PREFIX_LIMIT=40;
const SATURATION_LIMIT=120;
const TIERS=Object.freeze([{precision:5},{precision:4}]);

function encodeGeohash(lat,lng,precision=7){
  lat=Number(lat);lng=Number(lng);
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)return null;
  let latR=[-90,90],lngR=[-180,180],even=true,bit=0,ch=0,out='';
  while(out.length<precision){
    const r=even?lngR:latR, v=even?lng:lat, mid=(r[0]+r[1])/2;
    if(v>=mid){ch|=1<<(4-bit);r[0]=mid;}else r[1]=mid;
    even=!even;
    if(bit<4)bit++;else{out+=BASE32[ch];bit=0;ch=0;}
  }
  return out;
}
function decodeBounds(hash){
  let lat=[-90,90],lng=[-180,180],even=true;
  for(const ch of String(hash||'')){
    const n=BASE32.indexOf(ch); if(n<0)return null;
    for(let mask=16;mask;mask>>=1){
      const r=even?lng:lat,mid=(r[0]+r[1])/2;
      if(n&mask)r[0]=mid;else r[1]=mid;
      even=!even;
    }
  }
  return {lat,lng};
}
function wrapLng(lng){while(lng>180)lng-=360;while(lng<-180)lng+=360;return lng;}
function prefixes(point,tier){
  const center=encodeGeohash(point?.lat,point?.lng,tier.precision); if(!center)return [];
  const b=decodeBounds(center); if(!b)return [];
  const latSpan=b.lat[1]-b.lat[0],lngSpan=b.lng[1]-b.lng[0],set=new Set();
  for(const dy of [-1,0,1])for(const dx of [-1,0,1]){
    const lat=Math.max(-89.999999,Math.min(89.999999,Number(point.lat)+dy*latSpan));
    set.add(encodeGeohash(lat,wrapLng(Number(point.lng)+dx*lngSpan),tier.precision));
  }
  return [...set].filter(Boolean);
}
async function queryTier(db,point,tier,{excludeIds=new Set(),limitPerPrefix=PER_PREFIX_LIMIT,saturationLimit=SATURATION_LIMIT,stats=null}={}){
  const out=new Map();
  await Promise.all(prefixes(point,tier).map(async prefix=>{
    if(stats)stats.queries++;
    let snap=await db.collection('operators').where('available','==',true)
      .orderBy('geohash').startAt(prefix).endAt(prefix+'\uf8ff').limit(limitPerPrefix).get();
    // A full prefix page is ambiguous: there may be more Operators hidden behind the
    // lexicographic cutoff. Escalate only that saturated cell, still to a hard ceiling.
    if(snap.docs.length===limitPerPrefix && saturationLimit>limitPerPrefix){
      if(stats)stats.documentsReturned+=snap.docs.length;
      if(stats)stats.queries++;
      snap=await db.collection('operators').where('available','==',true)
        .orderBy('geohash').startAt(prefix).endAt(prefix+'\uf8ff').limit(saturationLimit).get();
    }
    if(stats)stats.documentsReturned+=snap.docs.length;
    if(stats&&snap.docs.length>=saturationLimit)stats.saturatedPrefixes++;
    for(const d of snap.docs){
      if(excludeIds.has(String(d.id)))continue;
      const x={id:d.id,...d.data()};
      if(Number.isFinite(Number(x.lat))&&Number.isFinite(Number(x.lng)))out.set(String(d.id),x);
    }
  }));
  return [...out.values()];
}
// Return the union of bounded tiers. Do not stop merely because an inner tier contains records:
// those records can all fail screening, insurance, presence, class or commissioning gates. The
// exact matcher chooses the nearest eligible Operator from the bounded union.
async function nearbyOperatorCandidates(db,point,opts={}){
  if(!encodeGeohash(point?.lat,point?.lng,1))return [];
  const all=new Map();
  // Optional no-write diagnostic. Row totals include duplicate pages and are not
  // Firestore billed read units; index entries and listener fanout must be measured.
  const stats=typeof opts.onStats==='function'
    ? {queries:0,documentsReturned:0,tiersQueried:0,saturatedPrefixes:0,
       uniqueCandidates:0,providerBilledReadsVerified:false}
    : null;
  for(const tier of TIERS){
    if(stats)stats.tiersQueried++;
    for(const row of await queryTier(db,point,tier,{...opts,stats}))all.set(String(row.id),row);
  }
  if(stats){
    stats.uniqueCandidates=all.size;
    try{ opts.onStats(Object.freeze(stats)); }catch{ /* metrics never blocks dispatch */ }
  }
  return [...all.values()];
}
module.exports={encodeGeohash,decodeBounds,nearbyOperatorCandidates,prefixes,TIERS,PER_PREFIX_LIMIT,SATURATION_LIMIT};
