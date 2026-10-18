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
  let saturated=false;
  const out=new Map();
  await Promise.all(prefixes(point,tier).map(async prefix=>{
    const base=db.collection('operators').where('available','==',true)
      .orderBy('geohash').startAt(prefix).endAt(prefix+'\uf8ff');
    if(stats)stats.queries++;
    const first=await base.limit(limitPerPrefix).get();
    if(stats)stats.documentsReturned+=first.docs.length;
    // A saturated cell must retain the first page and fetch only the NEXT records.
    // Re-running a larger overlapping query billed the first 40 documents twice.
    // Snapshot cursors preserve ties when many Operators share the same geohash.
    const docs=[...first.docs];
    if(first.docs.length===limitPerPrefix && saturationLimit>limitPerPrefix){
      const last=first.docs[first.docs.length-1];
      if(stats)stats.queries++;
      const next=await base.startAfter(last).limit(saturationLimit-limitPerPrefix).get();
      if(stats)stats.documentsReturned+=next.docs.length;
      docs.push(...next.docs);
    }
    if(docs.length>=saturationLimit){
      saturated=true;
      if(stats)stats.saturatedPrefixes++;
    }
    for(const d of docs){
      if(excludeIds.has(String(d.id)))continue;
      const x={id:d.id,...d.data()};
      if(Number.isFinite(Number(x.lat))&&Number.isFinite(Number(x.lng)))out.set(String(d.id),x);
    }
  }));
  return {rows:[...out.values()],saturated};
}

/**
 * A safe geographic lower bound for all areas OUTSIDE the fully queried
 * 3x3 fine-geohash neighborhood. We only use this in mid-latitude, non-wrapping
 * 9-cell rectangles and with *complete* (unsaturated) fine-cell query results.
 * Any closer vehicle outside that box would violate the spherical distance
 * lower bound, so broad queries cannot change the nearest eligible choice.
 */
function fineCoverageRadiusMiles(point,tier){
  const lat=Number(point?.lat),lng=Number(point?.lng);
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>70||Math.abs(lng)>170)return 0;
  const cells=prefixes(point,tier);
  if(cells.length!==9)return 0;
  const rectangles=cells.map(decodeBounds);
  if(rectangles.some(x=>!x))return 0;
  const latLo=Math.min(...rectangles.map(x=>x.lat[0])),latHi=Math.max(...rectangles.map(x=>x.lat[1]));
  const lngLo=Math.min(...rectangles.map(x=>x.lng[0])),lngHi=Math.max(...rectangles.map(x=>x.lng[1]));
  const center=decodeBounds(encodeGeohash(lat,lng,tier.precision));
  if(!center)return 0;
  const latSpan=center.lat[1]-center.lat[0],lngSpan=center.lng[1]-center.lng[0];
  // Nine distinct adjoining cells must form a complete rectangle; otherwise
  // the bound is invalid (and a normal full search is required).
  if(Math.abs((latHi-latLo)/latSpan-3)>1e-6 ||
     Math.abs((lngHi-lngLo)/lngSpan-3)>1e-6 ||
     lat<=latLo||lat>=latHi||lng<=lngLo||lng>=lngHi)return 0;
  const toRad=Math.PI/180,R=3958.8;
  const north=R*(latHi-lat)*toRad,south=R*(lat-latLo)*toRad;
  // Spherical angular distance to a *meridian*, minimized over ALL
  // latitudes, is asin(|cos(latitude)sin(delta longitude)|).
  const meridian=dlon=>R*Math.asin(Math.min(1,Math.abs(Math.cos(lat*toRad)*Math.sin(dlon*toRad))));
  const radius=Math.min(north,south,meridian(lng-lngLo),meridian(lngHi-lng));
  return Number.isFinite(radius)?Math.max(0,radius*0.95-0.05):0;
}
// Return the union of bounded tiers. Do not stop merely because an inner tier contains records:
// those records can all fail screening, insurance, presence, class or commissioning gates. The
// exact matcher chooses the nearest eligible Operator from the bounded union.
async function nearbyOperatorCandidates(db,point,opts={}){
  if(!encodeGeohash(point?.lat,point?.lng,1))return [];
  const all=new Map();
  // Optional zero-extra-query instrumentation, strictly counts returned documents
  // and executed query calls. Index-entry billing, retries and listener fanout
  // remain unmeasured until reconciled against actual Firebase usage reports.
  const stats=typeof opts.onStats==='function'
    ? {queries:0,documentsReturned:0,tiersQueried:0,saturatedPrefixes:0,earlyStop:false,
       uniqueCandidates:0,providerBilledReadsVerified:false}
    : null;
  for(let i=0;i<TIERS.length;i++){
    const tier=TIERS[i];
    if(stats)stats.tiersQueried++;
    const page=await queryTier(db,point,tier,{...opts,stats});
    for(const row of page.rows)all.set(String(row.id),row);
    const matching=opts.safeMatching;
    // Opt-in from the server's authoritative dispatch path only. If no close,
    // VERIFIED eligible free Operator exists, or any page is saturated, widen
    // normally. Occupied Operators might be legitimately queue-eligible after
    // separate Travel checks, so never shortcut when any are present.
    if(i===0&&matching&&!page.saturated&&!page.rows.some(x=>x.currentRideId)){
      const {matchOperator,distanceMiles}=require('./matching');
      const nearest=matchOperator(page.rows,point,matching.travelClass||'Standard',{
        requireScreening:matching.requireScreening===true,allowQueued:false,
        travelMinutes:matching.travelMinutes??null,
        now:matching.now||Date.now(),
      });
      const safeRadius=fineCoverageRadiusMiles(point,tier);
      if(nearest&&safeRadius>0&&distanceMiles(point,nearest.operator)<safeRadius){
        if(stats)stats.earlyStop=true;
        break;
      }
    }
  }
  if(stats){
    stats.uniqueCandidates=all.size;
    // Instrumentation is advisory and must never block a paid dispatch.
    try { opts.onStats(Object.freeze(stats)); } catch { /* telemetry is not dispatch authority */ }
  }
  return [...all.values()];
}
module.exports={encodeGeohash,decodeBounds,nearbyOperatorCandidates,prefixes,fineCoverageRadiusMiles,TIERS,PER_PREFIX_LIMIT,SATURATION_LIMIT};
