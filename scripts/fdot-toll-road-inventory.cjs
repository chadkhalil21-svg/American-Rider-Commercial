#!/usr/bin/env node
'use strict';
// Read-only FDOT road-geometry intake. Never authorizes toll prices, billing, or "toll-free".
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const OFFICIAL_URL='https://gis.fdot.gov/arcgis/rest/services/RCI_Layers/FeatureServer/24/query';
function params(offset,limit) {
  const p=new URLSearchParams({
    where:'1=1',
    outFields:'OBJECTID,ROADWAY,ROUTE,LOCALNAM,TOLL_ROAD_,TOLLFLG,COUNTY,COUNTYDOT',
    returnGeometry:'true', outSR:'4326', f:'geojson', orderByFields:'OBJECTID ASC',
    resultOffset:String(offset), resultRecordCount:String(limit)
  });
  return OFFICIAL_URL+'?'+p;
}
function validFeature(f) {
  return f?.type==='Feature' && Number.isInteger(Number(f?.properties?.OBJECTID)) &&
    ['LineString','MultiLineString'].includes(f?.geometry?.type) &&
    Array.isArray(f?.geometry?.coordinates) && f.geometry.coordinates.length>0;
}
async function retrieve({fetchImpl=fetch,pageSize=500,maxPages=40}={}) {
  if(!Number.isInteger(pageSize)||pageSize<1||pageSize>1000)throw Error('pageSize out of range');
  let rows=[],seen=new Set(),fetched=0;
  for(let p=0;p<maxPages;p++){
    const response=await fetchImpl(params(p*pageSize,pageSize),{headers:{Accept:'application/geo+json'},signal:AbortSignal.timeout(20000)});
    if(!response?.ok)throw Error('FDOT source unavailable; do not infer no toll roads');
    const data=await response.json();
    if(data?.type!=='FeatureCollection'||!Array.isArray(data.features))throw Error('Invalid FDOT GeoJSON; refuse partial inventory');
    for(const f of data.features){
      if(!validFeature(f))throw Error('Malformed FDOT geometry; refuse partial inventory');
      const id=Number(f.properties.OBJECTID);
      if(seen.has(id))throw Error('Duplicate FDOT object across pages');
      seen.add(id);rows.push(f);
    }
    fetched++;
    if(data.features.length<pageSize){
      rows.sort((a,b)=>Number(a.properties.OBJECTID)-Number(b.properties.OBJECTID));
      const json=JSON.stringify({type:'FeatureCollection',features:rows});
      return {dataset:{type:'FeatureCollection',features:rows},
        manifest:{source:OFFICIAL_URL.replace('/query',''),retrievedAt:new Date().toISOString(),
          records:rows.length,pages:fetched,sha256:crypto.createHash('sha256').update(json).digest('hex'),
          status:'ROAD-LOCATION-DISCOVERY-ONLY',certifiedGantryCoverage:false,
          verifiedMoneyRates:false,permittedForTravelerTollPricing:false}};
    }
  }
  throw Error('FDOT pagination cap reached; refuse partial inventory');
}
if(require.main===module){
  (async()=>{
    const outputIndex=process.argv.indexOf('--output');
    if(outputIndex<0||!process.argv[outputIndex+1])throw Error('Specify --output <path> for a private review artifact');
    const out=path.resolve(process.argv[outputIndex+1]);
    const {dataset,manifest}=await retrieve();
    fs.mkdirSync(path.dirname(out),{recursive:true});
    fs.writeFileSync(out,JSON.stringify({manifest,data:dataset})+'\n',{flag:'wx'});
    process.stdout.write('FDOT toll-road ROAD GEOMETRY review artifact created (NOT monetary rates): '+JSON.stringify(manifest)+'\n');
  })().catch(e=>{console.error(String(e));process.exitCode=1;});
}
module.exports={OFFICIAL_URL,params,validFeature,retrieve};
