// National address, business and POI autocomplete. Discovery != booking authorization.
// Commercial primary: Geoapify when commissioned. HERE is an EXPLICIT emergency
// fallback only, never an invisible automatic cost for every keystroke.
// Do not deploy without a Geoapify key, license/attribution and device checks.
const { readKey } = require('./env');
const MAX_QUERY=160, CACHE_TTL_MS=10*60*1000, MAX_CACHE=500;
const cache=new Map(),inflight=new Map();
const clamp=(n,lo,hi)=>Math.min(hi,Math.max(lo,n));
const validCoord=(lat,lng)=>Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180;
const bucket=n=>Math.round(Number(n)*100)/100;
const cacheKey=(q,near,limit,provider)=>provider+'|'+q.toLowerCase()+'|'+(near?bucket(near.lat)+','+bucket(near.lng):'us')+'|'+limit;

function normalizeSuggestion(x){
  const pos=x?.position;
  if(!x||typeof x.title!=='string'||!validCoord(Number(pos?.lat),Number(pos?.lng)))return null;
  const k=String(x.resultType||'place').toLowerCase();
  return {id:String(x.id||pos.lat+','+pos.lng+','+x.title).slice(0,240),
    title:x.title.slice(0,180),
    subtitle:String(x.address?.label||x.address?.street||x.address?.city||'').slice(0,240),
    category:['locality','city'].includes(k)?'locality':['street','housenumber','address'].includes(k)?'address':'place',
    lat:Number(pos.lat),lng:Number(pos.lng),source:'here'};
}
function normalizeGeoapify(x){
  if(!x||!validCoord(Number(x.lat),Number(x.lon)))return null;
  const name=String(x.name||x.address_line1||x.formatted||'').trim();
  if(!name)return null;
  const kind=String(x.result_type||'').toLowerCase();
  return {id:String(x.place_id||x.formatted||x.lon+','+x.lat).slice(0,240),
    title:name.slice(0,180),
    subtitle:String(x.address_line2||x.formatted||'').slice(0,240),
    category:['city','county','state','suburb','district','postcode'].includes(kind)?'locality':
      ['building','street'].includes(kind)?'address':'place',
    lat:Number(x.lat),lng:Number(x.lon),source:'geoapify'};
}
async function requestJson(url,timeout=2500){
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeout);
  try{
    const res=await fetch(url,{signal:ctrl.signal,headers:{'User-Agent':'American-Rider/1.0'}});
    return res.ok?{ok:true,value:await res.json()}:{ok:false,value:null};
  }catch{return {ok:false,value:null};}finally{clearTimeout(timer);}
}
function unique(items,limit){
  const seen=new Set();
  return items.filter(Boolean).filter(x=>{
    const key=x.lat.toFixed(6)+','+x.lng.toFixed(6);
    if(seen.has(key))return false;seen.add(key);return true;
  }).slice(0,limit);
}
async function geoapify(q,near,limit,key){
  const u=new URL('https://api.geoapify.com/v1/geocode/autocomplete');
  u.searchParams.set('text',q);u.searchParams.set('apiKey',key);
  u.searchParams.set('format','json');u.searchParams.set('filter','countrycode:us');
  u.searchParams.set('limit',String(limit));
  if(near)u.searchParams.set('bias','proximity:'+near.lng+','+near.lat);
  const out=await requestJson(u);
  if(!out.ok||!Array.isArray(out.value?.results))return {ok:false,items:[]};
  return {ok:true,items:unique(out.value.results.map(normalizeGeoapify),limit)};
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
async function searchPlaces(query,near,limit=6){
  const q=String(query||'').trim().slice(0,MAX_QUERY);
  if(q.length<2)return [];
  const primaryKey=readKey('GEOAPIFY_API_KEY');
  // Fail closed when no primary is configured; the *existing production backend*
  // remains unchanged until primary API credentials and attribution are commissioned.
  if(!primaryKey)return [];
  const secondaryKey=process.env.AR_HERE_AUTOCOMPLETE_FALLBACK==='1'?readKey('HERE_API_KEY'):null;
  const n=near&&validCoord(Number(near.lat),Number(near.lng))?{lat:Number(near.lat),lng:Number(near.lng)}:null;
  const max=clamp(Number(limit)||6,1,8);
  const ck=cacheKey(q,n,max,'geoapify');
  const hit=cache.get(ck);
  if(hit&&Date.now()-hit.at<CACHE_TTL_MS)return hit.items;
  if(inflight.has(ck))return inflight.get(ck);
  const work=(async()=>{
    const result=await geoapify(q,n,max,primaryKey);
    // An empty *successful* answer is legitimate, not an excuse for a second bill.
    const items=result.ok?result.items:secondaryKey?(await here(q,n,max,secondaryKey)).items:[];
    // Only cache an authoritative primary result. Never cache a provider outage
    // as zero results or a transient exceptional HERE fallback.
    if(result.ok){
      cache.set(ck,{at:Date.now(),items});
      if(cache.size>MAX_CACHE)cache.delete(cache.keys().next().value);
    }
    return items;
  })();
  inflight.set(ck,work);
  try{return await work;}finally{inflight.delete(ck);}
}
module.exports={searchPlaces,normalizeSuggestion,normalizeGeoapify};
