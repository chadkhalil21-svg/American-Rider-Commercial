'use strict';
// Cost-first, provider-neutral national address / business / POI search.
// "auto" uses private Photon/OSM when commissioned, otherwise the already
// configured HERE account. No Geoapify provider or subscription is supported.
// A hosted public Photon demo or public OSM Nominatim is NEVER used here.
const { readKey } = require('./env');
const MAX_QUERY=160, CACHE_TTL_MS=10*60*1000, MAX_CACHE=500;
const cache=new Map(),inflight=new Map();
// Emergency HERE fallback is per process; configure a vendor-wide quota before
// allowing autoscaling. Never call a second provider after a valid empty answer.
const HERE_FALLBACK_PER_MINUTE=10;
let hereWindowStart=0, hereCalls=0;
function allowExceptionalHere(now=Date.now()){
  if(now-hereWindowStart>=60000){hereWindowStart=now;hereCalls=0;}
  if(hereCalls>=HERE_FALLBACK_PER_MINUTE)return false;
  hereCalls++;return true;
}
const clamp=(n,lo,hi)=>Math.min(hi,Math.max(lo,n));
const validCoord=(lat,lng)=>Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180;
const bucket=n=>Math.round(Number(n)*100)/100;
const cacheKey=(q,near,limit,provider)=>provider+'|'+q.toLowerCase()+'|'+(near?bucket(near.lat)+','+bucket(near.lng):'us')+'|'+limit;
function normalizeSuggestion(x){
  const pos=x?.position;
  if(!x||typeof x.title!=='string'||!validCoord(Number(pos?.lat),Number(pos?.lng)))return null;
  const k=String(x.resultType||'place').toLowerCase();
  return {id:String(x.id||pos.lat+','+pos.lng+','+x.title).slice(0,240),
    title:x.title.slice(0,180),subtitle:String(x.address?.label||x.address?.street||x.address?.city||'').slice(0,240),
    category:['locality','city'].includes(k)?'locality':['street','housenumber','address'].includes(k)?'address':'place',
    lat:Number(pos.lat),lng:Number(pos.lng),source:'here'};
}
function normalizePhoton(feature){
  const p=feature?.properties,coords=feature?.geometry?.coordinates;
  if(!p || feature.geometry?.type!=='Point' || !Array.isArray(coords) ||
      !validCoord(Number(coords[1]),Number(coords[0])))return null;
  // Photon is configured for U.S. location search; never leak foreign results.
  if(p.countrycode && String(p.countrycode).toUpperCase()!=='US')return null;
  const street=[p.housenumber,p.street].filter(Boolean).join(' ').trim();
  const title=String(p.name||street||p.city||p.district||'').trim();
  if(!title)return null;
  const label=[street&&street!==title?street:null,p.city,p.state].filter(Boolean).join(', ');
  const osmKey=String(p.osm_key||'').toLowerCase();
  const category=osmKey==='place'?'locality':street===title||osmKey==='highway'?'address':'place';
  return {id:String('osm-'+(p.osm_type||'')+'-'+(p.osm_id||coords.join(','))).slice(0,240),
    title:title.slice(0,180),subtitle:label.slice(0,240),category,
    lat:Number(coords[1]),lng:Number(coords[0]),source:'photon'};
}
function privatePhotonEndpoint(value){
  try{
    const u=new URL(String(value||''));
    // No public demo. Deploy an American Rider-controlled HTTPS endpoint.
    if(u.protocol!=='https:'||!u.hostname||u.username||u.password||u.search||u.hash||
        u.hostname==='photon.komoot.io'||u.hostname==='nominatim.openstreetmap.org')return null;
    u.pathname='/api';
    return u;
  }catch{return null;}
}
async function requestJson(url,timeout=2500){
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeout);
  try{
    const res=await fetch(url,{signal:ctrl.signal,redirect:'error',headers:{'User-Agent':'American-Rider/1.0'}});
    return res.ok?{ok:true,value:await res.json()}:{ok:false,value:null};
  }catch{return {ok:false,value:null};}finally{clearTimeout(timer);}
}
function annotateProximity(items, near) {
  // Bias is not a geographic restriction. Distant U.S. matches must be clearly
  // distinguishable in the phone UI without blocking explicitly national searches.
  if (!near) return items;
  const radians = n => n * Math.PI / 180;
  return items.map(item => {
    const dlat = radians(item.lat - near.lat);
    const dlng = radians(item.lng - near.lng);
    const hav = Math.sin(dlat/2)**2 +
      Math.cos(radians(near.lat)) * Math.cos(radians(item.lat)) * Math.sin(dlng/2)**2;
    const distanceKm = Math.round(6371 * 2 * Math.atan2(Math.sqrt(hav), Math.sqrt(Math.max(0,1-hav))));
    const outsideLocalArea = distanceKm > 250;
    return { ...item, distanceKm, outsideLocalArea };
  });
}
function unique(items,limit){
  const seen=new Set();
  return items.filter(Boolean).filter(x=>{
    const key=x.lat.toFixed(6)+','+x.lng.toFixed(6);
    if(seen.has(key))return false;seen.add(key);return true;
  }).slice(0,limit);
}
async function photon(q,near,limit,endpoint){
  const u=new URL(endpoint);
  u.searchParams.set('q',q);u.searchParams.set('limit',String(limit));
  u.searchParams.set('countrycode','US');
  if(near){u.searchParams.set('lat',String(near.lat));u.searchParams.set('lon',String(near.lng));}
  const out=await requestJson(u,3500);
  if(!out.ok||!Array.isArray(out.value?.features))return {ok:false,items:[]};
  return {ok:true,items:unique(out.value.features.map(normalizePhoton),limit)};
}
async function here(q,near,limit,key){
  const u=new URL('https://autosuggest.search.hereapi.com/v1/autosuggest');
  u.searchParams.set('q',q);u.searchParams.set('apiKey',key);
  u.searchParams.set('limit',String(limit));u.searchParams.set('in','countryCode:USA');
  u.searchParams.set('at',near?near.lat+','+near.lng:'39.8283,-98.5795');
  const out=await requestJson(u);
  if(!out.ok||!Array.isArray(out.value?.items))return {ok:false,items:[]};
  return {ok:true,items:unique(out.value.items.map(normalizeSuggestion),limit)};
}
function selectedPrimary(){
  const mode=String(process.env.AR_PLACE_SEARCH_PRIMARY||'auto').trim().toLowerCase();
  const photonUrl=privatePhotonEndpoint(process.env.AR_PHOTON_SEARCH_URL);
  const hereKey=readKey('HERE_API_KEY');
  if(mode==='photon')return photonUrl?{name:'photon',credential:photonUrl}:null;
  if(mode==='here')return hereKey?{name:'here',credential:hereKey}:null;
  if(mode!=='auto')return null;
  // Free data first, no additional vendor signup, keep existing functioning
  // HERE commercial account as interim until our own Photon host is available.
  if(photonUrl)return {name:'photon',credential:photonUrl};
  if(hereKey)return {name:'here',credential:hereKey};
  return null;
}
function invoke(primary,q,near,limit){
  if(primary.name==='photon')return photon(q,near,limit,primary.credential);
  if(primary.name==='here')return here(q,near,limit,primary.credential);
  return here(q,near,limit,primary.credential);
}
async function searchPlaces(query,near,limit=6){
  const q=String(query||'').trim().slice(0,MAX_QUERY);
  if(q.length<2)return [];
  const primary=selectedPrimary();
  if(!primary)return [];
  const n=near&&validCoord(Number(near.lat),Number(near.lng))?{lat:Number(near.lat),lng:Number(near.lng)}:null;
  const max=clamp(Number(limit)||6,1,8);
  const ck=cacheKey(q,n,max,primary.name);
  const hit=cache.get(ck);
  if(hit&&Date.now()-hit.at<CACHE_TTL_MS)return hit.items;
  if(inflight.has(ck))return inflight.get(ck);
  const work=(async()=>{
    const result=await invoke(primary,q,n,max);
    // Successful empty results are authoritative. No speculative paid lookup.
    let items=result.items;
    if(!result.ok){
      const hereKey=primary.name!=='here'&&process.env.AR_HERE_AUTOCOMPLETE_FALLBACK==='1'
        ?readKey('HERE_API_KEY'):null;
      if(hereKey&&allowExceptionalHere())items=(await here(q,n,max,hereKey)).items;
    }
    items=annotateProximity(items,n);
    if(result.ok){
      cache.set(ck,{at:Date.now(),items});
      if(cache.size>MAX_CACHE)cache.delete(cache.keys().next().value);
    }
    return items;
  })();
  inflight.set(ck,work);
  try{return await work;}finally{inflight.delete(ck);}
}
module.exports={searchPlaces,normalizeSuggestion,normalizePhoton,privatePhotonEndpoint,selectedPrimary,annotateProximity};
