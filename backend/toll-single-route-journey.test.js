'use strict';
// Entirely synthetic integration test: an OSRM route and a HERE route for the
// same endpoints can differ. Never quote OSRM miles with separate HERE tolls.
const assert=require('node:assert/strict');
const Module=require('node:module'),load=Module._load;
let verifiedCalls=0,localCalls=0,routeMode='unmatched',hereAvailable=true;
const ourRoute={provider:'osrm',distanceMeters:3200,durationSec:420};
const hereRoute={provider:'here',distanceMeters:4800,durationSec:630,
  verifiedTolls:{status:'tolled',tollCents:175,provider:'here'}};
const mocks={
 './payments':{quote:(fare,j,g,c,toll)=>({travelerPays:fare+toll+250,appFee:250,tollCents:toll,operatorGets:fare-100+toll,platformTake:350,passThroughCents:toll})},
 './fares':{fareCentsForCoords:(_a,_b,m)=>({travelCostCents:Math.round((m?.routedMiles||0)*1000),miles:m?.routedMiles||0,minutes:m?.routedMinutes||0,timedBy:'route'}),applyTravelClass:v=>v,normalizeTravelClassKey:()=> 'standard'},
 './market':{outsideMarket:()=>null,outsideMarketMessage:()=>''},
 './fees':{governmentFeesFor:()=>[],permitRequired:()=>null,permitRequiredMessage:()=>''},
 './tolls':{
   resolveTollsCostAware:async (_a,_b,{route})=>{
     localCalls++;
     if(route?.provider==='here')return route.verifiedTolls;
     if(routeMode==='certified')return {status:'clear',tollCents:0,provider:'official'};
     return {status:'unknown',tollCents:null,reason:'unmatched_toll_route'};
   },
   verifiedHereRoute:async()=>{verifiedCalls++;return hereAvailable?hereRoute:null;}
 },
 './streets':{routeCar:async()=>ourRoute},
 './market-reference-authority':{referenceForQuote:async()=>({ok:false,reason:'no reference'})},
 './market-reference-fare':{fareForMarketTarget:()=>{throw Error('should not calibrate without reference')},controlledTargetFromAllIn:()=>null}
};
Module._load=function(request,parent,isMain){
 if(parent?.filename?.endsWith('/backend/fareauthority.js')&&Object.prototype.hasOwnProperty.call(mocks,request))return mocks[request];
 return load.apply(this,arguments);
};
let authority;
try{authority=require('./fareauthority');}finally{Module._load=load;}
const body={pickup:{lat:25.7617,lng:-80.1918},dest:{lat:25.7701,lng:-80.1468}};
(async()=>{
  const one=await authority.authoritativeFare({body});
  assert.equal(one.routeProvider,'here','unmatched OSRM tolls must not attach to its Fare');
  assert.equal(one.tollCents,175);
  assert.equal(one.pricedBy,'routed-distance');
  assert.equal(one.miles,hereRoute.distanceMeters/1609.344,'Fare uses the same HERE response as the toll');
  assert.equal(verifiedCalls,1);
  routeMode='certified';
  const two=await authority.authoritativeFare({body});
  assert.equal(two.routeProvider,'osrm','certified original route should not spend on HERE');
  assert.equal(two.tollCents,0);
  assert.equal(verifiedCalls,1);
  routeMode='unmatched';hereAvailable=false;
  const three=await authority.authoritativeFare({body});
  assert.equal(three.tollStatus,'unknown','unverified physical route tolls must fail closed');
  assert.equal(three.tollCents,0,'unverified amount must never become a collected toll; API blocks tollStatus unknown');
  assert.equal(three.routeProvider,'osrm');
  assert.ok(localCalls>=3);
  console.log('PASS: HERE fallback uses its own miles/time/toll, certified local route saved, unknown toll never billed');
})().catch(e=>{console.error(e);process.exitCode=1;});
