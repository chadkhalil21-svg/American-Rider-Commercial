'use strict';
const assert=require('node:assert/strict');
const {verifiedHereRoute}=require('./tolls');
const {routeCar}=require('./streets');
const originalFetch=global.fetch, originalKey=process.env.HERE_API_KEY, originalOtp=process.env.OTP_URL;
const start={lat:50.1022829,lng:8.6982122};
const end={lat:50.0987800,lng:8.6875156};
const valid={routes:[{sections:[{
  summary:{length:1200,duration:180},
  polyline:'BFoz5xJ67i1B1B7PzIhaxL7Y',
  tolls:[]
}]}]};
(async()=>{
 try {
  process.env.HERE_API_KEY='here_synthetic_fixture_not_an_api_key';
  delete process.env.OTP_URL;
  let calls=0;
  global.fetch=async function(target){
   calls++;
   const url=new URL(target);
   assert.equal(url.hostname,'router.hereapi.com');
   assert.equal(url.searchParams.get('return'),'summary,tolls,polyline');
   return {ok:true,json:async()=>valid};
  };
  const routed=await routeCar(start,end,{region:{osrmUrl:null,otpUrl:null}});
  assert.equal(routed.provider,'here');
  assert.equal(routed.distanceMeters,1200);
  assert.equal(routed.durationSec,180);
  assert.equal(routed.verifiedTolls.status,'clear');
  assert.equal(routed.coords.length,4);
  assert(Math.abs(routed.coords[0].lat-start.lat)<.00002);
  assert.equal(calls,1,'no separately priced map router or duplicate toll request');
  global.fetch=async()=>({ok:true,json:async()=>({routes:[{sections:[{
    summary:{length:1200,duration:180},polyline:'bad',tolls:[]
  }]}]})});
  const fallback=await verifiedHereRoute(start,end);
  assert.equal(fallback.provider,'here');
  assert.equal(fallback.distanceMeters,1200);
  assert.equal(fallback.coords,undefined,'malformed map geometry cannot fabricate a route');
  console.log('PASS HERE-only road geometry using already configured routing/toll API; same-route totals, bad geometry safe, no live charges');
 } finally {
  global.fetch=originalFetch;
  if(originalKey===undefined)delete process.env.HERE_API_KEY;else process.env.HERE_API_KEY=originalKey;
  if(originalOtp===undefined)delete process.env.OTP_URL;else process.env.OTP_URL=originalOtp;
 }
})().catch(e=>{console.error(e);process.exitCode=1});
