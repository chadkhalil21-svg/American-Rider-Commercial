'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {markets}=require('./markets');
const {regionById}=require('./regions');
const {continuingStatus}=require('./insurance-monitoring');
const {coverageUnsafeForNewTravel}=require('./insurance-horizon');
const {screeningCurrent}=require('./screening');
const {readinessForRoute}=require('./booking-readiness');
const names=['fl-miami-dade','fl-broward','fl-palm-beach'];
for(let pass=1;pass<=2;pass++){
  for(const id of names){
    const market=markets().find(x=>x.id===id);
    assert.equal(market.status,'active');
    assert.equal(regionById(market.regionId).jurisdiction.stateCode,'FL');
    assert.equal(readinessForRoute({path:'/travel/dispatch',production:true,
      missing:['screening_provider','market_reference_store','ops_auth']}).ready,true);
    assert.equal(readinessForRoute({path:'/travel/dispatch',production:true,
      missing:['stripe_webhook_secret']}).ready,false);
  }
  assert.equal(continuingStatus({}).ok,false,'missing insurer confirmation is not approval');
  assert.equal(coverageUnsafeForNewTravel(null),true,'no insurance expiry is unsafe');
  assert.equal(screeningCurrent(null),false,'unverified individual screening is blocked');
  const server=fs.readFileSync(__dirname+'/server.js','utf8');
  assert.match(server,/function requireServedPickup/);
  assert.match(server,/screeningCurrent\(/);
  assert.match(server,/requireOperationalReadiness/);
  assert.doesNotMatch(server,/requireAdmittedPickup|admittedMarket\(|market_admission/);
}
console.log('PASS twice: configured geography and individual eligibility are independent');
