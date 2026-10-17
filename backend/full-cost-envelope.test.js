'use strict';
const assert=require('node:assert/strict');
const {STANDARD_US_CENTRAL,DOUBLE_RATE_SENSITIVITY,scenario,operatingAllowanceCheck}=require('./full-cost-envelope');
const examples=[
  [100,77200,22000,0.04296],
  [300,231600,66000,0.12888],
  [500,386000,110000,0.2148],
];
for(const [n,reads,writes,usd] of examples){
  const result=scenario({simultaneousTravels:n});
  assert.equal(result.high.reads,reads);
  assert.equal(result.high.writes,writes);
  assert.equal(result.low.reads,652*n);
  assert.equal(result.low.writes,160*n);
  assert(Math.abs(result.costUsd.high-usd)<1e-10);
  assert.match(result.certification,/UNMEASURED/);
  const conservative=scenario({simultaneousTravels:n,rates:DOUBLE_RATE_SENSITIVITY});
  assert(Math.abs(conservative.costUsd.high-usd*2)<1e-10);
}
assert.equal(STANDARD_US_CENTRAL.readPer100kUsd,0.03);
const saturated=scenario({simultaneousTravels:100,documentsPerDispatchSearch:2160});
assert.equal(saturated.high.reads,502000);
assert.equal(saturated.high.writes,22000);
assert(saturated.costUsd.high>scenario({simultaneousTravels:100}).costUsd.high);
const small=scenario({simultaneousTravels:0,operatorsOnDuty:0});
assert.equal(small.high.reads,0);
assert.equal(small.costUsd.high,0);
const base=scenario({simultaneousTravels:100});
const allowance=operatingAllowanceCheck({
  scenarioResult:base,monthlyCompletedTravels:1000,monthlyHostingUsd:25,
  otherOperatingUsdPerTravel:0.10,travelFareCents:1750,platformFeeCents:250,cardCountry:'US',
});
assert.equal(allowance.economics.travelerPays,2000);
assert.equal(allowance.economics.operatingOverheadCents,25);
assert.equal(allowance.economics.platformContributionCents,114);
assert(Math.abs(allowance.infrastructureUsdPerTravel-0.1254296)<1e-10);
assert(allowance.uncommittedAllowanceUsd>0);
const expensive=operatingAllowanceCheck({
  scenarioResult:base,monthlyCompletedTravels:1000,monthlyHostingUsd:25,
  otherOperatingUsdPerTravel:0.30,
});
assert(expensive.uncommittedAllowanceUsd<0);
assert.match(expensive.caveat,/actual bills/);
assert.throws(()=>scenario({simultaneousTravels:-1}),RangeError);
assert.throws(()=>scenario({travelMinutes:0}),RangeError);
assert.throws(()=>operatingAllowanceCheck({scenarioResult:base,monthlyCompletedTravels:0}),RangeError);
console.log('PASS modeled 100/300/500 simultaneous Travels, saturated dispatch, rate sensitivity, fee allowance and rejection guards; NO live cost/throughput certification');
