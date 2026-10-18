'use strict';
const assert=require('node:assert/strict');
const { normalizeSuggestion,normalizeGeoapify,normalizePhoton,privatePhotonEndpoint,selectedPrimary,searchPlaces }=require('./place-search');
(async()=>{
  const names=['GEOAPIFY_API_KEY','HERE_API_KEY','AR_HERE_AUTOCOMPLETE_FALLBACK',
    'AR_GEOAPIFY_SEARCH_FALLBACK','AR_PLACE_SEARCH_PRIMARY','AR_PHOTON_SEARCH_URL'];
  const prev=Object.fromEntries(names.map(n=>[n,process.env[n]]));
  const fetchBefore=global.fetch;
  let calls=[];
  try{
    for(const n of names)delete process.env[n];
    assert.equal(normalizeSuggestion({title:'invalid'}),null);
    assert.equal(normalizeGeoapify({name:'invalid',lat:200,lon:0}),null);
    assert.equal(normalizeGeoapify({name:'Zoo Miami',lat:25.6,lon:-80.4}).source,'geoapify');
    const sample={type:'Feature',geometry:{type:'Point',coordinates:[-80.398,25.611]},
      properties:{osm_id:42,osm_type:'N',name:'Zoo Miami',city:'Miami',state:'Florida',
        countrycode:'US',osm_key:'tourism',osm_value:'zoo'}};
    assert.equal(normalizePhoton(sample)?.title,'Zoo Miami');
    assert.equal(normalizePhoton(sample)?.source,'photon');
    assert.equal(normalizePhoton({...sample,properties:{...sample.properties,countrycode:'GB'}}),null);
    assert.equal(normalizePhoton({...sample,geometry:{type:'Point',coordinates:[999,25.6]}}),null);
    assert.equal(normalizePhoton({...sample,properties:{...sample.properties,name:null,street:'Old Cutler Rd',housenumber:'1234',city:'Miami',countrycode:'US',osm_key:'highway'}})?.category,'address');
    assert.equal(privatePhotonEndpoint('https://photon.komoot.io'),null,'no public demo');
    assert.equal(privatePhotonEndpoint('http://nominatim.openstreetmap.org'),null,'no public OSM Nominatim');
    assert.equal(privatePhotonEndpoint('https://user:pass@internal.example'),null,'no embedded secrets');
    assert.equal(privatePhotonEndpoint('file:///etc/passwd'),null,'no local files');
    assert.equal(privatePhotonEndpoint('https://search.american-rider.example')?.pathname,'/api');
    global.fetch=async(u)=>{calls.push(String(u));throw Error('nothing configured');};
    assert.deepEqual(await searchPlaces('Dadeland',null),[]);
    assert.equal(calls.length,0,'no unconfigured paid search');

    // Reuse an EXISTING HERE account without requiring Geoapify signup.
    process.env.HERE_API_KEY='synthetic-here';
    assert.equal(selectedPrimary().name,'here');
    global.fetch=async(u)=>{calls.push(String(u));return {ok:true,json:async()=>({
      items:[{id:'here-1',title:'Dadeland Mall',resultType:'place',
        position:{lat:25.69,lng:-80.31},address:{label:'Miami'}}],
    })};};
    let results=await searchPlaces('Dadeland Mall',null);
    assert.equal(results[0]?.source,'here');
    assert.equal(calls.length,1);
    assert.match(calls[0],/autosuggest\.search\.hereapi\.com/);
    assert.equal((await searchPlaces('Dadeland Mall',null)).length,1);
    assert.equal(calls.length,1,'cache avoids an unnecessary vendor request');

    // A commissioned American Rider-controlled Photon server becomes preferred
    // for normal search. No public Photon demo is contacted or proxied.
    process.env.AR_PHOTON_SEARCH_URL='https://search.american-rider.example';
    assert.equal(selectedPrimary().name,'photon');
    global.fetch=async(u)=>{calls.push(String(u));return {ok:true,json:async()=>({
      features:[sample],
    })};};
    results=await searchPlaces('Zoo Miami',{lat:25.6,lng:-80.4});
    assert.equal(results[0]?.source,'photon');
    const photonUrl=new URL(calls.at(-1));
    assert.equal(photonUrl.hostname,'search.american-rider.example');
    assert.equal(photonUrl.pathname,'/api');
    assert.equal(photonUrl.searchParams.get('countrycode'),'US');
    assert.equal(photonUrl.searchParams.get('limit'),'6');
    assert.equal(photonUrl.searchParams.get('lat'),'25.6');
    assert.equal(photonUrl.searchParams.get('lon'),'-80.4');

    // Optional Geoapify mode remains available but is never a mandatory signup.
    process.env.AR_PLACE_SEARCH_PRIMARY='geoapify';
    assert.equal(selectedPrimary(),null,'no Geoapify key means fail closed in explicit mode');
    process.env.GEOAPIFY_API_KEY='synthetic-geo';
    assert.equal(selectedPrimary().name,'geoapify');
    delete process.env.HERE_API_KEY;
    delete process.env.AR_PHOTON_SEARCH_URL;
    process.env.AR_PLACE_SEARCH_PRIMARY='auto';
    assert.equal(selectedPrimary(),null,'auto mode never starts optional Geoapify merely because its key exists');
    process.env.HERE_API_KEY='synthetic-here';
    process.env.AR_PHOTON_SEARCH_URL='https://search.american-rider.example';
    process.env.AR_PLACE_SEARCH_PRIMARY='geoapify';
    global.fetch=async(u)=>{calls.push(String(u));return {ok:true,json:async()=>({
      results:[{place_id:'geo-1',name:'Cutler Bay',result_type:'city',
        lat:25.58,lon:-80.35,address_line2:'Miami-Dade County'}],
    })};};
    results=await searchPlaces('Cutler Bay',{lat:25.6,lng:-80.33});
    assert.equal(results[0].source,'geoapify');
    const geoUrl=new URL(calls.at(-1));
    assert.equal(geoUrl.hostname,'api.geoapify.com');
    assert.equal(geoUrl.searchParams.get('filter'),'countrycode:us');

    // No hidden second bill after a valid empty answer.
    global.fetch=async(u)=>{calls.push(String(u));return {ok:true,json:async()=>({results:[]})};};
    const before=calls.length;
    assert.deepEqual(await searchPlaces('Unknown Venue Exact q32',null),[]);
    assert.equal(calls.length,before+1);

    // Only a primary ERROR permits an opt-in backup.
    process.env.AR_GEOAPIFY_SEARCH_FALLBACK='1';
    process.env.AR_PLACE_SEARCH_PRIMARY='photon';
    let emergency=0;
    global.fetch=async(u)=>{
      calls.push(String(u));
      if(String(u).includes('search.american-rider.example'))return {ok:false,json:async()=>({})};
      emergency++;
      return {ok:true,json:async()=>({results:[{place_id:'backup',name:'South Florida',
        result_type:'city',lat:25.8,lon:-80.1}]})};
    };
    results=await searchPlaces('Photon Down New q71',null);
    assert.equal(results[0]?.source,'geoapify');
    assert.equal(emergency,1);

    // An outage must not silently fall back to HERE unless explicitly enabled.
    process.env.AR_GEOAPIFY_SEARCH_FALLBACK='0';
    process.env.AR_HERE_AUTOCOMPLETE_FALLBACK='0';
    global.fetch=async(u)=>{calls.push(String(u));return {ok:false,json:async()=>({})};};
    const now=calls.length;
    assert.deepEqual(await searchPlaces('Photon Down No Backup q52',null),[]);
    assert.equal(calls.length,now+1);
    process.env.AR_HERE_AUTOCOMPLETE_FALLBACK='1';
    let hereFallbacks=0;
    global.fetch=async(u)=>{
      calls.push(String(u));
      if(String(u).includes('search.american-rider.example'))return {ok:false,json:async()=>({})};
      hereFallbacks++;
      return {ok:true,json:async()=>({items:[{id:'here-fallback',title:'Fallback Address',
        resultType:'place',position:{lat:25.7,lng:-80.3}}]})};
    };
    results=await searchPlaces('Photon Down HERE q52',null);
    assert.equal(results[0]?.source,'here');
    for(let i=0;i<20;i++)await searchPlaces('New Photon Failure '+i,null);
    assert.equal(hereFallbacks,10,'exceptional HERE capped per instance');

    const fs=require('node:fs'),path=require('node:path');
    const screen=fs.readFileSync(path.join(__dirname,'../app/reserve.tsx'),'utf8');
    const client=fs.readFileSync(path.join(__dirname,'../src/backend/placeSearch.ts'),'utf8');
    assert.match(screen,/traveler\.searchGeoapifyCredit/);
    assert.match(screen,/traveler\.searchHereCredit/);
    assert.match(screen,/www\.openstreetmap\.org\/copyright/);
    assert.match(screen,/traveler\.mapAttribution/);
    assert.match(client,/source\?: 'geoapify' \| 'here' \| 'photon'/);
    for(const lang of ['en','es','fr','it','de']){
      const locale=fs.readFileSync(path.join(__dirname,'../src/i18n/'+lang+'.ts'),'utf8');
      assert.match(locale,/searchGeoapifyCredit:.*OpenStreetMap/);
      assert.match(locale,/searchHereCredit:.*HERE/);
    }
    assert.deepEqual(await searchPlaces('',null),[]);
    assert.deepEqual(await searchPlaces('x',null),[]);
    console.log('PASS: no mandatory Geoapify, existing HERE bridge, private Photon primary, accurate attribution, bounded opt-in fallback');
  } finally {
    for(const n of names){if(prev[n]===undefined)delete process.env[n];else process.env[n]=prev[n];}
    global.fetch=fetchBefore;
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
