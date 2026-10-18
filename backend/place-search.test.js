'use strict';
const assert=require('node:assert/strict');
const { normalizeSuggestion,normalizePhoton,privatePhotonEndpoint,selectedPrimary,searchPlaces,annotateProximity }=require('./place-search');
(async()=>{
  const names=['HERE_API_KEY','AR_HERE_AUTOCOMPLETE_FALLBACK','AR_PLACE_SEARCH_PRIMARY','AR_PHOTON_SEARCH_URL','AR_PHOTON_PRIVATE_VPC','GEOAPIFY_API_KEY'];
  const prev=Object.fromEntries(names.map(n=>[n,process.env[n]]));
  const fetchBefore=global.fetch;
  let calls=[];
  try{
    for(const n of names)delete process.env[n];
    assert.equal(normalizeSuggestion({title:'invalid'}),null);
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
    assert.equal(privatePhotonEndpoint('http://10.84.0.10:2322'),null,
      'plain HTTP requires explicit VPC authorization');
    process.env.AR_PHOTON_PRIVATE_VPC='1';
    const internal=privatePhotonEndpoint('http://10.84.0.10:2322');
    assert.equal(internal?.pathname,'/api');
    assert.equal(internal?.hostname,'10.84.0.10');
    assert.equal(privatePhotonEndpoint('http://169.254.169.254:2322'),null);
    assert.equal(privatePhotonEndpoint('http://127.0.0.1:2322'),null);
    assert.equal(privatePhotonEndpoint('http://10.84.0.10:8080'),null);
    delete process.env.AR_PHOTON_PRIVATE_VPC;
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

    // The founder rejected Geoapify, even a configured key cannot use it.
    process.env.GEOAPIFY_API_KEY='synthetic-geo';
    process.env.AR_PLACE_SEARCH_PRIMARY='geoapify';
    assert.equal(selectedPrimary(),null,'unapproved provider is rejected');
    process.env.AR_PLACE_SEARCH_PRIMARY='auto';
    assert.equal(selectedPrimary().name,'photon','private Photon remains primary');
    // Both local and distant results remain searchable but distant labels
    // must not masquerade as a nearby business.
    const marked=annotateProximity([
      {title:'Zoo Miami',subtitle:'Miami, Florida',lat:25.611,lng:-80.398},
      {title:'Zoo Miami',subtitle:'San Francisco, California',lat:37.77,lng:-122.42},
    ],{lat:25.61,lng:-80.40});
    assert.equal(marked[0].outsideLocalArea,false);
    assert.equal(marked[1].outsideLocalArea,true);
    assert.equal(marked[1].subtitle,'San Francisco, California');
    assert.ok(marked[1].distanceKm > 250,'distance is provided for localized remote labels');
    assert.equal(marked.length,2,'national destinations remain discoverable');

    // No hidden second bill after a valid empty answer.
    global.fetch=async(u)=>{calls.push(String(u));return {ok:true,json:async()=>({features:[]})};};
    const before=calls.length;
    assert.deepEqual(await searchPlaces('Unknown Venue Exact q32',null),[]);
    assert.equal(calls.length,before+1);

    // Only a real Photon outage can invoke explicitly enabled HERE.
    // An outage must not silently fall back to HERE unless explicitly enabled.
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
    assert.doesNotMatch(screen,/traveler\.searchGeoapifyCredit/);
    assert.match(screen,/traveler\.searchFartherAway/);
    assert.match(screen,/traveler\.searchHereCredit/);
    assert.match(screen,/www\.openstreetmap\.org\/copyright/);
    assert.match(screen,/traveler\.mapAttribution/);
    assert.match(client,/source\?: 'here' \| 'photon'/);
    assert.match(client,/export function uniqueNearbyExactPlace/);
    assert.match(client,/matches\.length !== 1/,'ambiguous business names cannot auto-select');
    assert.match(client,/km <= 250 \? only : null/,'remote national business cannot auto-select');
    assert.match(screen,/uniqueNearbyExactPlace\(place\.name, options, anchor\)/);
    assert.doesNotMatch(screen,/options\.find\(\(item\) => normalize\(item\.title\)/);

    for(const lang of ['en','es','fr','it','de']){
      const locale=fs.readFileSync(path.join(__dirname,'../src/i18n/'+lang+'.ts'),'utf8');
      assert.doesNotMatch(locale,/searchGeoapifyCredit:/);
      assert.match(locale,/searchHereCredit:.*HERE/);
      assert.match(locale,/searchFartherAway:/);
    }
    assert.deepEqual(await searchPlaces('',null),[]);
    assert.deepEqual(await searchPlaces('x',null),[]);
    console.log('PASS: no Geoapify code path, existing HERE bridge, national Photon location labels, accurate attribution and bounded fallback');
  } finally {
    for(const n of names){if(prev[n]===undefined)delete process.env[n];else process.env[n]=prev[n];}
    global.fetch=fetchBefore;
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
