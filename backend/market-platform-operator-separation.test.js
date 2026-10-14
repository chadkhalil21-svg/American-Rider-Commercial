'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {marketFor,servesPoint}=require('./markets');
const {coverageUnsafeForNewTravel}=require('./insurance-horizon');
const {screeningCurrent}=require('./screening');
const {readinessForRoute}=require('./booking-readiness');
const locations=[{lat:25.775,lng:-80.191},{lat:26.1224,lng:-80.1373},
  {lat:26.7153,lng:-80.0534}];
for(let pass=1;pass<=2;pass++){
  for(const pickup of locations){
    assert.equal(marketFor(pickup)?.status,'active');
    assert.equal(servesPoint(pickup),true);
  }
  assert.equal(screeningCurrent(null),false);
  assert.equal(coverageUnsafeForNewTravel(null),true);
  assert.equal(readinessForRoute({path:'/create-payment-intent',production:true,
    missing:['ops_auth','screening_provider']}).ready,true);
  assert.equal(readinessForRoute({path:'/create-payment-intent',production:true,
    missing:['stripe_live_key']}).ready,false);
}
const server=fs.readFileSync(__dirname+'/server.js','utf8');
assert.doesNotMatch(server,/market_admission|admittedMarket\(|activateRegion\(/);
assert.match(server,/requireActiveOperatingMarket/);
assert.match(server,/requireServedPickup/);
console.log('PASS twice: geography, payments and individual Operator eligibility remain separate');
