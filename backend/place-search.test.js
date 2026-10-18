'use strict';
const assert=require('node:assert/strict');
const { normalizeSuggestion,normalizeGeoapify,searchPlaces }=require('./place-search');
(async()=>{
const prev={geo:process.env.GEOAPIFY_API_KEY,here:process.env.HERE_API_KEY,
 fallback:process.env.AR_HERE_AUTOCOMPLETE_FALLBACK,fetch:global.fetch};
try{
  const old=normalizeSuggestion({id:'x',title:'Dadeland Mall',resultType:'place',
    position:{lat:25.69,lng:-80.31},address:{label:'Miami'}});
  assert.equal(old.title,'Dadeland Mall');
  assert.equal(normalizeSuggestion({title:'bad'}),null);
  assert.equal(normalizeGeoapify({place_id:'z',name:'Zoo Miami',result_type:'amenity',
    lat:25.611,lon:-80.398,address_line2:'Miami, FL'}).category,'place');
  assert.equal(normalizeGeoapify({name:'bad',lat:100,lon:-80}),null);
  delete process.env.GEOAPIFY_API_KEY;
  process.env.HERE_API_KEY='synthetic-here';
  process.env.AR_HERE_AUTOCOMPLETE_FALLBACK='1';
  let calls=[];
  global.fetch=async(u)=>{calls.push(String(u));throw Error('no provider should be contacted');};
  assert.deepEqual(await searchPlaces('Dadeland',null),[],'without primary credentials fail closed');
  assert.equal(calls.length,0,'legacy HERE must never be the primary again');
  process.env.GEOAPIFY_API_KEY='synthetic-geo';
  const responder={ok:true,results:[{place_id:'geo-1',name:'Cutler Bay',result_type:'city',
    lat:25.580,lon:-80.350,address_line2:'Miami-Dade County'}]};
  global.fetch=async(u)=>{calls.push(String(u));return {ok:true,json:async()=>responder};};
  let x=await searchPlaces('Cutler B', {lat:25.6,lng:-80.33});
  assert.equal(x[0]?.title,'Cutler Bay');
  assert.equal(x[0]?.category,'locality');
  assert.equal(x[0]?.source,'geoapify');
  assert.equal(calls.length,1);
  const geo=new URL(calls[0]);
  assert.equal(geo.host,'api.geoapify.com');
  assert.equal(geo.searchParams.get('filter'),'countrycode:us');
  assert.equal(geo.searchParams.get('bias'),'proximity:-80.33,25.6');
  assert.equal(await searchPlaces('Cutler B',{lat:25.6,lng:-80.33}).then(z=>z.length),1);
  assert.equal(calls.length,1,'cache avoids duplicate vendor fees');
  // Empty valid result must not trigger a HERE call.
  global.fetch=async(u)=>{calls.push(String(u));return {ok:true,json:async()=>({results:[]})};};
  assert.deepEqual(await searchPlaces('NoSuchExactPlaceQ',null),[]);
  assert.equal(calls.length,2);
  // Provider outage triggers the *explicit* HERE fallback only.
  global.fetch=async(u)=>{
    const url=new URL(String(u));calls.push(url.href);
    if(url.host==='api.geoapify.com')return {ok:false,json:async()=>({})};
    if(url.host==='autosuggest.search.hereapi.com')return {ok:true,json:async()=>({
      items:[{id:'here-x',title:'South Florida',resultType:'locality',
      position:{lat:25.8,lng:-80.1}}]})};
    throw Error('unapproved provider '+url.host);
  };
  const secondary=await searchPlaces('South FL outage',null);
  assert.equal(secondary[0]?.title,'South Florida');
  assert.equal(secondary[0]?.source,'here');
  assert.equal(calls.filter(u=>u.includes('hereapi.com')).length,1);
  for(let i=0;i<24;i++)await searchPlaces('provider outage unique '+i,null);
  assert.equal(calls.filter(u=>u.includes('hereapi.com')).length,10,
    'even exceptional HERE fallback is capped at ten calls per minute per instance');
  process.env.AR_HERE_AUTOCOMPLETE_FALLBACK='0';
  assert.deepEqual(await searchPlaces('South FL outage disabled',null),[]);
  assert.equal(calls.filter(u=>u.includes('hereapi.com')).length,10,
    'HERE off means no hidden usage');
  const fs=require('node:fs'),path=require('node:path');
  const screen=fs.readFileSync(path.join(__dirname,'../app/reserve.tsx'),'utf8');
  assert.match(screen,/Powered by Geoapify/,'destination and pickup search must show provider attribution');
  assert.match(screen,/© OpenStreetMap contributors/,'underlying OSM data requires attribution');
  assert.match(screen,/Powered by HERE/,'rare fallback must be attributed honestly');
  assert.deepEqual(await searchPlaces('',null),[]);
  assert.deepEqual(await searchPlaces('a',null),[]);
}finally{
  for(const [name,key] of [['GEOAPIFY_API_KEY','geo'],['HERE_API_KEY','here'],['AR_HERE_AUTOCOMPLETE_FALLBACK','fallback']]){
    if(prev[key]===undefined)delete process.env[name];else process.env[name]=prev[key];
  }
  global.fetch=prev.fetch;
}
console.log('PASS: commercial primary, bounded cache, opt-in outage-only HERE fallback, no provider when unconfigured');
})().catch(e=>{console.error(e);process.exitCode=1;});
